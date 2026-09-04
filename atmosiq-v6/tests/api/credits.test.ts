/**
 * /api/credits — debit validation + atomic consume (audit 2026-09 §2.1 / C1).
 *
 * Pins:
 *   • amount must be a positive integer ≤ MAX_DEBIT (the old `!amount`
 *     check let `amount: -1000` GROW the balance)
 *   • the debit goes through the consume_credits RPC, never a
 *     select → compute → update sequence
 *   • insufficient_credits from the RPC → 402 with the current balance
 *   • response shape { credits, debited } is unchanged
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

let rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = []
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 4, error: null }
let profileUpdates = 0
let nextUser: { id: string; email: string } | null = { id: 'u-1', email: 'u@example.com' }

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => (nextUser ? { data: { user: nextUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    rpc: async (name: string, params: Record<string, unknown>) => { rpcCalls.push({ name, params }); return rpcResult },
    from: (_table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { credits_remaining: 2, plan: 'free', monthly_credit_limit: 1 }, error: null }),
        update: () => { profileUpdates++; return chain },
        insert: async () => ({ data: null, error: null }),
      }
      return chain
    },
  }
}

function makeRes() {
  const res: any = { _status: 0, _body: null }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: unknown) => { res._body = b; return res }
  return res
}
const post = (body: unknown) => ({ method: 'POST', headers: { authorization: 'Bearer jwt' }, body }) as any

let handler: any
beforeEach(async () => {
  rpcCalls = []
  rpcResult = { data: 4, error: null }
  profileUpdates = 0
  nextUser = { id: 'u-1', email: 'u@example.com' }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  vi.resetModules()
  const mod: any = await import('../../api/credits.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
})

describe('POST /api/credits — amount validation', () => {
  for (const bad of [-1000, 0, 1.5, '1', 'abc', NaN, Infinity, null, true]) {
    it(`rejects amount=${String(bad)} with 400 and never touches the balance`, async () => {
      const res = makeRes()
      await handler(post({ amount: bad, reason: 'report' }), res)
      expect(res._status).toBe(400)
      expect(rpcCalls).toHaveLength(0)
      expect(profileUpdates).toBe(0)
    })
  }

  it('caps a single debit at MAX_DEBIT', async () => {
    const res = makeRes()
    await handler(post({ amount: handler.__test.MAX_DEBIT + 1, reason: 'report' }), res)
    expect(res._status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('requires a reason', async () => {
    const res = makeRes()
    await handler(post({ amount: 1 }), res)
    expect(res._status).toBe(400)
  })
})

describe('POST /api/credits — atomic consume', () => {
  it('debits through consume_credits and returns { credits, debited }', async () => {
    rpcResult = { data: 4, error: null }
    const res = makeRes()
    await handler(post({ amount: 1, reason: 'report', reference_id: 'rpt-1' }), res)
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ credits: 4, debited: 1 })
    expect(rpcCalls).toEqual([{ name: 'consume_credits', params: { p_user_id: 'u-1', p_amount: 1, p_reason: 'report', p_reference_id: 'rpt-1' } }])
    // No select→compute→update path remains.
    expect(profileUpdates).toBe(0)
  })

  it('maps insufficient_credits to 402 with the current balance', async () => {
    rpcResult = { data: null, error: { message: 'insufficient_credits' } }
    const res = makeRes()
    await handler(post({ amount: 5, reason: 'report' }), res)
    expect(res._status).toBe(402)
    expect(res._body).toEqual({ error: 'Insufficient credits', credits: 2 })
  })

  it('returns a stable 500 code (not the SQL text) on any other RPC error', async () => {
    rpcResult = { data: null, error: { message: 'relation credits_ledger does not exist' } }
    const res = makeRes()
    await handler(post({ amount: 1, reason: 'report' }), res)
    expect(res._status).toBe(500)
    expect(res._body).toEqual({ error: 'credit_debit_failed' })
  })

  it('401 without a valid token', async () => {
    nextUser = null
    const res = makeRes()
    await handler(post({ amount: 1, reason: 'report' }), res)
    expect(res._status).toBe(401)
  })
})

describe('GET /api/credits', () => {
  it('returns the balance, plan and limit', async () => {
    const res = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer jwt' } }, res)
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ credits: 2, plan: 'free', limit: 1 })
  })
})
