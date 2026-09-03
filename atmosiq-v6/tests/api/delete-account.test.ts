/**
 * Tests for /api/delete-account.
 *
 * Verifies the GDPR/CCPA-compliant hard-delete contract:
 *   • All PII tables purged for the user_id
 *   • early_access_signups purged by email
 *   • Stripe customer canceled + deleted
 *   • auth.users user deleted
 *   • A deletion_audit row written with sha256(user_id)
 *   • Unauthenticated → 401
 *   • Body specifying a different user_id → 403
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'node:crypto'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── Test state ─────────────────────────────────────────────────────
const deletes = new Map<string, Array<Record<string, unknown>>>() // table → filter list
const updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = []
const auditInserts: Array<Record<string, unknown>> = []
const storageLists: Array<{ bucket: string; prefix: string }> = []
const storageRemoves: Array<{ bucket: string; paths: string[] }> = []
// Objects each bucket holds under the user's prefix, per test.
let storageObjects: Record<string, string[]> = {}
let stripeSubscriptionsListed: string[] = []
let stripeSubscriptionsCanceled: string[] = []
let stripeCustomersDeleted: string[] = []
let authDeleteUserCalls: string[] = []

function resetState() {
  deletes.clear()
  updates.length = 0
  auditInserts.length = 0
  storageLists.length = 0
  storageRemoves.length = 0
  storageObjects = { 'report-templates': ['t1.docx', 't2.docx'], 'peer-review-attachments': ['r1.docx'] }
  stripeSubscriptionsListed = []
  stripeSubscriptionsCanceled = []
  stripeCustomersDeleted = []
  authDeleteUserCalls = []
}

// ─── Mock supabase ──────────────────────────────────────────────────
let nextAuthUser: { id: string; email: string } | null = null
let nextAuthError: { message: string } | null = null
let profileRow: Record<string, unknown> | null = null

function makeChain(table: string): any {
  const ctx: any = { _patch: undefined, _isDelete: false, _filters: {} as Record<string, unknown> }
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      ctx._filters[col] = val
      if (ctx._isDelete) {
        if (!deletes.has(table)) deletes.set(table, [])
        deletes.get(table)!.push({ ...ctx._filters })
        return Promise.resolve({ data: null, error: null })
      }
      if (ctx._patch !== undefined) {
        updates.push({ table, patch: ctx._patch, filters: { ...ctx._filters } })
        return Promise.resolve({ data: null, error: null })
      }
      return chain
    },
    update: (patch: Record<string, unknown>) => { ctx._patch = patch; return chain },
    single: async () => {
      if (table === 'profiles') return { data: profileRow, error: null }
      return { data: null, error: null }
    },
    delete: () => { ctx._isDelete = true; return chain },
    insert: (row: Record<string, unknown>) => {
      if (table === 'deletion_audit') auditInserts.push(row)
      return Promise.resolve({ data: null, error: null })
    },
  }
  return chain
}

function makeSupabaseMock() {
  return {
    auth: {
      getUser: async (_jwt: string) => {
        if (nextAuthError) return { data: { user: null }, error: nextAuthError }
        return { data: { user: nextAuthUser }, error: null }
      },
      admin: {
        deleteUser: async (id: string) => {
          authDeleteUserCalls.push(id)
          return { data: null, error: null }
        },
      },
    },
    from: (table: string) => makeChain(table),
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          storageLists.push({ bucket, prefix })
          const names = storageObjects[bucket] || []
          return { data: names.map((name) => ({ name })), error: null }
        },
        remove: async (paths: string[]) => {
          storageRemoves.push({ bucket, paths })
          storageObjects[bucket] = []
          return { data: null, error: null }
        },
      }),
    },
  }
}

function makeStripeMock() {
  return {
    subscriptions: {
      list: async ({ customer }: { customer: string }) => {
        stripeSubscriptionsListed.push(customer)
        return { data: [{ id: 'sub_1', status: 'active' }, { id: 'sub_2', status: 'canceled' }] }
      },
      cancel: async (id: string) => {
        stripeSubscriptionsCanceled.push(id)
        return { id, status: 'canceled' }
      },
    },
    customers: {
      del: async (id: string) => {
        stripeCustomersDeleted.push(id)
        return { deleted: true }
      },
    },
  }
}

// ─── req/res helpers ────────────────────────────────────────────────
function makeReq(opts: { auth?: string; body?: Record<string, unknown> } = {}) {
  return {
    method: 'POST',
    headers: { authorization: opts.auth ?? 'Bearer test-jwt' },
    body: opts.body ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}
function makeRes() {
  const res: any = { _status: 200, _body: null }
  res.status = (code: number) => { res._status = code; return res }
  res.json = (body: any) => { res._body = body; return res }
  res.end = () => res
  return res
}

let handler: any

beforeEach(async () => {
  resetState()
  nextAuthError = null
  nextAuthUser = { id: 'user-uuid-1', email: 'user1@example.com' }
  profileRow = { stripe_customer_id: 'cus_1' }
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  vi.resetModules()
  const mod: any = await import('../../api/delete-account.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
  handler.__test.setStripe(makeStripeMock())
})

// ─── tests ──────────────────────────────────────────────────────────
describe('POST /api/delete-account', () => {
  it('purges all PII tables and returns entities_purged', async () => {
    const r = makeRes()
    await handler(makeReq(), r)

    expect(r._status).toBe(200)
    expect(r._body.status).toBe('deleted')
    const purged = r._body.entities_purged as string[]
    expect(purged).toContain('assessments')
    expect(purged).toContain('credits_ledger')
    expect(purged).toContain('purchases')
    expect(purged).toContain('analytics_events')
    expect(purged).toContain('early_access_signups')
    expect(purged).toContain('profiles')
    expect(purged).toContain('auth_user')

    // Verify each PII table got a delete with user_id filter
    for (const table of ['assessments', 'credits_ledger', 'purchases', 'analytics_events']) {
      expect(deletes.has(table)).toBe(true)
      expect(deletes.get(table)![0]).toEqual({ user_id: 'user-uuid-1' })
    }
    expect(deletes.get('profiles')![0]).toEqual({ id: 'user-uuid-1' })
    expect(deletes.get('early_access_signups')![0]).toEqual({ email: 'user1@example.com' })
  })

  it('cancels Stripe subscriptions and deletes the customer', async () => {
    const r = makeRes()
    await handler(makeReq(), r)

    expect(stripeSubscriptionsListed).toEqual(['cus_1'])
    expect(stripeSubscriptionsCanceled).toEqual(['sub_1']) // sub_2 was already canceled, not re-canceled
    expect(stripeCustomersDeleted).toEqual(['cus_1'])
    const purged = r._body.entities_purged as string[]
    expect(purged).toContain('stripe_customer')
    expect(purged).toContain('stripe_subscriptions')
  })

  it('calls auth.admin.deleteUser last', async () => {
    await handler(makeReq(), makeRes())
    expect(authDeleteUserCalls).toEqual(['user-uuid-1'])
  })

  it('writes a deletion_audit row with sha256(user_id) and no PII', async () => {
    await handler(makeReq(), makeRes())
    expect(auditInserts.length).toBe(1)
    const row = auditInserts[0]
    const expectedHash = crypto.createHash('sha256').update('user-uuid-1').digest('hex')
    expect(row.user_id_hash).toBe(expectedHash)
    expect(row.entities_purged).toEqual(expect.arrayContaining(['profiles', 'credits_ledger', 'auth_user']))
    expect(row.initiated_by).toBe('user')
    // No PII anywhere
    const json = JSON.stringify(row)
    expect(json).not.toContain('user1@example.com')
    expect(json).not.toContain('user-uuid-1') // raw uuid is not stored — only the hash
  })

  it('returns 401 when no Authorization header', async () => {
    const r = makeRes()
    await handler(makeReq({ auth: '' }), r)
    expect(r._status).toBe(401)
  })

  it('returns 401 when JWT is invalid', async () => {
    nextAuthError = { message: 'invalid jwt' }
    nextAuthUser = null
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(401)
  })

  it('returns 403 when body.user_id does not match the JWT user', async () => {
    const r = makeRes()
    await handler(makeReq({ body: { user_id: 'someone-else' } }), r)
    expect(r._status).toBe(403)
    // No deletes happened
    expect(deletes.size).toBe(0)
    expect(authDeleteUserCalls.length).toBe(0)
  })

  it('returns 405 on non-POST method', async () => {
    const req = makeReq()
    req.method = 'GET'
    const r = makeRes()
    await handler(req, r)
    expect(r._status).toBe(405)
  })

  it('ignores a body that claims initiated_by=admin — self-service is always user', async () => {
    await handler(makeReq({ body: { initiated_by: 'admin' } }), makeRes())
    expect(auditInserts[0].initiated_by).toBe('user')
  })

  it('purges marketing_agent_leads by email', async () => {
    const r = makeRes()
    await handler(makeReq(), r)
    expect(deletes.get('marketing_agent_leads')![0]).toEqual({ email: 'user1@example.com' })
    expect(r._body.entities_purged).toContain('marketing_agent_leads')
  })

  it('nulls actor_email + ip_address on the user\'s audit_log rows (by actor_id AND by email)', async () => {
    const r = makeRes()
    await handler(makeReq(), r)
    const auditUpdates = updates.filter((u) => u.table === 'audit_log')
    expect(auditUpdates).toHaveLength(2)
    for (const u of auditUpdates) expect(u.patch).toEqual({ actor_email: null, ip_address: null })
    expect(auditUpdates.map((u) => u.filters)).toEqual([
      { actor_id: 'user-uuid-1' },
      { actor_email: 'user1@example.com' },
    ])
    expect(r._body.entities_purged).toContain('audit_log_pii')
  })

  it('removes every storage object under report-templates/{uid}/ and peer-review-attachments/{uid}/', async () => {
    const r = makeRes()
    await handler(makeReq(), r)
    expect(storageLists.map((l) => `${l.bucket}/${l.prefix}`)).toEqual([
      'report-templates/user-uuid-1',
      'peer-review-attachments/user-uuid-1',
    ])
    expect(storageRemoves).toEqual([
      { bucket: 'report-templates', paths: ['user-uuid-1/t1.docx', 'user-uuid-1/t2.docx'] },
      { bucket: 'peer-review-attachments', paths: ['user-uuid-1/r1.docx'] },
    ])
    expect(r._body.entities_purged).toEqual(expect.arrayContaining(['storage:report-templates', 'storage:peer-review-attachments']))
  })

  it('does not fail the deletion when a storage prefix is empty', async () => {
    storageObjects = { 'report-templates': [], 'peer-review-attachments': [] }
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(storageRemoves).toHaveLength(0)
  })
})
