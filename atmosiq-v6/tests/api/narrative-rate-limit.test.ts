/**
 * Tests for /api/narrative rate limiting and cost tracking.
 *
 * Pins the contract:
 *   • 10 generations in 60s succeed; 11th returns 429
 *   • Rate limit resets after the 60s window slides past
 *   • Free-tier user is capped at 5/day regardless of credits
 *   • 429 responses include a Retry-After header
 *   • Each successful generation persists input_tokens, output_tokens,
 *     and estimated_cost_usd
 *   • Unauthenticated requests return 401
 *   • Cost calculation uses the published Anthropic pricing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── State captured by mocks ────────────────────────────────────────
type Generation = { user_id: string; generated_at: string; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null }
const generations: Generation[] = []
let now = Date.parse('2026-04-30T12:00:00Z')

// Auth state
let nextUser: { id: string; email: string } | null = null
let nextProfile: { plan: string } | null = null

function resetState() {
  generations.length = 0
  now = Date.parse('2026-04-30T12:00:00Z')
  nextUser = { id: 'user-rate-1', email: 'rate@example.com' }
  nextProfile = { plan: 'pro' }
}

// ─── Mock Supabase ──────────────────────────────────────────────────
function makeChain(table: string): any {
  const ctx: any = { _filters: {} as Record<string, unknown>, _gte: null as null | { col: string; val: string }, _orderAsc: false, _limit: null as null | number, _isCount: false, _isInsert: false }
  const chain: any = {
    select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts && opts.count === 'exact') ctx._isCount = true
      return chain
    },
    eq: (col: string, val: unknown) => {
      ctx._filters[col] = val
      return chain
    },
    gte: (col: string, val: string) => {
      ctx._gte = { col, val }
      return chain
    },
    order: (col: string, opts: { ascending: boolean }) => {
      ctx._orderAsc = opts.ascending
      ctx._orderCol = col
      return chain
    },
    limit: (n: number) => { ctx._limit = n; return chain },
    single: async () => {
      if (table === 'profiles') return { data: nextProfile, error: null }
      if (table === 'narrative_generations') {
        const matched = generations.filter(g => {
          if (g.user_id !== ctx._filters.user_id) return false
          if (ctx._gte && new Date(g.generated_at).getTime() < new Date(ctx._gte.val).getTime()) return false
          return true
        }).sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime())
        const first = matched[0]
        return { data: first ? { generated_at: first.generated_at } : null, error: null }
      }
      return { data: null, error: null }
    },
    insert: async (row: any) => {
      if (table === 'narrative_generations') {
        generations.push({
          user_id: row.user_id,
          generated_at: new Date(now).toISOString(),
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          estimated_cost_usd: row.estimated_cost_usd,
        })
      }
      return { data: null, error: null }
    },
    delete: () => chain,
  }
  // Make the chain awaitable for count queries
  ;(chain as any).then = (resolve: (r: any) => void) => {
    if (table === 'narrative_generations' && ctx._isCount) {
      const count = generations.filter(g => {
        if (g.user_id !== ctx._filters.user_id) return false
        if (ctx._gte && new Date(g.generated_at).getTime() < new Date(ctx._gte.val).getTime()) return false
        return true
      }).length
      resolve({ data: null, error: null, count })
      return
    }
    resolve({ data: null, error: null })
  }
  return chain
}

function makeSupabaseMock() {
  return {
    auth: {
      getUser: async (_jwt: string) => {
        if (!nextUser) return { data: { user: null }, error: { message: 'invalid' } }
        return { data: { user: nextUser }, error: null }
      },
    },
    from: (table: string) => makeChain(table),
  }
}

// ─── Mock fetch (Anthropic) ─────────────────────────────────────────
let nextAnthropicResponse: { ok: boolean; status?: number; body?: any; text?: string } = {
  ok: true,
  body: { content: [{ type: 'text', text: 'mock narrative' }], usage: { input_tokens: 5000, output_tokens: 2000 } },
}

function makeFetchMock() {
  return async (_url: string, _opts: any) => ({
    ok: nextAnthropicResponse.ok,
    status: nextAnthropicResponse.status || 200,
    json: async () => nextAnthropicResponse.body,
    text: async () => nextAnthropicResponse.text || '',
  })
}

// ─── req/res helpers ────────────────────────────────────────────────
function makeReq(opts: { auth?: string; body?: any } = {}) {
  return {
    method: 'POST',
    headers: { authorization: opts.auth ?? 'Bearer test-jwt' },
    body: opts.body ?? { system: 'sys', payload: { foo: 'bar' } },
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}
function makeRes() {
  const headers: Record<string, string> = {}
  const res: any = { _status: 200, _body: null, _headers: headers }
  res.status = (code: number) => { res._status = code; return res }
  res.json = (body: any) => { res._body = body; return res }
  res.setHeader = (k: string, v: string) => { headers[k] = v }
  res.end = () => res
  return res
}

let handler: any

beforeEach(async () => {
  resetState()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  vi.useFakeTimers()
  vi.setSystemTime(new Date(now))
  vi.resetModules()
  const mod: any = await import('../../api/narrative.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
  handler.__test.setFetch(makeFetchMock())
})

function advance(ms: number) {
  now += ms
  vi.setSystemTime(new Date(now))
}

// ─── tests ──────────────────────────────────────────────────────────
describe('POST /api/narrative — rate limiting', () => {
  it('allows 10 requests in 60s; 11th returns 429 with Retry-After', async () => {
    nextProfile = { plan: 'pro' } // pro tier — only per-minute and per-day limits

    for (let i = 0; i < 10; i++) {
      advance(1000) // 1s between calls
      const r = makeRes()
      await handler(makeReq(), r)
      expect(r._status).toBe(200)
    }

    // 11th, still within the 60s window
    advance(1000)
    const r11 = makeRes()
    await handler(makeReq(), r11)
    expect(r11._status).toBe(429)
    expect(r11._body.error).toBe('rate_limit_exceeded')
    expect(r11._body.scope).toBe('per_minute')
    expect(r11._body.retry_after_seconds).toBeGreaterThan(0)
    expect(r11._headers['Retry-After']).toBeDefined()
  })

  it('rate limit resets after 60s — 11th call after window slide succeeds', async () => {
    nextProfile = { plan: 'pro' }
    for (let i = 0; i < 10; i++) {
      advance(1000)
      await handler(makeReq(), makeRes())
    }
    advance(60_000) // slide window past
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
  })

  it('caps free-tier user at 5 generations / 24h regardless of credits', async () => {
    nextProfile = { plan: 'free' }

    for (let i = 0; i < 5; i++) {
      advance(60_000) // 1min between calls — well below per-minute limit
      const r = makeRes()
      await handler(makeReq(), r)
      expect(r._status).toBe(200)
    }

    advance(60_000)
    const r6 = makeRes()
    await handler(makeReq(), r6)
    expect(r6._status).toBe(429)
    expect(r6._body.scope).toBe('free_tier_daily')
  })

  it('persists input_tokens, output_tokens, estimated_cost_usd on success', async () => {
    nextAnthropicResponse = {
      ok: true,
      body: { content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 5000, output_tokens: 2000 } },
    }
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(generations.length).toBe(1)
    expect(generations[0].input_tokens).toBe(5000)
    expect(generations[0].output_tokens).toBe(2000)
    // Cost: (5000 * 3 + 2000 * 15) / 1e6 = (15000 + 30000) / 1e6 = 0.045
    expect(generations[0].estimated_cost_usd).toBe(0.045)
    expect(r._body.usage.estimated_cost_usd).toBe(0.045)
  })

  it('returns 401 without Authorization header', async () => {
    const r = makeRes()
    await handler(makeReq({ auth: '' }), r)
    expect(r._status).toBe(401)
  })

  it('returns 401 when JWT is invalid', async () => {
    nextUser = null
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(401)
  })

  it('returns 400 when body is missing system or payload', async () => {
    const r = makeRes()
    await handler(makeReq({ body: {} }), r)
    expect(r._status).toBe(400)
  })
})

describe('estimateCost helper', () => {
  it('uses Anthropic Sonnet 4 pricing: $3/M input + $15/M output', async () => {
    const mod: any = await import('../../api/narrative.js')
    const handler = mod.default ?? mod
    const { estimateCost } = handler.__test
    expect(estimateCost(5000, 2000)).toBe(0.045)
    expect(estimateCost(1_000_000, 0)).toBe(3)
    expect(estimateCost(0, 1_000_000)).toBe(15)
    expect(estimateCost(null, 100)).toBeNull()
  })
})
