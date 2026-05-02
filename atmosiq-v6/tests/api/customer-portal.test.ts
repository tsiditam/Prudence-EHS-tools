/**
 * Tests for /api/customer-portal.
 *
 * Pins the contract:
 *   • Authenticated paid user → 200 with a portal URL
 *   • Free-tier user (no stripe_customer_id) → 404
 *   • Unauthenticated request → 401
 *   • Bad JWT → 401
 *   • Non-POST method → 405
 *   • Stripe API failure → 500
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Supabase + Stripe imports BEFORE the handler imports them.
// We use the __test injection hooks for predictable behavior.

let nextUser: { id: string; email: string } | null = null
let nextAuthError: { message: string } | null = null
let nextProfile: { stripe_customer_id: string | null; plan: string } | null = null
let stripePortalCreateCalls: Array<{ customer: string; return_url: string }> = []
let stripeShouldThrow = false

function makeSupabaseMock() {
  return {
    auth: {
      getUser: async (_jwt: string) => {
        if (nextAuthError) return { data: { user: null }, error: nextAuthError }
        return { data: { user: nextUser }, error: null }
      },
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: nextProfile, error: null }),
        }),
      }),
    }),
  }
}

function makeStripeMock() {
  return {
    billingPortal: {
      sessions: {
        create: async (params: { customer: string; return_url: string }) => {
          stripePortalCreateCalls.push(params)
          if (stripeShouldThrow) throw new Error('stripe down')
          return { url: `https://billing.stripe.com/p/${params.customer}` }
        },
      },
    },
  }
}

function makeReq(opts: { method?: string; auth?: string; returnUrl?: string } = {}) {
  return {
    method: opts.method ?? 'POST',
    headers: { authorization: opts.auth ?? 'Bearer test-jwt' },
    body: opts.returnUrl ? { return_url: opts.returnUrl } : {},
  } as any
}

function makeRes() {
  const res: any = { _status: 200, _body: null }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: any) => { res._body = b; return res }
  res.end = () => res
  return res
}

let handler: any

beforeEach(async () => {
  nextUser = { id: 'user-portal-1', email: 'paid@example.com' }
  nextAuthError = null
  nextProfile = { stripe_customer_id: 'cus_x', plan: 'pro' }
  stripePortalCreateCalls = []
  stripeShouldThrow = false

  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.STRIPE_SECRET_KEY = 'sk_test'

  vi.resetModules()
  const mod: any = await import('../../api/customer-portal')
  handler = mod.default ?? mod.handler
  mod.__test.setSupabase(makeSupabaseMock())
  mod.__test.setStripe(makeStripeMock())
})

describe('POST /api/customer-portal', () => {
  it('returns a portal URL for an authenticated paid user', async () => {
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(r._body.url).toBe('https://billing.stripe.com/p/cus_x')
    expect(stripePortalCreateCalls.length).toBe(1)
    expect(stripePortalCreateCalls[0].customer).toBe('cus_x')
  })

  it('honors a custom return_url from the body', async () => {
    const r = makeRes()
    await handler(makeReq({ returnUrl: 'https://app.example/account' }), r)
    expect(r._status).toBe(200)
    expect(stripePortalCreateCalls[0].return_url).toBe('https://app.example/account')
  })

  it('returns 404 when the user has no stripe_customer_id (free tier)', async () => {
    nextProfile = { stripe_customer_id: null, plan: 'free' }
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(404)
    expect(r._body.error).toMatch(/No active subscription/)
    expect(stripePortalCreateCalls.length).toBe(0)
  })

  it('returns 401 when no Authorization header', async () => {
    const r = makeRes()
    await handler(makeReq({ auth: '' }), r)
    expect(r._status).toBe(401)
  })

  it('returns 401 on invalid JWT', async () => {
    nextUser = null
    nextAuthError = { message: 'invalid jwt' }
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(401)
  })

  it('returns 405 on non-POST method', async () => {
    const r = makeRes()
    await handler(makeReq({ method: 'GET' }), r)
    expect(r._status).toBe(405)
  })

  it('returns 500 when Stripe portal creation throws', async () => {
    stripeShouldThrow = true
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(500)
    expect(r._body.error).toMatch(/portal session/i)
  })
})
