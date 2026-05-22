/**
 * Tests for /api/pre-review-semantic validation + helpers.
 *
 * Focused on the contract the front-end depends on:
 *   • GET → 405
 *   • POST without Authorization → 401
 *   • POST without assessment body → 400 missing_assessment
 *   • Assessment payload > MAX_INPUT_BYTES → 400 assessment_too_large
 *   • slimAssessment() drops photos / presurvey blobs, keeps audit-
 *     relevant fields, truncates strings + caps list lengths
 *   • tryParseIssues handles raw JSON, code-fenced JSON, JSON with
 *     preamble, and malformed input
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

type Generation = { user_id: string; generated_at: string; generation_type: string }
const generations: Generation[] = []
let nextUser: { id: string; email: string } | null = null
let nextProfile: { plan: string } | null = null
let nextAuthError: Error | null = null

function resetState() {
  generations.length = 0
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
      const ctx: { isCount: boolean; filters: Record<string, unknown>; gte: { col: string; val: string } | null } = {
        isCount: false, filters: {}, gte: null,
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
          return { data: null, error: null }
        },
        insert: async (row: Record<string, unknown>) => {
          generations.push({
            user_id: String(row.user_id || ''),
            generated_at: new Date().toISOString(),
            generation_type: String(row.generation_type || ''),
          })
          return { data: null, error: null }
        },
        then: (resolve: (v: unknown) => void) => {
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
  slimAssessment(input: unknown): Record<string, unknown>
  tryParseIssues(text: string): Array<Record<string, unknown>>
  MAX_INPUT_BYTES: number
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

describe('/api/pre-review-semantic — validation gate', () => {
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
    await handler({ method: 'POST', headers: {}, body: { assessment: {} } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('POST with missing assessment → 400 missing_assessment', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer ok' }, body: {} }, res)
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('missing_assessment')
  })

  it('POST with oversized assessment → 400 assessment_too_large', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    // Build a payload whose narrative alone exceeds MAX_INPUT_BYTES
    // before slimming. slim() truncates to 20K but the slim'd shape
    // is what gets size-checked; we use many zones + many findings
    // to force the slim'd shape above the cap.
    const zoneScores = Array.from({ length: 30 }, (_, i) => ({
      zoneName: `Zone ${i}`,
      cats: [{
        l: 'Cat',
        r: Array.from({ length: 60 }, (_, j) => ({
          t: 'x'.repeat(600), sev: 'high',
        })),
      }],
    }))
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { assessment: { zoneScores } } },
      res,
    )
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('assessment_too_large')
  })
})

describe('slimAssessment helper', () => {
  it('keeps narrative + recs + zones + lab rows; drops photos and presurvey blob', async () => {
    const handler = await loadHandler()
    const slim = handler.__test.slimAssessment({
      narrative: 'Field assessment narrative.',
      recs: {
        imm: [{ text: 'arrest water intrusion' }, 'inspect HVAC'],
        eng: ['rebalance dampers'],
      },
      zoneScores: [{
        zoneName: 'Zone A',
        tot: 64,
        cats: [{ l: 'Vent', r: [{ t: 'CO2 elevated', sev: 'high', std: 'ASHRAE 62.1' }] }],
      }],
      labResults: {
        laboratory: 'EMSL',
        rows: [{ sampleId: 'AF-001', analyte: 'penicillium', result: '150', units: 'ct/m3', collectedAt: '2026-04-15', receivedAt: '2026-04-17' }],
      },
      photos: { '1': { dataUrl: 'data:image/jpeg;base64,...20KB...' } }, // should be dropped
      presurvey: { ps_reason: 'occupant complaints', ps_inst_iaq: 'TSI Q-Trak', _huge: 'x'.repeat(10000) }, // should be dropped
      facilityName: 'Acme HQ',
      assessor: 'J. Smith, CIH',
    })
    expect(slim.narrative).toBe('Field assessment narrative.')
    expect(slim.recs).toEqual({
      imm: ['arrest water intrusion', 'inspect HVAC'],
      eng: ['rebalance dampers'],
      adm: [],
      mon: [],
    })
    expect(slim.zones).toEqual([{
      name: 'Zone A',
      composite: 64,
      findings: [{ category: 'Vent', severity: 'high', text: 'CO2 elevated', citation: 'ASHRAE 62.1' }],
    }])
    expect(slim.labResults).toHaveLength(1)
    expect(slim.laboratory).toBe('EMSL')
    expect(slim.facilityName).toBe('Acme HQ')
    expect(slim.assessor).toBe('J. Smith, CIH')
    // Photos + presurvey not present
    expect(slim).not.toHaveProperty('photos')
    expect(slim).not.toHaveProperty('presurvey')
  })

  it('caps narrative at 20K chars', async () => {
    const handler = await loadHandler()
    const slim = handler.__test.slimAssessment({ narrative: 'x'.repeat(30000) })
    expect((slim.narrative as string).length).toBe(20000)
  })

  it('caps recs at 50 entries per tier, finding text at 600 chars', async () => {
    const handler = await loadHandler()
    const slim = handler.__test.slimAssessment({
      recs: { imm: Array.from({ length: 200 }, (_, i) => `rec ${i}`) },
      zoneScores: [{
        zoneName: 'Z',
        cats: [{ l: 'C', r: [{ t: 'y'.repeat(2000), sev: 'high' }] }],
      }],
    })
    expect((slim.recs as { imm: string[] }).imm).toHaveLength(50)
    expect(((slim.zones as Array<{ findings: Array<{ text: string }> }>)[0].findings[0].text).length).toBe(600)
  })
})

describe('tryParseIssues helper', () => {
  it('parses a raw JSON array', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues(JSON.stringify([
      { severity: 'warning', category: 'x', title: 'Mismatch', detail: 'Foo says bar', anchor: { type: 'finding' } },
    ]))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ severity: 'warning', category: 'x', title: 'Mismatch', source: 'semantic' })
    expect(out[0].id).toMatch(/^sem-/)
  })

  it('parses JSON wrapped in a markdown code fence', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues('```json\n[{"severity":"blocking","category":"x","title":"T","detail":"D","anchor":{"type":"finding"}}]\n```')
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('blocking')
  })

  it('parses JSON preceded by preamble (model adds a sentence)', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues('Here are the issues:\n[{"severity":"suggestion","category":"x","title":"T","detail":"D","anchor":{}}]')
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('suggestion')
  })

  it('returns [] on malformed input', async () => {
    const handler = await loadHandler()
    expect(handler.__test.tryParseIssues('not json at all')).toEqual([])
    expect(handler.__test.tryParseIssues('')).toEqual([])
    expect(handler.__test.tryParseIssues(null as unknown as string)).toEqual([])
  })

  it('coerces unknown severity to "suggestion"', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues('[{"severity":"catastrophic","title":"X","detail":""}]')
    expect(out[0].severity).toBe('suggestion')
  })

  it('drops entries missing required fields', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues('[{"title":"only title"},{"severity":"warning","title":"valid"}]')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('valid')
  })

  it('truncates oversized title + detail strings', async () => {
    const handler = await loadHandler()
    const out = handler.__test.tryParseIssues(JSON.stringify([
      { severity: 'warning', title: 'x'.repeat(500), detail: 'y'.repeat(5000) },
    ]))
    expect((out[0].title as string).length).toBeLessThanOrEqual(200)
    expect((out[0].detail as string).length).toBeLessThanOrEqual(2000)
  })
})

describe('handler streams issue events on success', () => {
  beforeEach(() => {
    resetState()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('emits one issue SSE frame per parsed issue + a done frame', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    handler.__test.setFetch(vi.fn(async () => ({
      ok: true,
      status: 200,
      // body must be truthy — handler gates on `!upstream.body`
      // before calling .json(). The placeholder is never read.
      body: {},
      json: async () => ({
        content: [{
          type: 'text',
          text: '[{"severity":"warning","category":"citation_mismatch","title":"ASHRAE 62.1 doesn\'t support this claim","detail":"Foo bar","anchor":{"type":"finding","zone":"Zone A"}}]',
        }],
        usage: { input_tokens: 1000, output_tokens: 50 },
      }),
    })) as unknown as typeof fetch)

    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { assessment: { narrative: 'Test' } } },
      res,
    )
    expect(res.written).toContain('event: issue')
    expect(res.written).toContain('event: done')
    expect(res.written).toContain('citation_mismatch')
  })
})
