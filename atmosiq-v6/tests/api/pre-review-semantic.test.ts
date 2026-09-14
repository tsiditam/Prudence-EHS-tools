/**
 * /api/pre-review-semantic — the generation boundary.
 *
 * The endpoint asks a provider for CANDIDATE JSON and returns it. It never
 * returns an IntegrityFinding, and the point of that is not tidiness: the
 * model-output schema and the internal trusted representation are different
 * types BECAUSE the difference is the trust boundary. A candidate becomes a
 * finding in one place only — the client validator, against the same package
 * the reviewer was given — and only by having every quote and identifier
 * resolved rather than believed.
 *
 * So this suite pins three things about the boundary:
 *   • what it returns is the provider's object verbatim, unpromoted;
 *   • provider failure of EVERY kind is a technical status and never a
 *     statement about the report;
 *   • the run is released rather than charged when nothing was produced.
 *
 * It replaces a suite that tested the opposite contract — SSE frames of
 * unvalidated issues, a three-tier severity with `blocking` at the top,
 * and a `slimAssessment` that built its own payload shape. All three were
 * removed deliberately; see the handler header.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

type Generation = { id: number; user_id: string; generated_at: string; generation_type: string; input_tokens?: number | null; output_tokens?: number | null }
const generations: Generation[] = []
let nextGenerationId = 1
let nextUser: { id: string; email: string } | null = null
let nextProfile: { plan: string } | null = null
let nextAuthError: Error | null = null

function resetState() {
  generations.length = 0
  nextGenerationId = 1
  nextUser = { id: 'user-1', email: 'tester@example.com' }
  nextProfile = { plan: 'pro' }
  nextAuthError = null
}

function makeSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn(async (_token: string) => {
        if (nextAuthError) return { data: { user: null }, error: nextAuthError }
        return { data: { user: nextUser }, error: null }
      }),
    },
    from: (table: string) => {
      const ctx: { isCount: boolean; filters: Record<string, unknown>; gte: { col: string; val: string } | null; insertedId: number | null; patch: Record<string, unknown> | null; isDelete: boolean } = {
        isCount: false, filters: {}, gte: null, insertedId: null, patch: null, isDelete: false,
      }
      const chain: Record<string, unknown> = {}
      const chainable: Record<string, (...args: unknown[]) => unknown> = {
        select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts && opts.count === 'exact') ctx.isCount = true
          return chain
        },
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return chain },
        gte: (col: string, val: string) => { ctx.gte = { col, val }; return chain },
        order: () => chain, limit: () => chain,
        single: async () => {
          if (table === 'profiles') return { data: nextProfile, error: null }
          if (ctx.insertedId != null) return { data: { id: ctx.insertedId }, error: null }
          return { data: null, error: null }
        },
        // Reservation pattern (api/_rate-limit.js): insert().select('id').single()
        // reserves; update().eq('id') finalizes; delete().eq('id') releases.
        insert: (row: Record<string, unknown>) => {
          const id = nextGenerationId++
          generations.push({
            id,
            user_id: String(row.user_id || ''),
            generated_at: new Date().toISOString(),
            generation_type: String(row.generation_type || ''),
            input_tokens: (row.input_tokens as number) ?? null,
            output_tokens: (row.output_tokens as number) ?? null,
          })
          ctx.insertedId = id
          return chain
        },
        update: (patch: Record<string, unknown>) => { ctx.patch = patch; return chain },
        delete: () => { ctx.isDelete = true; return chain },
        then: (resolve: (v: unknown) => void) => {
          if (ctx.patch && table === 'narrative_generations') {
            const g = generations.find((x) => x.id === ctx.filters.id)
            if (g) Object.assign(g, ctx.patch)
            return resolve({ data: null, error: null })
          }
          if (ctx.isDelete && table === 'narrative_generations') {
            const i = generations.findIndex((x) => x.id === ctx.filters.id)
            if (i >= 0) generations.splice(i, 1)
            return resolve({ data: null, error: null })
          }
          if (ctx.isCount && table === 'narrative_generations') {
            const sinceMs = ctx.gte ? Date.parse(ctx.gte.val) : 0
            const count = generations.filter((g) =>
              g.user_id === ctx.filters.user_id &&
              (ctx.filters.generation_type === undefined || g.generation_type === ctx.filters.generation_type) &&
              Date.parse(g.generated_at) >= sinceMs,
            ).length
            return resolve({ count, error: null })
          }
          return resolve({ data: null, error: null })
        },
      }
      Object.assign(chain, chainable)
      return chain
    },
  }
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonBody: null as unknown,
    written: '',
    status(c: number) { this.statusCode = c; return this },
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    json(body: unknown) { this.jsonBody = body },
    write(chunk: string) { this.written += chunk },
    end() {},
  }
}

interface SemanticTestHooks {
  setSupabase(s: ReturnType<typeof makeSupabaseMock>): void
  setFetch(f: typeof fetch): void
  reset(): void
  MAX_INPUT_BYTES: number
  GENERATION_TYPE: string
  PROVIDER: string
  MODEL: string
}
interface SemanticModule {
  (req: unknown, res: ReturnType<typeof makeRes>): Promise<void>
  __test: SemanticTestHooks
}

async function loadHandler(): Promise<SemanticModule> {
  vi.resetModules()
  const mod = (await import('../../api/pre-review-semantic.js')) as {
    default: (req: unknown, res: unknown) => Promise<void>
    __test: SemanticTestHooks
  }
  const fn = mod.default as unknown as SemanticModule
  fn.__test = mod.__test
  return fn
}

const PKG = () => ({
  package_version: 1,
  report_fingerprint: 'fp-abc123',
  sections: [{ section_id: 'discussion', section_name: 'Discussion', text: 'The reading was 1385 ppm.' }],
  structured_facts: { zones: [], findings: [], recommendations: [], limitations: [], instruments: [], references: [] },
  reference_context: [],
  deterministic_findings: [],
})

const post = (pkg: unknown = PKG()) => ({
  method: 'POST',
  headers: { authorization: 'Bearer t' },
  body: { package: pkg },
})

/** A provider reply carrying `text` as its content. */
const replyWith = (text: string, usage = { input_tokens: 10, output_tokens: 5 }) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text }], usage }),
})

const CANDIDATE = {
  issues: [{
    semantic_rule: 'cross_section_contradiction',
    issue_type: 'contradiction',
    severity: 'warning',
    primary: { section_id: 'discussion', quote: 'The reading was 1385 ppm.' },
    comparison: { section_id: 'executive_summary', quote: 'something else' },
    explanation: 'The two passages give different values.',
  }],
}

async function ready() {
  const handler = await loadHandler()
  handler.__test.setSupabase(makeSupabaseMock())
  return handler
}

describe('the request contract', () => {
  beforeEach(() => { resetState(); process.env.ANTHROPIC_API_KEY = 'test-key' })

  it('GET is refused', async () => {
    const handler = await ready()
    const res = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('an unauthenticated POST is refused before anything is sent anywhere', async () => {
    const handler = await ready()
    const res = makeRes()
    let called = false
    handler.__test.setFetch((async () => { called = true }) as unknown as typeof fetch)
    await handler({ method: 'POST', headers: {}, body: { package: PKG() } }, res)
    expect(res.statusCode).toBe(401)
    expect(called).toBe(false)
  })

  it('refuses a missing or empty package rather than reviewing nothing', async () => {
    const handler = await ready()
    for (const [body, err] of [
      [{}, 'missing_package'],
      [{ package: [] }, 'missing_package'],
      [{ package: { sections: [] } }, 'empty_package'],
    ] as Array<[Record<string, unknown>, string]>) {
      const res = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res)
      expect(res.statusCode, err).toBe(400)
      expect((res.jsonBody as { error: string }).error).toBe(err)
    }
  })

  it('refuses an oversized package', async () => {
    const handler = await ready()
    const res = makeRes()
    const big = PKG()
    big.sections = [{ section_id: 'd', section_name: 'D', text: 'x'.repeat(handler.__test.MAX_INPUT_BYTES + 1) }]
    await handler(post(big), res)
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error: string }).error).toBe('package_too_large')
  })
})

describe('what it returns is a candidate, not a finding', () => {
  beforeEach(() => { resetState(); process.env.ANTHROPIC_API_KEY = 'test-key' })

  it('returns the provider object verbatim under `candidates`', async () => {
    const handler = await ready()
    handler.__test.setFetch(replyWith(JSON.stringify(CANDIDATE)) as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    const body = res.jsonBody as { status: string; candidates: unknown }
    expect(res.statusCode).toBe(200)
    expect(body.status).toBe('completed')
    // Verbatim: not reshaped, filtered, sorted or repaired. The validator is
    // written to reject what is malformed; a handler that tidied first would
    // be deciding what the validator gets to see.
    expect(body.candidates).toEqual(CANDIDATE)
  })

  it('never emits an IntegrityFinding shape', async () => {
    const handler = await ready()
    handler.__test.setFetch(replyWith(JSON.stringify(CANDIDATE)) as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    const json = JSON.stringify(res.jsonBody)
    // The contract's own field names. Their presence would mean the endpoint
    // had promoted a candidate on the side of the wire that cannot check it.
    for (const key of ['"detector"', '"source_layer"', '"actionability"', '"why_it_matters"', '"identity"']) {
      expect(json, key).not.toContain(key)
    }
  })

  it('carries provider and model as provenance, and the prompt version with them', async () => {
    const handler = await ready()
    handler.__test.setFetch(replyWith(JSON.stringify(CANDIDATE)) as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    const p = (res.jsonBody as { provenance: Record<string, unknown> }).provenance
    expect(p.provider).toBe(handler.__test.PROVIDER)
    expect(p.model).toBe(handler.__test.MODEL)
    expect(p.prompt_version).toBe(1)
    expect(p.report_fingerprint).toBe('fp-abc123')
  })

  it('passes the package through to the provider and nothing else about the user', async () => {
    const handler = await ready()
    let sent: Record<string, unknown> = {}
    handler.__test.setFetch((async (_u: string, init: { body: string }) => {
      sent = JSON.parse(init.body)
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"issues":[]}' }], usage: {} }) }
    }) as unknown as typeof fetch)
    await handler(post(), makeRes())
    const content = String((sent.messages as Array<{ content: string }>)[0].content)
    expect(content).toContain('fp-abc123')
    expect(content).not.toContain('tester@example.com')
    expect(content).not.toContain('user-1')
  })

  it('an empty review is a completed review, not a failure', async () => {
    const handler = await ready()
    handler.__test.setFetch(replyWith('{"issues":[]}') as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    const body = res.jsonBody as { status: string; candidates: { issues: unknown[] } }
    expect(body.status).toBe('completed')
    expect(body.candidates.issues).toEqual([])
  })
})

describe('provider failure is technical, and never a mark against the report', () => {
  beforeEach(() => { resetState(); process.env.ANTHROPIC_API_KEY = 'test-key' })

  const FAILURES: Array<[string, () => unknown]> = [
    ['unreachable', () => { throw new Error('ECONNRESET') }],
    ['timed_out', () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e }],
    ['upstream_error', () => ({ ok: false, status: 503, text: async () => 'overloaded' })],
    ['unreadable', () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } })],
    ['unparseable', () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'I am sorry, I cannot.' }], usage: {} }) })],
  ]

  for (const [reason, impl] of FAILURES) {
    it(`${reason} → 200 unavailable, no candidates, no finding`, async () => {
      const handler = await ready()
      handler.__test.setFetch((async () => impl()) as unknown as typeof fetch)
      const res = makeRes()
      await handler(post(), res)
      const body = res.jsonBody as Record<string, unknown>
      // 200: the REQUEST was handled correctly. The review simply did not
      // happen, and that is not something the report did.
      expect(res.statusCode).toBe(200)
      expect(body.status).toBe('unavailable')
      expect(body.reason).toBe(reason)
      expect(body.candidates).toBeUndefined()
      // Nothing resembling a defect in the document.
      expect(JSON.stringify(body)).not.toMatch(/severity|advisory|warning|issue/i)
    })
  }

  it('a missing API key reports unavailable rather than a server error', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const handler = await ready()
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { reason: string }).reason).toBe('not_configured')
  })

  it('never relays the upstream body, which can carry provider detail', async () => {
    const handler = await ready()
    handler.__test.setFetch((async () => ({ ok: false, status: 500, text: async () => 'org_id=acct_secret internal trace' })) as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    expect(JSON.stringify(res.jsonBody)).not.toContain('acct_secret')
  })

  it('releases the reserved run when nothing was produced, and keeps it when something was', async () => {
    const handler = await ready()
    handler.__test.setFetch((async () => ({ ok: false, status: 503, text: async () => '' })) as unknown as typeof fetch)
    await handler(post(), makeRes())
    // A review that did not happen does not spend the assessor's budget.
    expect(generations.filter((g) => g.generation_type === 'pre_review_semantic')).toHaveLength(0)

    handler.__test.setFetch(replyWith('{"issues":[]}') as unknown as typeof fetch)
    await handler(post(), makeRes())
    expect(generations.filter((g) => g.generation_type === 'pre_review_semantic')).toHaveLength(1)
  })
})

describe('the rate limit still holds', () => {
  beforeEach(() => { resetState(); process.env.ANTHROPIC_API_KEY = 'test-key' })

  it('429s past the per-minute budget without calling the provider', async () => {
    const handler = await ready()
    handler.__test.setFetch(replyWith('{"issues":[]}') as unknown as typeof fetch)
    for (let i = 0; i < 10; i++) await handler(post(), makeRes())
    let called = false
    handler.__test.setFetch((async () => { called = true; return { ok: true, status: 200, json: async () => ({}) } }) as unknown as typeof fetch)
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(429)
    expect(called).toBe(false)
    expect(res.headers['retry-after']).toBeTruthy()
  })
})
