/**
 * /api/sites — CRUD endpoint tests.
 *
 * Covers list / save (insert + update) / delete actions, Bearer auth,
 * payload validation, next_due_at computation, and the
 * computeNextDueAt pure helper.
 *
 * Mirrors the test pattern in tests/api/field-assistant-feedback.test.ts:
 * a stateful mock of the supabase chain injected via __test.setSupabase.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import handler, { __test } from '../../api/sites'

interface MockRes {
  _statusCode: number
  _body: unknown
  statusCode: number
  body: unknown
  status(n: number): MockRes
  json(b: unknown): void
}

function makeReq(opts: {
  method?: string
  auth?: string
  body?: unknown
} = {}) {
  return {
    method: opts.method ?? 'POST',
    headers: { authorization: opts.auth },
    body: opts.body,
  } as unknown as Parameters<typeof handler>[0]
}

function makeRes() {
  const res = {
    _statusCode: 0,
    _body: undefined as unknown,
    statusCode: 0,
    body: undefined as unknown,
    status(n: number) { this._statusCode = n; this.statusCode = n; return this },
    json(b: unknown) { this._body = b; this.body = b },
  }
  return res as MockRes
}

interface MockSite {
  id: string
  user_id: string
  name: string
  address: string | null
  building_type: string | null
  notes: string | null
  reassessment_interval_months: number
  last_finalized_at: string | null
  next_due_at: string | null
  disabled_at: string | null
  created_at: string
  updated_at: string
}

interface MockSupabaseOpts {
  user?: { id: string; email?: string } | null
  authError?: { message: string } | null
  initialSites?: MockSite[]
  selectError?: { message: string } | null
  insertError?: { message: string } | null
  updateError?: { message: string } | null
  deleteError?: { message: string } | null
}

function makeMockSupabase(opts: MockSupabaseOpts = {}) {
  const sites: MockSite[] = [...(opts.initialSites || [])]
  const inserts: MockSite[] = []
  const updates: Array<{ id: string; patch: Partial<MockSite> }> = []
  const deletes: string[] = []
  let nextId = sites.length + 100
  const user = opts.user === undefined
    ? { id: 'user-1', email: 'u@example.test' }
    : opts.user

  function fromSites() {
    const ctx: { filters: Record<string, unknown>; patch?: Partial<MockSite>; mode?: 'delete' } = { filters: {} }
    let chainResolved = false
    const chain: Record<string, unknown> = {
      select(_cols?: string) { return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      maybeSingle() {
        chainResolved = true
        if (ctx.mode === 'delete') return Promise.resolve({ data: null, error: opts.deleteError ?? null })
        // For update().eq().eq().select().maybeSingle() pattern
        const match = sites.find(s => Object.entries(ctx.filters).every(([k, v]) => (s as unknown as Record<string, unknown>)[k] === v))
        if (ctx.patch && match) {
          Object.assign(match, ctx.patch, { updated_at: new Date().toISOString() })
          updates.push({ id: match.id, patch: { ...ctx.patch } })
          return Promise.resolve({ data: match, error: opts.updateError ?? null })
        }
        return Promise.resolve({ data: match || null, error: null })
      },
      single() {
        chainResolved = true
        // For insert().select().single() pattern
        return Promise.resolve({ data: inserts[inserts.length - 1] || null, error: opts.insertError ?? null })
      },
      order() { return chain },
      update(patch: Partial<MockSite>) { ctx.patch = patch; return chain },
      insert(row: Record<string, unknown>) {
        const inserted: MockSite = {
          id: `site-${nextId++}`,
          user_id: (row.user_id as string) || (user?.id || ''),
          name: (row.name as string) || '',
          address: (row.address as string) ?? null,
          building_type: (row.building_type as string) ?? null,
          notes: (row.notes as string) ?? null,
          reassessment_interval_months: (row.reassessment_interval_months as number) ?? 12,
          last_finalized_at: (row.last_finalized_at as string) ?? null,
          next_due_at: (row.next_due_at as string) ?? null,
          disabled_at: (row.disabled_at as string) ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        sites.push(inserted)
        inserts.push(inserted)
        return chain
      },
      delete() { ctx.mode = 'delete'; return chain },
      then(resolve: (v: unknown) => void) {
        if (chainResolved) return
        chainResolved = true
        if (ctx.mode === 'delete') {
          const before = sites.length
          for (let i = sites.length - 1; i >= 0; i--) {
            const s = sites[i]
            if (Object.entries(ctx.filters).every(([k, v]) => (s as unknown as Record<string, unknown>)[k] === v)) {
              sites.splice(i, 1)
              deletes.push(s.id)
            }
          }
          resolve({ data: null, error: opts.deleteError ?? (before === sites.length ? null : null) })
          return
        }
        // list path: select().eq().order()
        const filtered = sites.filter(s => Object.entries(ctx.filters).every(([k, v]) => (s as unknown as Record<string, unknown>)[k] === v))
        resolve({ data: filtered, error: opts.selectError ?? null })
      },
    }
    return chain
  }

  return {
    state: { sites, inserts, updates, deletes },
    auth: {
      getUser: async () => ({
        data: { user: user as unknown },
        error: opts.authError ?? null,
      }),
    },
    from(table: string) {
      if (table !== 'sites') throw new Error('unexpected table: ' + table)
      return fromSites()
    },
  }
}

beforeEach(() => { __test.reset() })

describe('/api/sites — auth + method', () => {
  it('GET → 405 method_not_allowed', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res as never)
    expect(res._statusCode).toBe(405)
  })

  it('missing Bearer → 401 not_authenticated', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { action: 'list' } }), res as never)
    expect(res._statusCode).toBe(401)
    expect(res._body).toEqual({ error: 'not_authenticated' })
  })

  it('invalid token → 401 invalid_token', async () => {
    __test.setSupabase(makeMockSupabase({
      user: null, authError: { message: 'bad token' },
    }) as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer x', body: { action: 'list' } }),
      res as never,
    )
    expect(res._statusCode).toBe(401)
    expect(res._body).toEqual({ error: 'invalid_token' })
  })

  it('bad action → 400 bad_action', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'frobnicate' } }),
      res as never,
    )
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'bad_action' })
  })

  it('malformed JSON body → 400 bad_input', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(makeReq({ auth: 'Bearer t', body: 'not-json' }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'bad_input' })
  })
})

describe('/api/sites — list', () => {
  it('returns the user-scoped sites (RLS surrogate via user_id filter)', async () => {
    const sb = makeMockSupabase({
      initialSites: [
        { id: 'site-a', user_id: 'user-1', name: 'Acme HQ', address: null, building_type: null, notes: null, reassessment_interval_months: 12, last_finalized_at: null, next_due_at: null, disabled_at: null, created_at: '', updated_at: '' },
      ],
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(makeReq({ auth: 'Bearer t', body: { action: 'list' } }), res as never)
    expect(res._statusCode).toBe(200)
    expect((res._body as { sites: unknown[] }).sites).toHaveLength(1)
  })
})

describe('/api/sites — save (insert)', () => {
  it('rejects when no site object is supplied', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(makeReq({ auth: 'Bearer t', body: { action: 'save' } }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'site_required' })
  })

  it('rejects when name is missing', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'save', site: {} } }),
      res as never,
    )
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'name_required' })
  })

  it('inserts with computed next_due_at when last_finalized_at is supplied', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    const finalizedAt = '2026-05-29T12:00:00.000Z'
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { action: 'save', site: { name: 'Acme HQ', address: '100 Main St', last_finalized_at: finalizedAt } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.inserts).toHaveLength(1)
    const inserted = sb.state.inserts[0]
    expect(inserted.name).toBe('Acme HQ')
    expect(inserted.address).toBe('100 Main St')
    expect(inserted.reassessment_interval_months).toBe(12)
    expect(inserted.last_finalized_at).toBe(finalizedAt)
    expect(inserted.next_due_at).not.toBeNull()
    // 12 months later (handles month-end edge cases).
    const due = new Date(inserted.next_due_at as string)
    expect(due.getUTCFullYear()).toBe(2027)
  })

  it('clamps over-large interval to the max', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { action: 'save', site: { name: 'X', reassessment_interval_months: 9999 } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.inserts[0].reassessment_interval_months).toBe(__test.MAX_INTERVAL_MONTHS)
  })

  it('uses default of 12 months when interval is missing', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'save', site: { name: 'X' } } }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.inserts[0].reassessment_interval_months).toBe(12)
  })

  it('caps long name', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'save', site: { name: 'a'.repeat(500) } } }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.inserts[0].name.length).toBe(__test.MAX_NAME_LEN)
  })
})

describe('/api/sites — save (update)', () => {
  it('updates an existing site by id; touches user_id filter for RLS', async () => {
    const initial = {
      id: 'site-a', user_id: 'user-1', name: 'Old Name', address: null,
      building_type: null, notes: null, reassessment_interval_months: 12,
      last_finalized_at: null, next_due_at: null, disabled_at: null,
      created_at: '', updated_at: '',
    }
    const sb = makeMockSupabase({ initialSites: [initial] })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { action: 'save', site: { id: 'site-a', name: 'New Name' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.sites[0].name).toBe('New Name')
    expect(sb.state.updates).toHaveLength(1)
  })

  it('404 when the id is not the caller\'s site', async () => {
    const sb = makeMockSupabase()  // empty
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { action: 'save', site: { id: 'site-missing', name: 'X' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(404)
    expect(res._body).toEqual({ error: 'site_not_found' })
  })

  it('disabled:true populates disabled_at', async () => {
    const initial = {
      id: 'site-a', user_id: 'user-1', name: 'A', address: null,
      building_type: null, notes: null, reassessment_interval_months: 12,
      last_finalized_at: null, next_due_at: null, disabled_at: null,
      created_at: '', updated_at: '',
    }
    const sb = makeMockSupabase({ initialSites: [initial] })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { action: 'save', site: { id: 'site-a', name: 'A', disabled: true } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.sites[0].disabled_at).not.toBeNull()
  })
})

describe('/api/sites — delete', () => {
  it('rejects without id', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'delete' } }),
      res as never,
    )
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'id_required' })
  })

  it('deletes scoped to user_id', async () => {
    const initial = {
      id: 'site-x', user_id: 'user-1', name: 'X', address: null,
      building_type: null, notes: null, reassessment_interval_months: 12,
      last_finalized_at: null, next_due_at: null, disabled_at: null,
      created_at: '', updated_at: '',
    }
    const sb = makeMockSupabase({ initialSites: [initial] })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { action: 'delete', id: 'site-x' } }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(res._body).toEqual({ ok: true })
    expect(sb.state.sites).toHaveLength(0)
    expect(sb.state.deletes).toEqual(['site-x'])
  })
})

describe('computeNextDueAt', () => {
  it('returns null when last_finalized_at is null', () => {
    expect(__test.computeNextDueAt(null, 12)).toBeNull()
  })

  it('returns null when last_finalized_at is invalid', () => {
    expect(__test.computeNextDueAt('not-a-date', 12)).toBeNull()
  })

  it('adds N months to a valid ISO timestamp', () => {
    const got = __test.computeNextDueAt('2026-05-29T12:00:00.000Z', 12)
    expect(got).not.toBeNull()
    expect(new Date(got!).getUTCFullYear()).toBe(2027)
  })

  it('handles non-12 intervals', () => {
    const got = __test.computeNextDueAt('2026-05-29T12:00:00.000Z', 3)
    expect(got).not.toBeNull()
    const d = new Date(got!)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBeGreaterThanOrEqual(7)  // ~Aug
  })
})
