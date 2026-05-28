/**
 * Tests for /api/inline-complete validation + sanitization.
 *
 * Pins the contract:
 *   • GET → 405
 *   • POST without Authorization → 401
 *   • Empty / too-short text → 200 with empty completion (no model call)
 *   • text > 4000 chars → 400
 *   • Successful response returns { completion } where echo-prefix
 *     has been stripped by sanitizeCompletion
 *
 * The sanitizeCompletion helper is exported on __test for direct
 * unit coverage of the edge cases that prompted it.
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
    status(c: number) { this.statusCode = c; return this },
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value },
    json(body: unknown) { this.jsonBody = body },
    write() {}, end() {},
  }
}

interface CompleteTestHooks {
  setSupabase(s: ReturnType<typeof makeSupabaseMock>): void
  setFetch(f: typeof fetch): void
  reset(): void
  sanitizeCompletion(raw: string, userText: string): string
}
interface CompleteModule {
  (req: unknown, res: ReturnType<typeof makeRes>): Promise<void>
  __test: CompleteTestHooks
}

async function loadHandler(): Promise<CompleteModule> {
  vi.resetModules()
  const mod = (await import('../../api/inline-complete.js')) as {
    default: (req: unknown, res: unknown) => Promise<void>
    __test: CompleteTestHooks
  }
  const fn = mod.default as unknown as CompleteModule
  fn.__test = mod.__test
  return fn
}

describe('/api/inline-complete', () => {
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
    await handler({ method: 'POST', headers: {}, body: { text: 'hello there observation' } }, res)
    expect(res.statusCode).toBe(401)
  })

  it('empty text → 200 with empty completion (no model call)', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const fetchSpy = vi.fn()
    handler.__test.setFetch(fetchSpy as unknown as typeof fetch)
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { text: '   ' } },
      res,
    )
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { completion?: string })?.completion).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('text < 6 chars → empty completion (no model call)', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const fetchSpy = vi.fn()
    handler.__test.setFetch(fetchSpy as unknown as typeof fetch)
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { text: 'hi' } },
      res,
    )
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { completion?: string })?.completion).toBe('')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('text > 4000 chars → 400', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { text: 'x'.repeat(4001) } },
      res,
    )
    expect(res.statusCode).toBe(400)
    expect((res.jsonBody as { error?: string })?.error).toBe('text_too_long')
  })

  it('passes through completion from upstream model', async () => {
    const handler = await loadHandler()
    handler.__test.setSupabase(makeSupabaseMock())
    handler.__test.setFetch(vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: ' levels in the conference room.' }],
        usage: { input_tokens: 180, output_tokens: 12 },
      }),
    })) as unknown as typeof fetch)

    const res = makeRes()
    await handler(
      { method: 'POST', headers: { authorization: 'Bearer ok' }, body: { text: 'CO2 measured at elevated' } },
      res,
    )
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { completion?: string })?.completion).toBe(' levels in the conference room.')
  })
})

describe('sanitizeCompletion', () => {
  it('strips surrounding quotes', async () => {
    const handler = await loadHandler()
    expect(handler.__test.sanitizeCompletion('"some completion"', 'hello')).toBe('some completion')
  })

  it('strips leading whitespace + em-dash + colon noise', async () => {
    const handler = await loadHandler()
    expect(handler.__test.sanitizeCompletion('—  some completion', 'hello')).toBe('some completion')
    expect(handler.__test.sanitizeCompletion(': some completion', 'hello')).toBe('some completion')
  })

  it('strips echoed user-text tail (preserving any leading space)', async () => {
    const handler = await loadHandler()
    // Model echoed " at elevated" then continued. Leading space
    // is preserved because the ghost glues directly onto the
    // user's typed text.
    const out = handler.__test.sanitizeCompletion(
      ' at elevated levels in the room.',
      'CO2 measured at elevated',
    )
    expect(out).toBe(' levels in the room.')
  })

  it('returns empty string for empty / non-string input', async () => {
    const handler = await loadHandler()
    expect(handler.__test.sanitizeCompletion('', 'hello')).toBe('')
    expect(handler.__test.sanitizeCompletion(null as unknown as string, 'hello')).toBe('')
  })
})
