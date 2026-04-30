/**
 * Tests for /api/webhook idempotency.
 *
 * Stripe retries delivery 2-5x; without an idempotency gate, the same
 * event_id processed multiple times leads to multi-grant of credits.
 * These tests pin the contract:
 *   1. Same checkout.session.completed twice → credits granted ONCE,
 *      second response says already_processed.
 *   2. Same customer.subscription.updated twice → status updated ONCE.
 *   3. New event after a duplicate is processed normally.
 *   4. Webhook signature verification still works (bad sig → 400).
 *   5. Method validation still works (GET → 405).
 *
 * Strategy: dependency-inject mock Stripe and Supabase clients via
 * webhook.js's __test.setStripe / __test.setSupabase hooks. No global
 * vi.mock for these — direct injection is more reliable across CJS
 * boundaries than vi.mock for require()-based modules.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Readable } from 'node:stream'

// auditLog is the only call site we mock via vi.mock — it's CJS
// require() but the test file imports it before webhook.js does, so
// the cache is primed by vi.mock.
vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── Test state captured by mock supabase ──────────────────────────
const claims = new Map<string, { event_id: string; event_type: string; result: unknown }>()
const creditsLedger: Array<{ user_id: string; amount: number; reason: string }> = []
const purchases: Array<Record<string, unknown>> = []
const profileUpdates: Array<{ id?: string; customer?: string; patch: Record<string, unknown> }> = []
let releaseDeleteHits = 0

function resetState() {
  claims.clear()
  creditsLedger.length = 0
  purchases.length = 0
  profileUpdates.length = 0
  releaseDeleteHits = 0
}

// ─── stripe + signature controls ────────────────────────────────────
let nextEvent: { id: string; type: string; data: { object: Record<string, unknown> } } | null = null
let nextSignatureValid = true

function makeStripeMock() {
  return {
    webhooks: {
      constructEvent: (_body: Buffer, sig: string, secret: string) => {
        if (!sig || !secret) throw new Error('missing sig or secret')
        if (!nextSignatureValid) throw new Error('Invalid signature')
        return nextEvent
      },
    },
  }
}

// ─── supabase mock (chainable builder) ──────────────────────────────
function makeChain(table: string): any {
  const ctx: any = { _patch: undefined, _isDelete: false, _filters: {} }
  const finishUpdate = () => {
    profileUpdates.push({
      ...(ctx._filters.id ? { id: String(ctx._filters.id) } : {}),
      ...(ctx._filters.stripe_customer_id ? { customer: String(ctx._filters.stripe_customer_id) } : {}),
      patch: ctx._patch as Record<string, unknown>,
    })
    return Promise.resolve({ data: null, error: null })
  }
  const finishDelete = () => {
    if (table === 'stripe_webhook_events') {
      const id = String(ctx._filters.event_id ?? '')
      if (claims.delete(id)) releaseDeleteHits++
    }
    return Promise.resolve({ data: null, error: null })
  }

  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      ctx._filters[col] = val
      if (ctx._patch !== undefined) return finishUpdate()
      if (ctx._isDelete) return finishDelete()
      return chain
    },
    single: async () => {
      if (table === 'profiles') return { data: { credits_remaining: 0 }, error: null }
      return { data: null, error: null }
    },
    update: (patch: Record<string, unknown>) => {
      ctx._patch = patch
      return chain
    },
    insert: (row: Record<string, unknown>) => {
      if (table === 'credits_ledger') creditsLedger.push(row as any)
      if (table === 'purchases') purchases.push(row)
      return Promise.resolve({ data: null, error: null })
    },
    delete: () => {
      ctx._isDelete = true
      return chain
    },
  }
  return chain
}

function makeSupabaseMock() {
  return {
    rpc: async (name: string, params: any) => {
      if (name === 'claim_stripe_event') {
        const id = params.p_event_id as string
        if (claims.has(id)) return { data: false, error: null }
        claims.set(id, { event_id: id, event_type: params.p_event_type, result: { status: 'claimed' } })
        return { data: true, error: null }
      }
      return { data: null, error: null }
    },
    from: (table: string) => makeChain(table),
  }
}

// ─── helpers for req/res ────────────────────────────────────────────
function makeReq(headers: Record<string, string> = {}) {
  const stream = Readable.from(Buffer.from('{}', 'utf8')) as any
  stream.headers = { 'stripe-signature': 'sig_test', ...headers }
  stream.method = 'POST'
  stream.url = '/api/webhook'
  return stream
}

function makeRes() {
  const res: any = { _status: 200, _body: null, headersSent: false }
  res.status = (code: number) => { res._status = code; return res }
  res.json = (body: any) => { res._body = body; res.headersSent = true; return res }
  res.end = () => { res.headersSent = true; return res }
  return res
}

// ─── test fixture loading ───────────────────────────────────────────
let handler: any

beforeEach(async () => {
  resetState()
  nextSignatureValid = true
  nextEvent = null
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key'

  vi.resetModules()
  const mod: any = await import('../../api/webhook.js')
  handler = mod.default ?? mod
  handler.__test.setStripe(makeStripeMock())
  handler.__test.setSupabase(makeSupabaseMock())
})

// ─── tests ──────────────────────────────────────────────────────────
describe('POST /api/webhook idempotency', () => {
  it('replays checkout.session.completed twice — credits granted exactly once', async () => {
    nextEvent = {
      id: 'evt_dup_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u_1', credits: '50', plan: 'solo' }, customer: 'cus_1', payment_intent: 'pi_1', id: 'cs_1', amount_total: 14900 } },
    }

    const r1 = makeRes()
    await handler(makeReq(), r1)
    expect(r1._status).toBe(200)
    expect(r1._body.status).toBe('success')

    const r2 = makeRes()
    await handler(makeReq(), r2)
    expect(r2._status).toBe(200)
    expect(r2._body.status).toBe('already_processed')

    expect(creditsLedger.length).toBe(1)
    expect(creditsLedger[0]).toMatchObject({ user_id: 'u_1', amount: 50, reason: 'subscription_grant' })
    expect(purchases.length).toBe(1)
  })

  it('replays customer.subscription.updated twice — subscription state updated exactly once', async () => {
    nextEvent = {
      id: 'evt_sub_1',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_2', status: 'active' } },
    }

    const r1 = makeRes()
    await handler(makeReq(), r1)
    expect(r1._status).toBe(200)
    expect(r1._body.status).toBe('success')

    const r2 = makeRes()
    await handler(makeReq(), r2)
    expect(r2._body.status).toBe('already_processed')

    const subUpdates = profileUpdates.filter(p => p.customer === 'cus_2')
    expect(subUpdates.length).toBe(1)
    expect(subUpdates[0].patch).toEqual({ subscription_status: 'active' })
  })

  it('processes a new event normally after a duplicate', async () => {
    nextEvent = {
      id: 'evt_a',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u_a', credits: '50', plan: 'solo' }, customer: 'cus_a', payment_intent: 'pi_a', id: 'cs_a', amount_total: 14900 } },
    }
    await handler(makeReq(), makeRes())
    await handler(makeReq(), makeRes())

    nextEvent = {
      id: 'evt_b',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u_b', credits: '200', plan: 'pro' }, customer: 'cus_b', payment_intent: 'pi_b', id: 'cs_b', amount_total: 34900 } },
    }
    const r3 = makeRes()
    await handler(makeReq(), r3)
    expect(r3._body.status).toBe('success')

    expect(creditsLedger.length).toBe(2)
    expect(creditsLedger.map(c => c.user_id)).toEqual(['u_a', 'u_b'])
  })

  it('returns 400 on invalid Stripe signature', async () => {
    nextSignatureValid = false
    nextEvent = { id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } }
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(400)
    expect(r._body.error).toMatch(/signature/i)
    expect(claims.size).toBe(0)
  })

  it('returns 405 on non-POST method', async () => {
    const req = makeReq()
    req.method = 'GET'
    const r = makeRes()
    await handler(req, r)
    expect(r._status).toBe(405)
  })
})
