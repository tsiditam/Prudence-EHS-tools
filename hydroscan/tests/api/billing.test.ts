// @vitest-environment node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Phase 6 — billing tests. Stripe + Supabase are injected via each handler's
 * module.exports.__test hooks (vi.mock doesn't reliably intercept require()).
 * Covers webhook idempotency (no double credit grant), credit consume + the
 * out-of-credits path, and checkout validation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import webhook from '../../api/webhook.js'
import credits from '../../api/credits.js'
import checkout from '../../api/checkout.js'

function res() {
  return {
    code: 0, body: null as any,
    status(c: number) { this.code = c; return this },
    json(b: any) { this.body = b; return this },
    setHeader() {}, write() {}, end() {},
  }
}

function mockSupabase(opts: any = {}) {
  const calls: any = { webhookInserts: 0, upserts: [], ledger: [], updates: [] }
  const sb: any = {
    calls,
    auth: { getUser: async () => ({ data: { user: opts.user || null } }) },
    from(table: string) {
      return {
        insert: async (row: any) => {
          if (table === 'stripe_webhook_events') { calls.webhookInserts++; return { error: opts.webhookDup ? { code: '23505' } : null } }
          if (table === 'credit_ledger') { calls.ledger.push(row); return { error: null } }
          return { error: null }
        },
        upsert: async (row: any) => { if (table === 'billing_credits') calls.upserts.push(row); return { error: null } },
        update(row: any) { calls.updates.push({ table, row }); return { eq: async () => ({ error: null }) } },
        select() { return { eq: () => ({ single: async () => ({ data: opts.balanceRow ?? null }) }) } },
        delete() { return { eq: async () => ({ error: null }) } },
      }
    },
  }
  return sb
}

beforeEach(() => {
  webhook.__test.reset(); credits.__test.reset(); checkout.__test.reset()
})

describe('webhook — plan extraction + grant', () => {
  it('planForEvent reads checkout.session.completed metadata', () => {
    const ev = { type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1', plan: 'pro' } } } }
    expect(webhook.planForEvent(ev)).toEqual({ userId: 'u1', plan: 'pro' })
  })

  it('grantCredits writes the plan balance + a ledger row', async () => {
    const sb = mockSupabase()
    await webhook.grantCredits(sb, 'u1', 'solo')
    expect(sb.calls.upserts[0]).toMatchObject({ user_id: 'u1', plan: 'solo', balance: 20 })
    expect(sb.calls.ledger[0]).toMatchObject({ user_id: 'u1', delta: 20 })
  })
})

describe('webhook — idempotency', () => {
  const event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1', plan: 'pro' } } } }

  it('grants on first delivery', async () => {
    const sb = mockSupabase()
    webhook.__test.setStripe({ webhooks: { constructEvent: () => event } })
    webhook.__test.setSupabase(sb)
    const r = res()
    await webhook({ method: 'POST', headers: { 'stripe-signature': 's' }, body: Buffer.from('{}') }, r)
    expect(r.code).toBe(200)
    expect(sb.calls.upserts.length).toBe(1)
  })

  it('a replayed event is a no-op (no double grant)', async () => {
    const sb = mockSupabase({ webhookDup: true })
    webhook.__test.setStripe({ webhooks: { constructEvent: () => event } })
    webhook.__test.setSupabase(sb)
    const r = res()
    await webhook({ method: 'POST', headers: { 'stripe-signature': 's' }, body: Buffer.from('{}') }, r)
    expect(r.code).toBe(200)
    expect(r.body.duplicate).toBe(true)
    expect(sb.calls.upserts.length).toBe(0)
  })
})

describe('credits — consume + out-of-credits', () => {
  it('consumes a credit and returns the new balance', async () => {
    credits.__test.setSupabase(mockSupabase({ user: { id: 'u1' }, balanceRow: { plan: 'solo', balance: 5 } }))
    const r = res()
    await credits({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { amount: 1 } }, r)
    expect(r.code).toBe(200)
    expect(r.body.balance).toBe(4)
  })

  it('returns 402 when out of credits', async () => {
    credits.__test.setSupabase(mockSupabase({ user: { id: 'u1' }, balanceRow: { plan: 'free', balance: 0 } }))
    const r = res()
    await credits({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { amount: 1 } }, r)
    expect(r.code).toBe(402)
  })

  it('unlimited plan (-1) never blocks', async () => {
    credits.__test.setSupabase(mockSupabase({ user: { id: 'u1' }, balanceRow: { plan: 'practice', balance: -1 } }))
    const r = res()
    await credits({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { amount: 3 } }, r)
    expect(r.code).toBe(200)
    expect(r.body.unlimited).toBe(true)
  })
})

describe('checkout — validation', () => {
  it('401 without a signed-in user', async () => {
    checkout.__test.setStripe({})
    checkout.__test.setSupabase(mockSupabase({ user: null }))
    const r = res()
    await checkout({ method: 'POST', headers: {}, body: { plan: 'pro' } }, r)
    expect(r.code).toBe(401)
  })

  it('400 when no price is configured for the plan', async () => {
    checkout.__test.setStripe({})
    checkout.__test.setSupabase(mockSupabase({ user: { id: 'u1', email: 'a@b.c' } }))
    const r = res()
    await checkout({ method: 'POST', headers: {}, body: { plan: 'pro', interval: 'monthly' } }, r)
    expect(r.code).toBe(400)
  })
})
