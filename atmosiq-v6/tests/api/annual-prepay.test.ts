/**
 * Tests for annual-prepay flow.
 *
 * Pins the contract:
 *   • /api/checkout maps (plan, billing_period) to the right STRIPE_PRICE_*
 *     and creates a subscription (mode='subscription')
 *   • Webhook for annual checkout grants the monthly credit allotment ONCE
 *     (not 12x), sets billing_period='annual', annual_renewal_at = NOW + 365d
 *   • Monthly cron grants credits to annual subscribers per their tier
 *   • Monthly cron does NOT double-grant: a second run in the same month
 *     produces zero new ledger rows
 *   • Monthly cron does NOT touch monthly subscribers (their credits flow
 *     from invoice.paid via the webhook)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── Mock supabase ──────────────────────────────────────────────────
function makeMockSupabase(initial: { profiles?: any[]; ledger?: any[] } = {}) {
  const state = {
    profiles: [...(initial.profiles || [])] as any[],
    credits_ledger: [...(initial.ledger || [])] as any[],
    purchases: [] as any[],
    inserts: [] as any[],
    updates: [] as any[],
  }
  const client: any = {
    state,
    rpc: async (_name: string, _args: any) => ({ data: true, error: null }),
    from: (table: string) => {
      const ctx: any = { _filters: {}, _patch: undefined, _isCount: false }
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: any) => {
          ctx._filters[col] = val
          if (ctx._patch !== undefined) {
            const matches = state[table as keyof typeof state] as any[]
            const updated = matches.filter(r =>
              Object.entries(ctx._filters).every(([k, v]) => r[k] === v)
            )
            for (const m of updated) Object.assign(m, ctx._patch)
            return Promise.resolve({ data: null, error: null, count: updated.length })
          }
          return chain
        },
        in: (col: string, vals: any[]) => {
          ctx._filters[col] = vals
          if (ctx._patch !== undefined) {
            const updated = (state[table as keyof typeof state] as any[]).filter(r => vals.includes(r[col]))
            for (const m of updated) Object.assign(m, ctx._patch)
            return Promise.resolve({ data: null, error: null, count: updated.length })
          }
          // SELECT-with-in
          const matched = (state[table as keyof typeof state] as any[]).filter(r =>
            vals.includes(r[col]) && Object.entries(ctx._filters).filter(([k]) => k !== col).every(([k, v]) => r[k] === v)
          )
          return Promise.resolve({ data: matched, error: null })
        },
        single: async () => {
          const matched = (state[table as keyof typeof state] as any[]).find((r: any) =>
            Object.entries(ctx._filters).every(([k, v]) => r[k] === v)
          )
          return { data: matched ?? null, error: null }
        },
        limit: (n: number) => {
          // SELECT with limit: filter by accumulated filters and return up to n rows.
          const tbl = state[table as keyof typeof state] as any[]
          if (!Array.isArray(tbl)) return Promise.resolve({ data: [], error: null })
          const matched = tbl.filter((r: any) =>
            Object.entries(ctx._filters).every(([k, v]) => r[k] === v)
          ).slice(0, n)
          return Promise.resolve({ data: matched, error: null })
        },
        insert: async (row: any) => {
          state.inserts.push({ table, row })
          if (table === 'credits_ledger') state.credits_ledger.push({ ...row })
          if (table === 'purchases') state.purchases.push({ ...row })
          if (table === 'profiles') state.profiles.push({ ...row })
          return { data: null, error: null }
        },
        update: (patch: any) => { ctx._patch = patch; return chain },
        delete: () => chain,
      }
      return chain
    },
  }
  return client
}

// ─── /api/checkout: lookupPriceId mapping ──────────────────────────
describe('/api/checkout — price lookup', () => {
  let handler: any
  let mod: any
  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'
    process.env.STRIPE_PRICE_SOLO_MONTHLY     = 'price_solo_m'
    process.env.STRIPE_PRICE_SOLO_ANNUAL      = 'price_solo_a'
    process.env.STRIPE_PRICE_PRO_MONTHLY      = 'price_pro_m'
    process.env.STRIPE_PRICE_PRO_ANNUAL       = 'price_pro_a'
    process.env.STRIPE_PRICE_PRACTICE_MONTHLY = 'price_practice_m'
    process.env.STRIPE_PRICE_PRACTICE_ANNUAL  = 'price_practice_a'
    vi.resetModules()
    mod = await import('../../api/checkout.js')
    handler = mod.default ?? mod
  })

  it('maps each (plan, billing_period) to the right env-backed price ID', () => {
    const { lookupPriceId } = handler.__test
    expect(lookupPriceId('solo', 'monthly')).toBe('price_solo_m')
    expect(lookupPriceId('solo', 'annual')).toBe('price_solo_a')
    expect(lookupPriceId('pro', 'monthly')).toBe('price_pro_m')
    expect(lookupPriceId('pro', 'annual')).toBe('price_pro_a')
    expect(lookupPriceId('practice', 'monthly')).toBe('price_practice_m')
    expect(lookupPriceId('practice', 'annual')).toBe('price_practice_a')
    expect(lookupPriceId('free', 'monthly')).toBeNull()
  })

  it('returns null when the env var is unset', () => {
    delete process.env.STRIPE_PRICE_SOLO_MONTHLY
    const { lookupPriceId } = handler.__test
    expect(lookupPriceId('solo', 'monthly')).toBeNull()
  })

  it('creates a subscription Stripe checkout session for annual', async () => {
    let captured: any = null
    handler.__test.setStripe({
      checkout: { sessions: { create: async (params: any) => { captured = params; return { id: 'cs_1', url: 'https://stripe/cs_1' } } } },
    })

    const req: any = { method: 'POST', headers: {}, body: { plan: 'pro', billing_period: 'annual', userId: 'u_1', userEmail: 'a@b.c' } }
    const res: any = { _status: 200, _body: null }
    res.status = (c: number) => { res._status = c; return res }
    res.json = (b: any) => { res._body = b; return res }
    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._body.url).toBe('https://stripe/cs_1')
    expect(captured.mode).toBe('subscription')
    expect(captured.line_items[0].price).toBe('price_pro_a')
    expect(captured.metadata).toMatchObject({ user_id: 'u_1', plan: 'pro', billing_period: 'annual' })
  })
})

// ─── webhook: subscription grant & annual_renewal_at ───────────────
describe('webhook — subscription credit grants', () => {
  let handler: any
  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    vi.resetModules()
    const mod: any = await import('../../api/webhook.js')
    handler = mod.default ?? mod
  })

  it('annual checkout grants the MONTHLY allotment (not 12x) and sets renewal date', async () => {
    const supabase = makeMockSupabase({
      profiles: [{ id: 'u_1', credits_remaining: 0 }],
    })
    handler.__test.setSupabase(supabase)
    handler.__test.setStripe({ webhooks: { constructEvent: () => ({
      id: 'evt_annual_1',
      type: 'checkout.session.completed',
      data: { object: {
        metadata: { user_id: 'u_1', plan: 'pro', billing_period: 'annual' },
        customer: 'cus_x', subscription: 'sub_x',
        id: 'cs_1', amount_total: 329000,
      } },
    }) } })

    // Stub req as readable stream
    const { Readable } = await import('node:stream')
    const req: any = Object.assign(Readable.from(Buffer.from('{}')), {
      method: 'POST', headers: { 'stripe-signature': 'sig' }, url: '/api/webhook',
    })
    const res: any = { _status: 200, _body: null }
    res.status = (c: number) => { res._status = c; return res }
    res.json = (b: any) => { res._body = b; return res }
    res.end = () => res
    await handler(req, res)

    expect(res._status).toBe(200)
    const profile = supabase.state.profiles[0]
    expect(profile.plan).toBe('pro')
    expect(profile.billing_period).toBe('annual')
    expect(profile.credits_remaining).toBe(200) // 200, NOT 2400
    expect(profile.annual_renewal_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(supabase.state.credits_ledger.length).toBe(1)
    expect(supabase.state.credits_ledger[0]).toMatchObject({ amount: 200, reason: 'subscription_grant' })
  })

  it('subscription cancel-at-period-end marks status canceling, keeps plan', async () => {
    const supabase = makeMockSupabase({
      profiles: [{ id: 'u_1', stripe_customer_id: 'cus_x', plan: 'pro', credits_remaining: 200, subscription_status: 'active' }],
    })
    handler.__test.setSupabase(supabase)

    const { processSubscriptionUpdated } = handler.__test
    const result = await processSubscriptionUpdated(supabase, {
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_x', cancel_at_period_end: true, status: 'active' } },
    })

    expect(result.action).toBe('canceling_at_period_end')
    expect(supabase.state.profiles[0].subscription_status).toBe('canceling')
    expect(supabase.state.profiles[0].plan).toBe('pro') // unchanged
    expect(supabase.state.profiles[0].credits_remaining).toBe(200) // unchanged
  })

  it('subscription.deleted reverts the user to free tier with 1 credit', async () => {
    const supabase = makeMockSupabase({
      profiles: [{ id: 'u_1', stripe_customer_id: 'cus_x', plan: 'pro', credits_remaining: 200, subscription_status: 'canceling', billing_period: 'annual', annual_renewal_at: '2027-01-01' }],
    })
    handler.__test.setSupabase(supabase)

    const { processSubscriptionDeleted } = handler.__test
    await processSubscriptionDeleted(supabase, {
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_x' } },
    }, {})

    const p = supabase.state.profiles[0]
    expect(p.plan).toBe('free')
    expect(p.subscription_status).toBe('free')
    expect(p.credits_remaining).toBe(1)
    expect(p.billing_period).toBe('monthly')
    expect(p.annual_renewal_at).toBeNull()
  })
})

// ─── monthly cron: annual subscriber grants only ───────────────────
describe('cron-monthly-credit-grant', () => {
  it('grants the right credits to annual subscribers; ignores monthly ones', async () => {
    const supabase = makeMockSupabase({
      profiles: [
        { id: 'u_solo_a',     plan: 'solo',     billing_period: 'annual',  subscription_status: 'active', credits_remaining: 0 },
        { id: 'u_pro_a',      plan: 'pro',      billing_period: 'annual',  subscription_status: 'active', credits_remaining: 50 },
        { id: 'u_practice_a', plan: 'practice', billing_period: 'annual',  subscription_status: 'active', credits_remaining: 0 },
        { id: 'u_pro_m',      plan: 'pro',      billing_period: 'monthly', subscription_status: 'active', credits_remaining: 0 },  // monthly — skip
        { id: 'u_pro_canc',   plan: 'pro',      billing_period: 'annual',  subscription_status: 'canceling', credits_remaining: 0 }, // canceling — skip
      ],
      ledger: [],
    })

    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
    vi.resetModules()
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => supabase }))
    const { runMonthlyCreditGrant } = await import('../../scripts/cron-monthly-credit-grant')

    const r = await runMonthlyCreditGrant(new Date('2026-05-01T00:00:00Z'))
    expect(r.ok).toBe(true)
    expect(r.granted_count).toBe(3)
    expect(r.total_credits).toBe(50 + 200 + 500)

    expect(supabase.state.profiles.find(p => p.id === 'u_solo_a').credits_remaining).toBe(50)
    expect(supabase.state.profiles.find(p => p.id === 'u_pro_a').credits_remaining).toBe(250) // 50 + 200
    expect(supabase.state.profiles.find(p => p.id === 'u_practice_a').credits_remaining).toBe(500)
    expect(supabase.state.profiles.find(p => p.id === 'u_pro_m').credits_remaining).toBe(0) // monthly — untouched
    expect(supabase.state.profiles.find(p => p.id === 'u_pro_canc').credits_remaining).toBe(0) // canceling — untouched

    // 3 ledger rows, all referencing 2026-05
    expect(supabase.state.credits_ledger.length).toBe(3)
    for (const row of supabase.state.credits_ledger) {
      expect(row.reference_id).toBe('monthly-grant-2026-05')
      expect(row.reason).toBe('monthly_grant')
    }

    // Idempotency: running again in the same month grants nothing
    const r2 = await runMonthlyCreditGrant(new Date('2026-05-15T00:00:00Z'))
    expect(r2.granted_count).toBe(0)
    expect(r2.skipped_already_granted).toBe(3)
    expect(supabase.state.profiles.find(p => p.id === 'u_pro_a').credits_remaining).toBe(250) // unchanged

    vi.doUnmock('@supabase/supabase-js')
  })
})
