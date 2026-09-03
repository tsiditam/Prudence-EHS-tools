/**
 * /api/admin — input validation + method gate (audit 2026-09 §3 Medium).
 *
 *   • `amount` must be a non-zero integer within ±MAX_ADJUSTMENT ("abc"
 *     used to write NaN to credits_remaining)
 *   • set_status only accepts the allow-listed vocabulary
 *   • the adjustment goes through grant_credits (balance + ledger together)
 *   • unsupported methods → 405, unknown POST actions → 400
 *   • ADMIN_SECRET gate is timing-safe and fails closed when unset
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

const UID = '11111111-2222-4333-8444-555555555555'
let rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = []
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 60, error: null }
let statusUpdates: Array<Record<string, unknown>> = []

function makeSupabaseMock() {
  return {
    rpc: async (name: string, params: Record<string, unknown>) => { rpcCalls.push({ name, params }); return rpcResult },
    from: (_table: string) => {
      const chain: any = {
        select: () => chain,
        eq: async () => ({ data: null, error: null }),
        update: (patch: Record<string, unknown>) => { statusUpdates.push(patch); return chain },
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        gte: async () => ({ count: 0, error: null }),
      }
      return chain
    },
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  }
}

function makeRes() {
  const res: any = { _status: 0, _body: null }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: unknown) => { res._body = b; return res }
  return res
}
const req = (method: string, body?: unknown, query?: Record<string, string>) =>
  ({ method, headers: { authorization: 'Bearer top-secret' }, body, query }) as any

let handler: any
beforeEach(async () => {
  rpcCalls = []
  rpcResult = { data: 60, error: null }
  statusUpdates = []
  process.env.ADMIN_SECRET = 'top-secret'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  vi.resetModules()
  const mod: any = await import('../../api/admin.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
})

describe('/api/admin — gate', () => {
  it('405 on unsupported methods', async () => {
    for (const m of ['PUT', 'DELETE', 'PATCH']) {
      const res = makeRes()
      await handler(req(m), res)
      expect(res._status).toBe(405)
    }
  })

  it('401 with a wrong secret and 401 when ADMIN_SECRET is unset (fail closed)', async () => {
    let res = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res)
    expect(res._status).toBe(401)
    delete process.env.ADMIN_SECRET
    res = makeRes()
    await handler(req('GET'), res)
    expect(res._status).toBe(401)
  })

  it('400 on an unknown POST action', async () => {
    const res = makeRes()
    await handler(req('POST', { action: 'drop_tables' }), res)
    expect(res._status).toBe(400)
    expect(res._body).toEqual({ error: 'unknown_action' })
  })
})

describe('/api/admin — adjust_credits', () => {
  for (const bad of ['abc', '10', 1.5, 0, NaN, null, undefined]) {
    it(`rejects amount=${String(bad)}`, async () => {
      const res = makeRes()
      await handler(req('POST', { action: 'adjust_credits', userId: UID, amount: bad }), res)
      expect(res._status).toBe(400)
      expect(rpcCalls).toHaveLength(0)
    })
  }

  it('rejects an adjustment beyond ±MAX_ADJUSTMENT', async () => {
    const res = makeRes()
    await handler(req('POST', { action: 'adjust_credits', userId: UID, amount: handler.__test.MAX_ADJUSTMENT + 1 }), res)
    expect(res._status).toBe(400)
  })

  it('rejects a non-uuid userId', async () => {
    const res = makeRes()
    await handler(req('POST', { action: 'adjust_credits', userId: 'u_1', amount: 10 }), res)
    expect(res._status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  it('routes a valid adjustment through grant_credits and returns the new balance', async () => {
    const res = makeRes()
    await handler(req('POST', { action: 'adjust_credits', userId: UID, amount: -10, reason: 'refund reversal' }), res)
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ success: true, newBalance: 60 })
    expect(rpcCalls).toEqual([{ name: 'grant_credits', params: { p_user_id: UID, p_amount: -10, p_reason: 'refund reversal', p_reference_id: 'admin-adjustment' } }])
  })

  it('404s an unknown user (profile_not_found from the RPC)', async () => {
    rpcResult = { data: null, error: { message: 'profile_not_found' } }
    const res = makeRes()
    await handler(req('POST', { action: 'adjust_credits', userId: UID, amount: 5 }), res)
    expect(res._status).toBe(404)
  })
})

describe('/api/admin — set_status', () => {
  it('rejects a status outside the allow-list', async () => {
    for (const bad of ['banned', 'free', 'canceling', '', 42]) {
      const res = makeRes()
      await handler(req('POST', { action: 'set_status', userId: UID, status: bad }), res)
      expect(res._status).toBe(400)
    }
    expect(statusUpdates).toHaveLength(0)
  })

  it('accepts suspended / active', async () => {
    for (const ok of ['suspended', 'active']) {
      const res = makeRes()
      await handler(req('POST', { action: 'set_status', userId: UID, status: ok }), res)
      expect(res._status).toBe(200)
    }
    expect(statusUpdates).toEqual([{ subscription_status: 'suspended' }, { subscription_status: 'active' }])
  })
})
