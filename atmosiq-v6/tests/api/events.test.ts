/**
 * /api/events — event-spine endpoint tests.
 *
 * Covers the allowlist gate, auth, payload validation, the
 * audit_log row shape, and best-effort failure modes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler, { __test } from '../../api/events'
import { KNOWN_EVENTS } from '../../lib/events/types'

interface MockRes {
  statusCode: number
  body: unknown
  status(n: number): MockRes
  json(b: unknown): void
}

function makeReq(opts: {
  method?: string
  auth?: string
  body?: unknown
  headers?: Record<string, string>
} = {}) {
  return {
    method: opts.method ?? 'POST',
    headers: {
      authorization: opts.auth,
      ...(opts.headers || {}),
    },
    body: opts.body,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Parameters<typeof handler>[0]
}

function makeRes(): MockRes & { _statusCode: number; _body: unknown } {
  const res = {
    _statusCode: 0,
    _body: undefined as unknown,
    statusCode: 0,
    body: undefined as unknown,
    status(n: number) { this._statusCode = n; this.statusCode = n; return this },
    json(b: unknown) { this._body = b; this.body = b },
  }
  return res as MockRes & { _statusCode: number; _body: unknown }
}

interface InsertCall { table: string; row: Record<string, unknown> }

function makeMockSupabase(opts: {
  user?: { id: string; email?: string } | null
  authError?: { message: string } | null
  insertError?: { message: string } | null
} = {}) {
  const insertCalls: InsertCall[] = []
  const user = opts.user === undefined
    ? { id: 'user-123', email: 'tester@example.test' }
    : opts.user
  return {
    insertCalls,
    auth: {
      getUser: async () => ({
        data: { user: user as unknown },
        error: opts.authError ?? null,
      }),
    },
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          insertCalls.push({ table, row })
          return { error: opts.insertError ?? null }
        },
      }
    },
  }
}

beforeEach(() => { __test.reset() })

describe('/api/events — happy path', () => {
  it('accepts every name in KNOWN_EVENTS and writes a row per call', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)

    for (const name of KNOWN_EVENTS) {
      const res = makeRes()
      await handler(
        makeReq({ auth: 'Bearer t', body: { name, target_id: 'draft-1', details: { k: 'v' } } }),
        res as never,
      )
      expect(res._statusCode, name).toBe(200)
      expect(res._body).toEqual({ ok: true })
    }
    expect(sb.insertCalls).toHaveLength(KNOWN_EVENTS.length)
    for (let i = 0; i < KNOWN_EVENTS.length; i++) {
      expect(sb.insertCalls[i].table).toBe('audit_log')
      expect(sb.insertCalls[i].row.action).toBe(KNOWN_EVENTS[i])
    }
  })

  it('row shape: actor_id+actor_email from JWT, target_*, details, ip from x-forwarded-for', async () => {
    const sb = makeMockSupabase({ user: { id: 'u-9', email: 'a@b.test' } })
    __test.setSupabase(sb as never)
    const res = makeRes()

    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'report_exported',
          target_id: 'rpt-42',
          target_type: 'assessment',
          details: { format: 'docx', tot: 62 },
        },
        headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      }),
      res as never,
    )

    expect(res._statusCode).toBe(200)
    expect(sb.insertCalls).toHaveLength(1)
    expect(sb.insertCalls[0].row).toEqual({
      action: 'report_exported',
      actor_id: 'u-9',
      actor_email: 'a@b.test',
      target_type: 'assessment',
      target_id: 'rpt-42',
      details: { format: 'docx', tot: 62 },
      ip_address: '203.0.113.5',
    })
  })

  it('accepts a string body (JSON) — mirrors the test harness shape', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: JSON.stringify({ name: 'engine_ran' }) }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.insertCalls[0].row.action).toBe('engine_ran')
  })

  it('null target_id / target_type / details are tolerated', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'logger_imported', target_id: null, target_type: null, details: null },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.insertCalls[0].row.target_id).toBeNull()
    expect(sb.insertCalls[0].row.target_type).toBeNull()
    expect(sb.insertCalls[0].row.details).toEqual({})
  })
})

describe('/api/events — rejection paths', () => {
  it('GET → 405', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res as never)
    expect(res._statusCode).toBe(405)
  })

  it('missing Bearer → 401 not_authenticated', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { name: 'engine_ran' } }), res as never)
    expect(res._statusCode).toBe(401)
    expect(res._body).toEqual({ error: 'not_authenticated' })
  })

  it('invalid token → 401 invalid_token', async () => {
    __test.setSupabase(makeMockSupabase({
      user: null, authError: { message: 'bad token' },
    }) as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer x', body: { name: 'engine_ran' } }),
      res as never,
    )
    expect(res._statusCode).toBe(401)
    expect(res._body).toEqual({ error: 'invalid_token' })
  })

  it('unknown event name → 400 unknown_event (allowlist gate)', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { name: 'user.suspend' } }),
      res as never,
    )
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'unknown_event' })
  })

  it('missing name → 400 bad_input', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(makeReq({ auth: 'Bearer t', body: {} }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'bad_input' })
  })

  it('malformed JSON body → 400 bad_input', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    await handler(makeReq({ auth: 'Bearer t', body: 'not-json' }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'bad_input' })
  })

  it('oversized details → 400 details_too_large', async () => {
    __test.setSupabase(makeMockSupabase() as never)
    const res = makeRes()
    const big = { blob: 'x'.repeat(__test.MAX_DETAILS_BYTES + 100) }
    await handler(
      makeReq({ auth: 'Bearer t', body: { name: 'engine_ran', details: big } }),
      res as never,
    )
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'details_too_large' })
  })

  it('insert failure → 500 log_failed (no swallowing on server side)', async () => {
    __test.setSupabase(makeMockSupabase({
      insertError: { message: 'rls denied' },
    }) as never)
    const res = makeRes()
    await handler(
      makeReq({ auth: 'Bearer t', body: { name: 'jasper_asked' } }),
      res as never,
    )
    expect(res._statusCode).toBe(500)
    expect(res._body).toEqual({ error: 'log_failed' })
  })
})

describe('/api/events — security guardrails', () => {
  it('actor_id from the request body is IGNORED — only JWT-derived id is written', async () => {
    const sb = makeMockSupabase({ user: { id: 'real-user', email: 'real@x' } })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'engine_ran', actor_id: 'forged-attacker' },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.insertCalls[0].row.actor_id).toBe('real-user')
  })

  it('Array details are rejected as bad-shape (not an object map)', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'engine_ran', details: [1, 2, 3] },
      }),
      res as never,
    )
    // Array is not a plain object — falls through to details = {}.
    expect(res._statusCode).toBe(200)
    expect(sb.insertCalls[0].row.details).toEqual({})
  })

  it('target_id and target_type are length-capped', async () => {
    const sb = makeMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'engine_ran',
          target_id: 'x'.repeat(1000),
          target_type: 'y'.repeat(1000),
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect((sb.insertCalls[0].row.target_id as string).length).toBe(256)
    expect((sb.insertCalls[0].row.target_type as string).length).toBe(64)
  })
})

describe('emitEvent (browser helper)', () => {
  it('returns false when there is no supabase session', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn() as unknown as typeof global.fetch
    // Re-import after stubbing — emit.ts imports the supabase client
    // which is null in the test environment (no VITE_SUPABASE_URL),
    // so emitEvent should return false without ever fetching.
    const { emitEvent } = await import('../../lib/events/emit')
    const ok = await emitEvent('engine_ran', { target_id: 'd-1' })
    expect(ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
    global.fetch = originalFetch
  })
})
