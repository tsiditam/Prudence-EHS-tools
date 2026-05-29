/**
 * /api/peer-review-respond — reviewer-side endpoint tests.
 *
 * Pins the contract:
 *   • GET ?token=... returns landing view or 404 / 410 / 409.
 *   • POST { token, status, notes } validates status, updates the
 *     row, sends the completion email synchronously, writes the
 *     peer_review_completed audit_log row.
 *   • Public access: NO Bearer token required.
 *   • Token gating: invalid → 404, expired → 410, already-reviewed → 409.
 *   • Reviewer body fields other than status + notes are ignored.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler, { __test } from '../../api/peer-review-respond'

interface MockRes {
  _statusCode: number
  _body: unknown
  status(n: number): MockRes
  json(b: unknown): void
}

function makeReq(opts: {
  method?: string
  url?: string
  body?: unknown
} = {}) {
  return {
    method: opts.method,
    url: opts.url,
    headers: {},
    body: opts.body,
  } as unknown as Parameters<typeof handler>[0]
}

function makeRes() {
  const res = {
    _statusCode: 0, _body: undefined as unknown,
    status(n: number) { this._statusCode = n; return this },
    json(b: unknown) { this._body = b },
  }
  return res as MockRes
}

interface ReviewRow {
  id: string
  assessor_id: string
  facility_name: string | null
  reviewer_name: string
  reviewer_email: string
  message: string | null
  status: string
  expires_at: string
  reviewed_at: string | null
  created_at: string
}

function makeMockSupabase(opts: {
  review?: ReviewRow | null
  assessorEmail?: string | null
  assessorName?: string
} = {}) {
  const updates: Array<{ patch: Record<string, unknown> }> = []
  const audit: Array<Record<string, unknown>> = []

  function reviewsChain() {
    const ctx: { filters: Record<string, unknown>; patch?: Record<string, unknown> } = { filters: {} }
    let resolved = false
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      maybeSingle: () => Promise.resolve({ data: opts.review === undefined ? null : opts.review, error: null }),
      update(patch: Record<string, unknown>) { ctx.patch = patch; return chain },
      then(resolve_: (v: unknown) => void) {
        if (resolved) return
        resolved = true
        if (ctx.patch) {
          updates.push({ patch: { ...ctx.patch } })
        }
        resolve_({ data: null, error: null })
      },
    }
    return chain
  }
  function profilesChain() {
    return {
      select() { return this },
      eq() { return this },
      maybeSingle: () => Promise.resolve({ data: opts.assessorName ? { name: opts.assessorName } : null, error: null }),
    }
  }
  function auditChain() {
    return {
      insert: async (row: Record<string, unknown>) => { audit.push(row); return { error: null } },
    }
  }

  return {
    state: { updates, audit },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: opts.assessorEmail ? { id: 'asr-1', email: opts.assessorEmail } : null },
          error: null,
        }),
      },
    },
    from(table: string) {
      if (table === 'peer_reviews') return reviewsChain()
      if (table === 'profiles')     return profilesChain()
      if (table === 'audit_log')    return auditChain()
      throw new Error('unexpected table: ' + table)
    },
  }
}

beforeEach(() => { __test.reset() })

const fresh: ReviewRow = {
  id: 'pr-1', assessor_id: 'asr-1',
  facility_name: 'Acme HQ',
  reviewer_name: 'Pat Smith',
  reviewer_email: 'pat@firm.example',
  message: 'See appendix C',
  status: 'pending',
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  reviewed_at: null,
  created_at: '2026-05-29T12:00:00Z',
}

describe('/api/peer-review-respond — GET', () => {
  it('400 when token is missing from the query string', async () => {
    __test.setSupabase(makeMockSupabase({ review: fresh }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', url: '/api/peer-review-respond' }), res as never)
    expect(res._statusCode).toBe(400)
  })

  it('404 invalid_token when no row matches', async () => {
    __test.setSupabase(makeMockSupabase({ review: null }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', url: '/api/peer-review-respond?token=xxx' }), res as never)
    expect(res._statusCode).toBe(404)
    expect(res._body).toEqual({ error: 'invalid_token' })
  })

  it('410 expired when expires_at is in the past', async () => {
    __test.setSupabase(makeMockSupabase({
      review: { ...fresh, expires_at: new Date(Date.now() - 86400000).toISOString() },
    }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', url: '/api/peer-review-respond?token=t' }), res as never)
    expect(res._statusCode).toBe(410)
  })

  it('409 already_reviewed when reviewed_at is set', async () => {
    __test.setSupabase(makeMockSupabase({
      review: { ...fresh, reviewed_at: '2026-05-30T00:00:00Z', status: 'approved' },
    }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', url: '/api/peer-review-respond?token=t' }), res as never)
    expect(res._statusCode).toBe(409)
  })

  it('200 returns landing view with assessor name resolved', async () => {
    __test.setSupabase(makeMockSupabase({
      review: fresh, assessorName: 'Tsidi Tamakloe',
    }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', url: '/api/peer-review-respond?token=t' }), res as never)
    expect(res._statusCode).toBe(200)
    const v = (res._body as { view: Record<string, unknown> }).view
    expect(v.assessor_name).toBe('Tsidi Tamakloe')
    expect(v.facility_name).toBe('Acme HQ')
    expect(v.message).toBe('See appendix C')
  })
})

describe('/api/peer-review-respond — POST', () => {
  it('400 token_required when token missing', async () => {
    __test.setSupabase(makeMockSupabase({ review: fresh }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { status: 'approved' } }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'token_required' })
  })

  it('400 bad_status when status not in allowlist', async () => {
    __test.setSupabase(makeMockSupabase({ review: fresh }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { token: 't', status: 'pending' } }), res as never)
    expect(res._statusCode).toBe(400)
    expect(res._body).toEqual({ error: 'bad_status' })
  })

  it('404 invalid_token when row missing', async () => {
    __test.setSupabase(makeMockSupabase({ review: null }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { token: 't', status: 'approved' } }), res as never)
    expect(res._statusCode).toBe(404)
  })

  it('410 expired', async () => {
    __test.setSupabase(makeMockSupabase({
      review: { ...fresh, expires_at: new Date(Date.now() - 86400000).toISOString() },
    }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { token: 't', status: 'approved' } }), res as never)
    expect(res._statusCode).toBe(410)
  })

  it('409 already_reviewed', async () => {
    __test.setSupabase(makeMockSupabase({
      review: { ...fresh, reviewed_at: '2026-05-30T00:00:00Z' },
    }) as never)
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { token: 't', status: 'approved' } }), res as never)
    expect(res._statusCode).toBe(409)
  })

  it('happy path: updates row + writes audit + sends Resend email synchronously', async () => {
    const sb = makeMockSupabase({
      review: fresh, assessorEmail: 'tsidi@example.test', assessorName: 'Tsidi',
    })
    __test.setSupabase(sb as never)
    process.env.RESEND_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    __test.setFetch(fetchMock as unknown as typeof fetch)

    const res = makeRes()
    await handler(makeReq({
      method: 'POST',
      body: { token: 't', status: 'approved', notes: 'Solid screening; ventilation flagged correctly.' },
    }), res as never)
    expect(res._statusCode).toBe(200)
    expect(res._body).toEqual({ ok: true, status: 'approved' })

    // Update applied.
    expect(sb.state.updates).toHaveLength(1)
    const patch = sb.state.updates[0].patch
    expect(patch.status).toBe('approved')
    expect(patch.reviewer_notes).toMatch(/Solid screening/)
    expect(patch.reviewed_at).toBeTruthy()

    // Audit row written.
    expect(sb.state.audit).toHaveLength(1)
    expect(sb.state.audit[0].action).toBe('peer_review_completed')

    // Resend invoked.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const reqBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(reqBody.to).toEqual(['tsidi@example.test'])
    expect(reqBody.subject).toMatch(/Approved/)
    delete process.env.RESEND_API_KEY
  })

  it('caps notes at MAX_NOTES_LEN', async () => {
    const sb = makeMockSupabase({ review: fresh, assessorEmail: 'a@b' })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(makeReq({
      method: 'POST',
      body: { token: 't', status: 'commented', notes: 'x'.repeat(__test.MAX_NOTES_LEN + 100) },
    }), res as never)
    expect(res._statusCode).toBe(200)
    expect((sb.state.updates[0].patch.reviewer_notes as string).length).toBe(__test.MAX_NOTES_LEN)
  })
})

describe('/api/peer-review-respond — unsupported methods', () => {
  it('PATCH → 405', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'PATCH' }), res as never)
    expect(res._statusCode).toBe(405)
  })
})
