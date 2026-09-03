/**
 * /api/webhook — Stripe lifecycle gaps closed by audit 2026-09 H5.
 *
 *   • invoice.paid (subscription_cycle) grants the plan's monthly credits
 *     ONCE per invoice (ledger reference 'cycle-<invoice>'), skips the
 *     first invoice, and only rolls the renewal date for annual customers
 *   • customer.subscription.updated maps the Stripe price to plan /
 *     billing_period / monthly_credit_limit (portal plan switches)
 *   • raw Stripe statuses are mapped to the app vocabulary
 *   • an admin 'suspended' flag is never overwritten by Stripe
 *   • subscription.deleted writes a ledger row for the reset
 *   • every credit movement goes through grant_credits (balance + ledger
 *     in one call); the handler never does select→compute→update
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

type Profile = Record<string, unknown> & { id: string }
function makeMock(initial: { profiles?: Profile[]; ledger?: Array<Record<string, unknown>> } = {}) {
  const state = {
    profiles: [...(initial.profiles || [])] as Profile[],
    ledger: [...(initial.ledger || [])] as Array<Record<string, unknown>>,
    rpcCalls: [] as Array<{ name: string; params: Record<string, unknown> }>,
    profileUpdates: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }>,
  }
  const client: any = {
    state,
    rpc: async (name: string, params: any) => {
      state.rpcCalls.push({ name, params })
      if (name === 'claim_stripe_event') return { data: true, error: null }
      if (name === 'grant_credits') {
        const p = state.profiles.find((x) => x.id === params.p_user_id)
        if (!p) return { data: null, error: { message: 'profile_not_found' } }
        const before = (p.credits_remaining as number) || 0
        const after = Math.max(0, before + params.p_amount)
        p.credits_remaining = after
        state.ledger.push({ user_id: params.p_user_id, amount: after - before, reason: params.p_reason, reference_id: params.p_reference_id, balance_after: after })
        return { data: after, error: null }
      }
      return { data: null, error: null }
    },
    from: (table: string) => {
      const ctx: any = { filters: {}, patch: undefined, isDelete: false }
      const rows = () => (table === 'profiles' ? state.profiles : table === 'credits_ledger' ? state.ledger : []) as Array<Record<string, unknown>>
      const matches = () => rows().filter((r) => Object.entries(ctx.filters).every(([k, v]) => r[k] === v))
      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          ctx.filters[col] = val
          if (ctx.patch !== undefined) {
            for (const m of matches()) Object.assign(m, ctx.patch)
            state.profileUpdates.push({ patch: ctx.patch, filters: { ...ctx.filters } })
            return Promise.resolve({ data: null, error: null })
          }
          if (ctx.isDelete) return Promise.resolve({ data: null, error: null })
          return chain
        },
        single: async () => ({ data: matches()[0] ?? null, error: matches()[0] ? null : { message: 'no rows' } }),
        limit: async () => ({ data: matches(), error: null }),
        update: (patch: Record<string, unknown>) => { ctx.patch = patch; return chain },
        insert: async (row: Record<string, unknown>) => { if (table === 'credits_ledger') state.ledger.push(row); return { data: null, error: null } },
        delete: () => { ctx.isDelete = true; return chain },
      }
      return chain
    },
  }
  return client
}

let t: any
beforeEach(async () => {
  process.env.STRIPE_PRICE_SOLO_MONTHLY = 'price_solo_m'
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_pro_a'
  process.env.STRIPE_PRICE_PRACTICE_MONTHLY = 'price_practice_m'
  vi.resetModules()
  const mod: any = await import('../../api/webhook.js')
  t = mod.__test
})

const invoice = (over: Record<string, unknown> = {}) => ({
  type: 'invoice.paid',
  id: 'evt_inv',
  data: { object: { id: 'in_100', customer: 'cus_1', subscription: 'sub_1', billing_reason: 'subscription_cycle', ...over } },
})

describe('invoice.paid — monthly renewal', () => {
  it('grants the plan allotment through grant_credits with reference cycle-<invoice>', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'solo', billing_period: 'monthly', credits_remaining: 3, subscription_status: 'active' }] })
    const r = await t.processInvoicePaid(sb, invoice(), {})
    expect(r.status).toBe('success')
    expect(r.credits).toBe(50)
    expect(sb.state.profiles[0].credits_remaining).toBe(53)
    expect(sb.state.ledger).toHaveLength(1)
    expect(sb.state.ledger[0]).toMatchObject({ user_id: 'u1', amount: 50, reason: 'monthly_cycle', reference_id: 'cycle-in_100' })
    expect(sb.state.rpcCalls.map((c) => c.name)).toEqual(['grant_credits'])
  })

  it('is idempotent on the ledger reference even under a NEW event id', async () => {
    const sb = makeMock({
      profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'solo', billing_period: 'monthly', credits_remaining: 53 }],
      ledger: [{ user_id: 'u1', amount: 50, reason: 'monthly_cycle', reference_id: 'cycle-in_100', balance_after: 53 }],
    })
    const r = await t.processInvoicePaid(sb, invoice(), {})
    expect(r.status).toBe('already_granted')
    expect(sb.state.profiles[0].credits_remaining).toBe(53)
    expect(sb.state.ledger).toHaveLength(1)
  })

  it('ignores the first invoice (subscription_create) — checkout.session.completed credits that one', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'solo', billing_period: 'monthly', credits_remaining: 0 }] })
    const r = await t.processInvoicePaid(sb, invoice({ billing_reason: 'subscription_create' }), {})
    expect(r.status).toBe('ignored')
    expect(sb.state.ledger).toHaveLength(0)
  })

  it('rolls annual_renewal_at for an annual customer and does not grant (the cron owns their months)', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'pro', billing_period: 'annual', credits_remaining: 10 }] })
    const r = await t.processInvoicePaid(sb, invoice(), {})
    expect(r.status).toBe('success')
    expect(r.action).toBe('annual_renewal')
    expect(sb.state.profiles[0].annual_renewal_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(sb.state.profiles[0].credits_remaining).toBe(10)
    expect(sb.state.ledger).toHaveLength(0)
  })

  it('skips a customer with no profile', async () => {
    const sb = makeMock()
    const r = await t.processInvoicePaid(sb, invoice(), {})
    expect(r.status).toBe('skipped')
  })
})

describe('customer.subscription.updated', () => {
  const upd = (object: Record<string, unknown>) => ({ type: 'customer.subscription.updated', data: { object: { customer: 'cus_1', ...object } } })

  it('maps a portal plan switch (price id) to plan / billing_period / monthly_credit_limit', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'solo', billing_period: 'monthly', monthly_credit_limit: 50, subscription_status: 'active' }] })
    const r = await t.processSubscriptionUpdated(sb, upd({ status: 'active', items: { data: [{ price: { id: 'price_pro_a' } }] } }))
    expect(r.status).toBe('success')
    expect(sb.state.profiles[0]).toMatchObject({ plan: 'pro', billing_period: 'annual', monthly_credit_limit: 200, subscription_status: 'active' })
  })

  it('leaves the plan alone for an unknown price id', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'solo', subscription_status: 'active' }] })
    await t.processSubscriptionUpdated(sb, upd({ status: 'active', items: { data: [{ price: { id: 'price_unknown' } }] } }))
    expect(sb.state.profiles[0].plan).toBe('solo')
  })

  it('maps raw Stripe statuses to the app vocabulary', async () => {
    const cases: Array<[string, string]> = [['trialing', 'active'], ['past_due', 'past_due'], ['unpaid', 'past_due'], ['paused', 'paused'], ['incomplete_expired', 'canceled']]
    for (const [raw, mapped] of cases) {
      const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', subscription_status: 'active' }] })
      await t.processSubscriptionUpdated(sb, upd({ status: raw }))
      expect(sb.state.profiles[0].subscription_status, raw).toBe(mapped)
    }
    expect(t.mapStripeStatus('made_up')).toBeNull()
  })

  it('never overwrites an admin suspension (subscription_status or account_status)', async () => {
    for (const p of [
      { id: 'u1', stripe_customer_id: 'cus_1', subscription_status: 'suspended' },
      { id: 'u1', stripe_customer_id: 'cus_1', subscription_status: 'active', account_status: 'suspended' },
    ]) {
      const sb = makeMock({ profiles: [p] })
      const r = await t.processSubscriptionUpdated(sb, upd({ status: 'active' }))
      expect(r.status).toBe('skipped')
      expect(sb.state.profiles[0].subscription_status).toBe(p.subscription_status)
      const r2 = await t.processSubscriptionUpdated(sb, upd({ cancel_at_period_end: true, status: 'active' }))
      expect(r2.action).toBe('canceling_at_period_end')
      expect(sb.state.profiles[0].subscription_status).toBe(p.subscription_status)
    }
  })
})

describe('customer.subscription.deleted', () => {
  const del = { type: 'customer.subscription.deleted', id: 'evt_del', data: { object: { customer: 'cus_1', id: 'sub_9' } } }

  it('reverts to free with a ledger row recording the reset', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'pro', credits_remaining: 120, subscription_status: 'canceling', billing_period: 'annual', annual_renewal_at: '2027-01-01', monthly_credit_limit: 200 }] })
    const r = await t.processSubscriptionDeleted(sb, del, {})
    expect(r.status).toBe('success')
    expect(sb.state.profiles[0]).toMatchObject({ plan: 'free', credits_remaining: 1, monthly_credit_limit: 1, billing_period: 'monthly', annual_renewal_at: null, subscription_status: 'free' })
    expect(sb.state.ledger).toHaveLength(1)
    expect(sb.state.ledger[0]).toMatchObject({ user_id: 'u1', amount: -119, reason: 'subscription_reset', reference_id: 'sub-deleted-sub_9', balance_after: 1 })
  })

  it('keeps an admin suspension while still reverting the plan', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', stripe_customer_id: 'cus_1', plan: 'pro', credits_remaining: 5, subscription_status: 'suspended' }] })
    const r = await t.processSubscriptionDeleted(sb, del, {})
    expect(r.suspended_kept).toBe(true)
    expect(sb.state.profiles[0]).toMatchObject({ plan: 'free', credits_remaining: 1, subscription_status: 'suspended' })
  })
})

describe('checkout.session.completed', () => {
  it('sets monthly_credit_limit and grants through grant_credits (no select→compute→update)', async () => {
    const sb = makeMock({ profiles: [{ id: 'u1', credits_remaining: 1 }] })
    const ev = { type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1', plan: 'practice', billing_period: 'monthly' }, customer: 'cus_1', subscription: 'sub_1', id: 'cs_1', amount_total: 74900 } } }
    const r = await t.processCheckoutCompleted(sb, ev, {})
    expect(r.new_balance).toBe(501)
    expect(sb.state.profiles[0]).toMatchObject({ plan: 'practice', monthly_credit_limit: 500, credits_remaining: 501, stripe_customer_id: 'cus_1', subscription_status: 'active' })
    expect(sb.state.rpcCalls.filter((c) => c.name === 'grant_credits')).toHaveLength(1)
    expect(sb.state.profileUpdates.some((u) => 'credits_remaining' in u.patch)).toBe(false)
  })
})
