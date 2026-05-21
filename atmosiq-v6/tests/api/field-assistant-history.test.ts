/**
 * Tests for /api/field-assistant-history.
 *
 * Pins the contract:
 *   • 405 on non-GET
 *   • 401 on missing auth header
 *   • 401 on invalid auth token
 *   • action=list returns user's conversations with message counts
 *   • action=get with id returns the conversation + ordered messages
 *   • action=get without id returns 400
 *   • action=get for a non-owned id returns 404 (defense-in-depth
 *     against an attacker who knows a foreign conversation_id)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Fake Supabase client ──────────────────────────────────────────
type Conv = { id: string; user_id: string; title: string | null; created_at: string; updated_at: string }
type Msg = { id: string; conversation_id: string; user_id: string; role: 'user' | 'assistant'; content: string; context_view: string | null; created_at: string }

let conversations: Conv[] = []
let messages: Msg[] = []
let nextUser: { id: string; email: string } | null = null
let nextAuthError: { message: string } | null = null

function resetState() {
  conversations = []
  messages = []
  nextUser = { id: 'user-1', email: 'a@b.com' }
  nextAuthError = null
}

function makeChain(table: string): any {
  const ctx = {
    filters: {} as Record<string, unknown>,
    inFilter: null as null | { col: string; values: string[] },
    orderCol: null as null | string,
    orderAsc: false,
    limitN: null as null | number,
  }
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { ctx.filters[col] = val; return chain },
    in: (col: string, values: string[]) => { ctx.inFilter = { col, values }; return chain },
    order: (col: string, opts: { ascending: boolean }) => {
      ctx.orderCol = col; ctx.orderAsc = opts.ascending; return chain
    },
    limit: (n: number) => { ctx.limitN = n; return chain },
    single: async () => {
      if (table === 'field_assistant_conversations') {
        const row = conversations.find((c) =>
          (ctx.filters.id == null || c.id === ctx.filters.id) &&
          (ctx.filters.user_id == null || c.user_id === ctx.filters.user_id),
        )
        return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } }
      }
      return { data: null, error: null }
    },
    // Awaiting the chain (without .single()) resolves to the array form.
    then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) => {
      let rows: unknown[]
      if (table === 'field_assistant_conversations') {
        rows = conversations.filter((c) =>
          (ctx.filters.user_id == null || c.user_id === ctx.filters.user_id),
        )
        if (ctx.orderCol) {
          rows = [...rows].sort((a: any, b: any) => {
            const av = a[ctx.orderCol!]; const bv = b[ctx.orderCol!]
            return ctx.orderAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
          })
        }
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN)
      } else if (table === 'field_assistant_messages') {
        rows = messages.filter((m) => {
          if (ctx.filters.user_id != null && m.user_id !== ctx.filters.user_id) return false
          if (ctx.filters.conversation_id != null && m.conversation_id !== ctx.filters.conversation_id) return false
          if (ctx.inFilter && !ctx.inFilter.values.includes((m as any)[ctx.inFilter.col])) return false
          return true
        })
        if (ctx.orderCol) {
          rows = [...rows].sort((a: any, b: any) => {
            const av = a[ctx.orderCol!]; const bv = b[ctx.orderCol!]
            return ctx.orderAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
          })
        }
      } else {
        rows = []
      }
      return Promise.resolve(onFulfilled({ data: rows, error: null }))
    },
  }
  return chain
}

const fakeSupabase: any = {
  auth: {
    getUser: vi.fn(async (_token: string) => {
      if (nextAuthError) return { data: { user: null }, error: nextAuthError }
      return { data: { user: nextUser }, error: null }
    }),
  },
  from: (table: string) => makeChain(table),
}

// ─── Response stub ─────────────────────────────────────────────────
function makeRes() {
  const r: any = {
    _status: 200,
    _body: null as unknown,
    status(n: number) { r._status = n; return r },
    json(body: unknown) { r._body = body },
  }
  return r
}

// ─── Tests ─────────────────────────────────────────────────────────
describe('/api/field-assistant-history', () => {
  let handler: any
  let __test: any

  beforeEach(async () => {
    resetState()
    const mod = await import('../../api/field-assistant-history')
    handler = mod.default
    __test = mod.__test
    __test.reset()
    __test.setSupabase(fakeSupabase)
  })

  it('rejects non-GET methods with 405', async () => {
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, query: {} } as any, res)
    expect(res._status).toBe(405)
  })

  it('rejects missing auth with 401', async () => {
    const res = makeRes()
    await handler({ method: 'GET', headers: {}, query: { action: 'list' } } as any, res)
    expect(res._status).toBe(401)
  })

  it('rejects invalid token with 401', async () => {
    nextAuthError = { message: 'invalid' }
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer bad' }, query: { action: 'list' } } as any,
      res,
    )
    expect(res._status).toBe(401)
  })

  it('action=list returns owned conversations with message counts, newest first', async () => {
    conversations = [
      { id: 'c1', user_id: 'user-1', title: 'old', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'c2', user_id: 'user-1', title: 'new', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
      { id: 'c3', user_id: 'user-other', title: 'foreign', created_at: '2026-02-15T00:00:00Z', updated_at: '2026-02-15T00:00:00Z' },
    ]
    messages = [
      { id: 'm1', conversation_id: 'c1', user_id: 'user-1', role: 'user', content: 'hi', context_view: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', conversation_id: 'c2', user_id: 'user-1', role: 'user', content: 'hi', context_view: null, created_at: '2026-02-01T00:00:00Z' },
      { id: 'm3', conversation_id: 'c2', user_id: 'user-1', role: 'assistant', content: 'hello', context_view: null, created_at: '2026-02-01T00:00:01Z' },
    ]
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'list' } } as any,
      res,
    )
    expect(res._status).toBe(200)
    const body = res._body as { conversations: Array<{ id: string; message_count: number }> }
    // Foreign conversation excluded; owned ones in updated_at desc order
    expect(body.conversations.map((c) => c.id)).toEqual(['c2', 'c1'])
    const c2 = body.conversations.find((c) => c.id === 'c2')!
    const c1 = body.conversations.find((c) => c.id === 'c1')!
    expect(c2.message_count).toBe(2)
    expect(c1.message_count).toBe(1)
  })

  it('action=list returns empty array when user has no conversations', async () => {
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'list' } } as any,
      res,
    )
    expect(res._status).toBe(200)
    expect((res._body as { conversations: unknown[] }).conversations).toEqual([])
  })

  it('action=get without id returns 400', async () => {
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'get' } } as any,
      res,
    )
    expect(res._status).toBe(400)
  })

  it('action=get for owned conversation returns ordered messages', async () => {
    conversations = [
      { id: 'c1', user_id: 'user-1', title: 'mine', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ]
    messages = [
      { id: 'm2', conversation_id: 'c1', user_id: 'user-1', role: 'assistant', content: 'B', context_view: null, created_at: '2026-01-01T00:00:02Z' },
      { id: 'm1', conversation_id: 'c1', user_id: 'user-1', role: 'user',      content: 'A', context_view: null, created_at: '2026-01-01T00:00:01Z' },
    ]
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'get', id: 'c1' } } as any,
      res,
    )
    expect(res._status).toBe(200)
    const body = res._body as { conversation: { id: string }; messages: Array<{ id: string; content: string }> }
    expect(body.conversation.id).toBe('c1')
    expect(body.messages.map((m) => m.content)).toEqual(['A', 'B'])
  })

  it('action=get for a foreign conversation returns 404', async () => {
    conversations = [
      { id: 'c1', user_id: 'user-other', title: 'foreign', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ]
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'get', id: 'c1' } } as any,
      res,
    )
    expect(res._status).toBe(404)
  })

  it('returns 400 on unknown action', async () => {
    const res = makeRes()
    await handler(
      { method: 'GET', headers: { authorization: 'Bearer ok' }, query: { action: 'frob' } } as any,
      res,
    )
    expect(res._status).toBe(400)
  })
})
