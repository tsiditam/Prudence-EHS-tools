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

// ─── assessment_finalized dispatch (habit-loop PR 1) ──────────────
//
// When /api/events receives `assessment_finalized` with
// `details.site_id`, it should:
//   1. Look up the user's email_preferences (respect the opt-out).
//   2. Look up the site (respect disabled_at).
//   3. Compute next_due_at from site.last_finalized_at + interval.
//   4. Call enqueueReassessmentReminder.
//
// All wrapped in a best-effort try/catch — a dispatch failure must
// NOT flip the response from 200 to 500, because the audit_log row
// is already written and the user's finalize succeeded from their
// perspective.

interface MockSite {
  id: string
  name: string
  reassessment_interval_months: number
  disabled_at: string | null
  last_finalized_at: string | null
}
interface MockProfile { email_preferences?: { reassessment_reminders?: boolean; sampling_results_outstanding?: boolean } }

function makeDispatchMockSupabase(opts: {
  user?: { id: string; email?: string }
  site?: MockSite | null
  profile?: MockProfile | null
} = {}) {
  const user = opts.user ?? { id: 'user-123', email: 't@e.t' }
  const insertCalls: InsertCall[] = []
  const updateCalls: Array<{ table: string; patch: unknown; filters: unknown[] }> = []
  const queueRows: Array<{ id: number; user_id: string; template_id: string; sent_at: string | null; canceled_at: string | null; payload?: Record<string, unknown> }> = []
  let nextQueueId = 1

  function profilesChain() {
    const ctx: { filters: Record<string, unknown> } = { filters: {} }
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      maybeSingle: () => Promise.resolve({ data: opts.profile === undefined ? null : opts.profile, error: null }),
    }
    return chain
  }
  function sitesChain() {
    const ctx: { filters: Record<string, unknown> } = { filters: {} }
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      maybeSingle: () => Promise.resolve({ data: opts.site === undefined ? null : opts.site, error: null }),
    }
    return chain
  }
  function emailQueueChain() {
    const ctx: { filters: Record<string, unknown>; mode?: 'select' | 'update' | 'insert'; patch?: unknown; inIds?: Array<number | string> } = { filters: {} }
    let chainResolved = false
    const chain: Record<string, unknown> = {
      select() { ctx.mode = 'select'; return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      is(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      in(col: string, vals: Array<number | string>) {
        ctx.inIds = vals
        // Apply the in-list update immediately for the cancel pattern.
        if (ctx.mode === 'update' && ctx.patch) {
          for (const id of vals) {
            const row = queueRows.find(r => r.id === id)
            if (row) Object.assign(row, ctx.patch)
          }
          updateCalls.push({ table: 'email_queue', patch: ctx.patch, filters: [...vals] })
        }
        chainResolved = true
        return Promise.resolve({ data: null, error: null }) as unknown as Record<string, unknown>
      },
      update(patch: unknown) { ctx.mode = 'update'; ctx.patch = patch; return chain },
      insert: async (row: Record<string, unknown>) => {
        const stored = { id: nextQueueId++, sent_at: null, canceled_at: null, user_id: row.user_id as string, template_id: row.template_id as string, scheduled_for: row.scheduled_for, payload: row.payload as Record<string, unknown> }
        queueRows.push(stored as never)
        insertCalls.push({ table: 'email_queue', row })
        return { error: null }
      },
      then(resolve: (v: unknown) => void) {
        if (chainResolved) return
        chainResolved = true
        // select() path: return rows matching filters
        const matches = queueRows.filter(r => Object.entries(ctx.filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v))
        resolve({ data: matches.map(r => ({ id: r.id, payload: r.payload })), error: null })
      },
    }
    return chain
  }

  return {
    state: { insertCalls, updateCalls, queueRows },
    auth: {
      getUser: async () => ({ data: { user: user as unknown }, error: null }),
    },
    from(table: string) {
      if (table === 'audit_log') {
        return { insert: async (row: Record<string, unknown>) => { insertCalls.push({ table, row }); return { error: null } } }
      }
      if (table === 'profiles') return profilesChain()
      if (table === 'sites')    return sitesChain()
      if (table === 'email_queue') return emailQueueChain()
      throw new Error('unexpected table: ' + table)
    },
  }
}

describe('/api/events — assessment_finalized: sampling-results dispatch (habit-loop PR 5)', () => {
  it('enqueues sampling_results.reminder when sampling_plan_size > 0 and no lab results', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          target_id: 'rpt-1',
          target_type: 'assessment',
          details: {
            facility_name: 'Acme HQ',
            sampling_plan_size: 3,
            lab_results_attached: false,
          },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    const queueWrites = sb.state.insertCalls.filter(c => c.table === 'email_queue')
    expect(queueWrites).toHaveLength(1)
    expect(queueWrites[0].row.template_id).toBe('sampling_results.reminder')
    expect((queueWrites[0].row.payload as { report_id: string }).report_id).toBe('rpt-1')
    expect((queueWrites[0].row.payload as { sampling_plan_size: number }).sampling_plan_size).toBe(3)
  })

  it('does NOT enqueue when sampling_plan_size is 0', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          target_id: 'rpt-1',
          details: { sampling_plan_size: 0, lab_results_attached: false },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('does NOT enqueue when lab_results_attached is true at finalize time', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          target_id: 'rpt-1',
          details: { sampling_plan_size: 3, lab_results_attached: true },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('respects opt-out (email_preferences.sampling_results_outstanding=false)', async () => {
    const sb = makeDispatchMockSupabase({
      profile: { email_preferences: { sampling_results_outstanding: false } },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          target_id: 'rpt-1',
          details: { sampling_plan_size: 3, lab_results_attached: false },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('does NOT enqueue when target_id is missing (no report id to anchor)', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          // no target_id
          details: { sampling_plan_size: 3, lab_results_attached: false },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })
})

describe('/api/events — lab_results_attached dispatch (habit-loop PR 5)', () => {
  it('cancels any pending sampling_results.reminder for this report', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)

    // Seed a pending reminder
    sb.state.queueRows.push({
      id: 99, user_id: 'user-123', template_id: 'sampling_results.reminder',
      sent_at: null, canceled_at: null,
      payload: { report_id: 'rpt-7' },
    })

    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'lab_results_attached',
          target_id: 'rpt-7',
          details: { report_id: 'rpt-7' },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    // Update call recorded against the pending row.
    expect(sb.state.updateCalls.length).toBeGreaterThanOrEqual(1)
    const seeded = sb.state.queueRows.find(r => r.id === 99)
    expect(seeded?.canceled_at).toBeTruthy()
  })

  it('is a no-op when no matching pending reminder exists', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'lab_results_attached',
          target_id: 'rpt-x',
          details: { report_id: 'rpt-x' },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
  })
})

describe('/api/events — assessment_finalized dispatch (habit-loop PR 1)', () => {
  const PAST_ISO = '2025-05-29T12:00:00Z'

  it('enqueues a reassessment reminder when site has prior last_finalized_at', async () => {
    const sb = makeDispatchMockSupabase({
      site: {
        id: 'site-a', name: 'Acme HQ',
        reassessment_interval_months: 12,
        disabled_at: null,
        last_finalized_at: PAST_ISO,
      },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()

    await handler(
      makeReq({
        auth: 'Bearer t',
        body: {
          name: 'assessment_finalized',
          target_id: 'rpt-1',
          target_type: 'assessment',
          details: { site_id: 'site-a', score: 71 },
        },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    // One row in audit_log (the event), one row in email_queue (the
    // reminder).
    const auditWrites = sb.state.insertCalls.filter(c => c.table === 'audit_log')
    const queueWrites = sb.state.insertCalls.filter(c => c.table === 'email_queue')
    expect(auditWrites).toHaveLength(1)
    expect(queueWrites).toHaveLength(1)
    expect(queueWrites[0].row.template_id).toBe('reassessment.reminder')
    expect((queueWrites[0].row.payload as { site_id: string }).site_id).toBe('site-a')
  })

  it('does NOT enqueue when details.site_id is missing (user chose "Not now")', async () => {
    const sb = makeDispatchMockSupabase()
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'assessment_finalized', target_id: 'rpt-x', target_type: 'assessment', details: { declined_save: true } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('respects the user opt-out (email_preferences.reassessment_reminders=false)', async () => {
    const sb = makeDispatchMockSupabase({
      profile: { email_preferences: { reassessment_reminders: false } },
      site: { id: 'site-a', name: 'A', reassessment_interval_months: 12, disabled_at: null, last_finalized_at: PAST_ISO },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'assessment_finalized', details: { site_id: 'site-a' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('respects per-site pause (site.disabled_at non-null)', async () => {
    const sb = makeDispatchMockSupabase({
      site: { id: 'site-a', name: 'A', reassessment_interval_months: 12, disabled_at: '2026-01-01T00:00:00Z', last_finalized_at: PAST_ISO },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'assessment_finalized', details: { site_id: 'site-a' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('no-ops when last_finalized_at is null (no cadence anchor yet)', async () => {
    const sb = makeDispatchMockSupabase({
      site: { id: 'site-a', name: 'A', reassessment_interval_months: 12, disabled_at: null, last_finalized_at: null },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'assessment_finalized', details: { site_id: 'site-a' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(sb.state.insertCalls.filter(c => c.table === 'email_queue')).toHaveLength(0)
  })

  it('dispatch failure does NOT flip the 200 to a 500 (best-effort)', async () => {
    // Simulate a thrown error inside the dispatcher by making the
    // sites chain crash.
    const sb = {
      auth: { getUser: async () => ({ data: { user: { id: 'u-1', email: 'a@b' } }, error: null }) },
      from(table: string) {
        if (table === 'audit_log') return { insert: async () => ({ error: null }) }
        throw new Error('synthetic dispatch failure')
      },
    }
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(
      makeReq({
        auth: 'Bearer t',
        body: { name: 'assessment_finalized', details: { site_id: 'site-a' } },
      }),
      res as never,
    )
    expect(res._statusCode).toBe(200)
    expect(res._body).toEqual({ ok: true })
  })
})
