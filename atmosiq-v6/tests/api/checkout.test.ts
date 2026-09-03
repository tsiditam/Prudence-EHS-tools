/**
 * /api/checkout — auth + open-redirect guard (audit 2026-09 §2.4 / H6).
 *
 *   • requires a Bearer JWT; user id / email come from the token and a
 *     body userId is IGNORED
 *   • returnUrl is honoured only on https://atmosflow.net or the request's
 *     own origin; anything else falls back to the default
 *   • Stripe errors come back as a stable code, never the Stripe message
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

let nextUser: { id: string; email: string } | null = { id: 'u_token', email: 'token@example.com' }
let captured: any = null
let stripeThrows = false

function makeRes() {
  const res: any = { _status: 0, _body: null }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: unknown) => { res._body = b; return res }
  return res
}

let handler: any
beforeEach(async () => {
  nextUser = { id: 'u_token', email: 'token@example.com' }
  captured = null
  stripeThrows = false
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  vi.resetModules()
  const mod: any = await import('../../api/checkout.js')
  handler = mod.default ?? mod
  handler.__test.setStripe({
    checkout: { sessions: { create: async (params: any) => {
      if (stripeThrows) throw new Error('No such price: price_pro_m (sk_test_51...)')
      captured = params
      return { id: 'cs_1', url: 'https://stripe/cs_1' }
    } } },
  })
  handler.__test.setSupabase({
    auth: { getUser: async () => (nextUser ? { data: { user: nextUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
  })
})

const post = (body: unknown, headers: Record<string, string> = {}) =>
  ({ method: 'POST', headers: { authorization: 'Bearer jwt', ...headers }, body }) as any

describe('/api/checkout — auth', () => {
  it('401 without a Bearer token', async () => {
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, body: { plan: 'pro', userId: 'u_victim' } }, res)
    expect(res._status).toBe(401)
    expect(captured).toBeNull()
  })

  it('401 on an invalid token', async () => {
    nextUser = null
    const res = makeRes()
    await handler(post({ plan: 'pro' }), res)
    expect(res._status).toBe(401)
  })

  it('takes user_id / email from the JWT and ignores userId / userEmail in the body', async () => {
    const res = makeRes()
    await handler(post({ plan: 'pro', billing_period: 'monthly', userId: 'u_victim', userEmail: 'victim@example.com' }), res)
    expect(res._status).toBe(200)
    expect(captured.metadata.user_id).toBe('u_token')
    expect(captured.subscription_data.metadata.user_id).toBe('u_token')
    expect(captured.customer_email).toBe('token@example.com')
  })
})

describe('/api/checkout — returnUrl allow-list', () => {
  it('defaults when no returnUrl is given', async () => {
    await handler(post({ plan: 'pro' }), makeRes())
    expect(captured.success_url).toBe('https://atmosflow.net?checkout=success')
    expect(captured.cancel_url).toBe('https://atmosflow.net?checkout=cancelled')
  })

  it('honours the production origin (path kept, query dropped)', async () => {
    await handler(post({ plan: 'pro', returnUrl: 'https://atmosflow.net/app?x=1#frag' }), makeRes())
    expect(captured.success_url).toBe('https://atmosflow.net/app?checkout=success')
  })

  it("honours the request's own origin", async () => {
    await handler(post({ plan: 'pro', returnUrl: 'https://pr-42.vercel.app' }, { origin: 'https://pr-42.vercel.app' }), makeRes())
    expect(captured.success_url).toBe('https://pr-42.vercel.app?checkout=success')
  })

  it('falls back for a foreign origin, http, or garbage (open-redirect guard)', async () => {
    for (const bad of ['https://evil.example/phish', 'http://atmosflow.net', 'javascript:alert(1)', 'not a url', '//evil.example']) {
      captured = null
      await handler(post({ plan: 'pro', returnUrl: bad }), makeRes())
      expect(captured.success_url, bad).toBe('https://atmosflow.net?checkout=success')
    }
  })

  it('resolveReturnUrl is exposed for direct unit checks', () => {
    const { resolveReturnUrl, DEFAULT_RETURN_URL } = handler.__test
    expect(resolveReturnUrl('https://evil.example', { headers: {} })).toBe(DEFAULT_RETURN_URL)
    expect(resolveReturnUrl('https://www.atmosflow.net/x', { headers: {} })).toBe('https://www.atmosflow.net/x')
  })
})

describe('/api/checkout — validation + errors', () => {
  it('400 on an unknown plan with a stable code', async () => {
    const res = makeRes()
    await handler(post({ plan: 'enterprise' }), res)
    expect(res._status).toBe(400)
    expect(res._body).toEqual({ error: 'invalid_plan' })
  })

  it('never relays the Stripe error message', async () => {
    stripeThrows = true
    const res = makeRes()
    await handler(post({ plan: 'pro' }), res)
    expect(res._status).toBe(500)
    expect(res._body).toEqual({ error: 'checkout_session_failed' })
    expect(JSON.stringify(res._body)).not.toContain('sk_test')
  })
})
