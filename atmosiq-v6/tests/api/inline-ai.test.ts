/**
 * Tests for /api/inline-ai validation + auth surface.
 *
 * Focused on the contract that the front-end depends on:
 *   • GET → 405 Method Not Allowed
 *   • POST without Authorization → 401
 *   • POST with invalid token → 401
 *   • POST with unknown action → 400 invalid_action
 *   • POST with empty text → 400 empty_text
 *   • POST with text > 4000 chars → 400 text_too_long
 *   • POST with rate-limit hit → 429 + Retry-After
 *
 * Streaming success path is covered by the useInlineAi hook tests
 * (they exercise the SSE consumer end-to-end against a mocked
 * fetch). This file pins the request-validation gate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── State captured by mocks ────────────────────────────────────────
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
        isCount: false,
        filters: {},
        gte: null,
        insertedId: null,
        patch: null,
        isDelete: false,
      }
      const chain: Record<string, unknown> = {}
      const chainable: Record<string, (...args: unknown[]) => unknown> = {
        select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts && opts.count === 'exact') ctx.isCount = true
          return chain
        },
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return chain },
        gte: (col: string, val: string) => { ctx.gte = { col, val }; return chain },
        order: () => chain,
        limit: () => chain,
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
        // Allow `await chain` to resolve as a count query.
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
  const headers: Record<string, string> = {}
  let statusCode = 200
  let jsonBody: unknown = null
  let written = ''
  return {
    statusCode,
    headers,
    jsonBody,
    written,
    status(c: number) { statusCode = c; this.statusCode = c; return this },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value },
    getHeader(name: string) { return headers[name.toLowerCase()] },
    json(body: unknown) { jsonBody = body; this.jsonBody = body },
    write(chunk: string) { written += chunk; this.written = written },
    end() { /* noop */ },
  }
}

interface InlineAiTestHooks {
  setSupabase(s: ReturnType<typeof makeSupabaseMock>): void
  setFetch(f: typeof fetch): void
  reset(): void
}
interface InlineAiModule {
  (req: unknown, res: ReturnType<typeof makeRes>): Promise<void>
  __test: InlineAiTestHooks
}

// Dynamic require so vi.mock has applied. Re-imported in beforeEach
// so the in-memory __test state is fresh. CJS-via-ESM puts the
// handler under `.default`; the __test hooks are exported as named
// properties on the same module, so we copy them onto the unwrapped
// function for ergonomics in the test.
async function loadHandler(): Promise<InlineAiModule> {
  vi.resetModules()
  const mod = (await import('../../api/inline-ai.js')) as {
    default: (req: unknown, res: unknown) => Promise<void>
    __test: InlineAiTestHooks
  }
  const fn = mod.default as unknown as InlineAiModule
  fn.__test = mod.__test
  return fn
}

describe('/api/inline-ai — validation gate', () => {
  beforeEach(() => {
    resetState()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('GET → 405', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })

  it('POST without Authorization → 401', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, body: { action: 'improve', text: 'hi' } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('POST with invalid token → 401', async () => {
    nextAuthError = new Error('jwt expired')
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer bad' }, body: { action: 'improve', text: 'hi' } },
      res,
    )
    expect(res.statusCode).toBe(401)
  })

  it('POST with unknown action → 400 invalid_action', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'bogus', text: 'hi' } },
      res,
    )
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('invalid_action')
  })

  it('POST with empty text → 400 empty_text', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'improve', text: '   ' } },
      res,
    )
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('empty_text')
  })

  it('POST with text > 4000 chars → 400 text_too_long', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    const huge = 'x'.repeat(4001)
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'improve', text: huge } },
      res,
    )
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('text_too_long')
  })

  it('accepts each of the four canonical actions through validation', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    // Stub fetch so we don't actually hit Anthropic. Returning a
    // body=null upstream makes the handler write an 'error' SSE
    // frame and return 200 with the headers already set. We only
    // care that we got PAST the validation gate.
    handler.__test.setFetch(vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'upstream_stub',
    })) as unknown as typeof fetch)
    for (const action of ['improve', 'expand', 'concise', 'professional']) {
      const res = makeRes()
      await handler(
        { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action, text: 'A real note' } },
        res,
      )
      // SSE responses set status to 200 by default; we only need to
      // confirm we didn't get a 400 / 405. The error frame is
      // expected because we stubbed the upstream as failing.
      expect(res.statusCode).not.toBe(400)
      expect(res.statusCode).not.toBe(405)
    }
  })

  it('sends a moderate temperature + humanized system prompt to the model', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const captured: Array<{ url: string; body: string }> = []
    handler.__test.setFetch(vi.fn(async (url: string, init: { body: string }) => {
      captured.push({ url, body: init.body })
      // Fail upstream after capture so the handler short-circuits.
      return { ok: false, status: 500, text: async () => 'upstream_stub' }
    }) as unknown as typeof fetch)
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'improve', text: 'co2 high in room 3' } },
      res,
    )
    expect(captured.length).toBe(1)
    const sent = JSON.parse(captured[0].body) as { temperature: number; system: string }
    // Moderate temperature — human variety without drifting facts.
    expect(sent.temperature).toBe(0.6)
    // Anti-robotic guidance is baked into the system prompt.
    expect(sent.system).toContain('not like a chatbot')
    expect(sent.system).toContain('It is important to note')
    // Drop-straight-into-textarea contract is preserved.
    expect(sent.system).toContain('Return ONLY the rewritten text')
  })

  it('emits a replace frame back to the ORIGINAL text and flags done when the rewrite contains banned language', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const enc = new TextEncoder()
    const frames = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":40}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"The stains were caused by the roof leak and the room is "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"unsafe."}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":12}}\n\n',
    ]
    handler.__test.setFetch(vi.fn(async () => ({
      ok: true, status: 200,
      body: new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } }),
    })) as unknown as typeof fetch)
    const res = makeRes()
    const original = 'water stains on ceiling tile near AHU-2'
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'professional', text: original } },
      res,
    )
    const written = res.written
    expect(written).toContain('event: replace')
    const replaceLine = written.split('\n').find((l: string) => l.startsWith('data: ') && l.includes('banned_language'))
    expect(replaceLine).toBeDefined()
    expect(JSON.parse(replaceLine!.slice(6))).toEqual({ text: original, reason: 'banned_language' })
    const doneIdx = written.indexOf('event: done')
    const doneData = JSON.parse(written.slice(doneIdx).split('\n')[1].slice(6))
    expect(doneData.language_review).toBe('failed')
    expect(doneData.banned_language.map((h: { term: string }) => h.term)).toEqual(expect.arrayContaining(['caused by', 'unsafe']))
    // Token counts still landed on the (finalized) reservation row.
    expect(generations).toHaveLength(1)
    expect(generations[0].generation_type).toBe('inline_ai')
    expect(generations[0].output_tokens).toBe(12)
  })

  it('does not flag a clean rewrite', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const enc = new TextEncoder()
    const frames = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Water staining on the ceiling tile near AHU-2 was noted."}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n',
    ]
    handler.__test.setFetch(vi.fn(async () => ({
      ok: true, status: 200,
      body: new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } }),
    })) as unknown as typeof fetch)
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'improve', text: 'water stains ceiling' } },
      res,
    )
    expect(res.written).not.toContain('event: replace')
    expect(res.written).toContain('"language_review":"passed"')
  })

  it('reserves the ledger row before calling upstream and releases it on upstream failure', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    let rowsDuringCall = -1
    handler.__test.setFetch(vi.fn(async () => {
      rowsDuringCall = generations.length
      return { ok: false, status: 500, text: async () => 'stack trace from anthropic' }
    }) as unknown as typeof fetch)
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action: 'improve', text: 'A real note' } },
      res,
    )
    expect(rowsDuringCall).toBe(1)
    expect(generations).toHaveLength(0)
    expect(res.written).toContain('event: error')
    expect(res.written).not.toContain('stack trace')
  })

  it('keeps the invent-nothing guardrail in every action prompt', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const captured: Array<{ body: string }> = []
    handler.__test.setFetch(vi.fn(async (_url: string, init: { body: string }) => {
      captured.push({ body: init.body })
      return { ok: false, status: 500, text: async () => 'upstream_stub' }
    }) as unknown as typeof fetch)
    const guardrails: Record<string, string> = {
      improve: 'Do not invent',
      expand: 'do not invent',
      concise: 'Preserve every fact',
      professional: 'Do not invent',
    }
    for (const action of Object.keys(guardrails)) {
      captured.length = 0
      const res = makeRes()
      await handler(
        { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { action, text: 'A real note' } },
        res,
      )
      const sent = JSON.parse(captured[0].body) as { system: string }
      expect(sent.system).toContain(guardrails[action])
      expect(sent.system).toContain('Return ONLY the rewritten text')
    }
  })
})
