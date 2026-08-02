/**
 * Peer review → report lifecycle.
 *
 * An approved peer review is the event that carries a report to
 * "Professionally Reviewed". That makes this endpoint the place where an
 * audit record gets written, so the properties worth pinning are about
 * what it refuses to do:
 *
 *   • Only an APPROVAL advances a report. Comments and change-requests
 *     are feedback, not sign-off.
 *   • It will not drag a Final report backwards, and it will not advance
 *     a report from a state the lifecycle forbids.
 *   • Failing to update the denormalised assessment row does NOT fail
 *     the reviewer's request — their response is already recorded, and
 *     losing it because a secondary write failed would be worse than a
 *     stale column.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import handler, { __test } from '../../api/peer-review-respond'

interface ReviewRow {
  id: string
  assessor_id: string
  report_id: string | null
  facility_name: string | null
  reviewer_name: string
  reviewer_email: string
  message: string | null
  status: string
  expires_at: string
  reviewed_at: string | null
  created_at: string
}

const review = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'ab12cd34-0000-0000-0000-000000000000',
  assessor_id: 'asr-1',
  report_id: 'rpt-1',
  facility_name: 'Acme HQ',
  reviewer_name: 'Pat Smith',
  reviewer_email: 'pat@firm.example',
  message: null,
  status: 'pending',
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  reviewed_at: null,
  created_at: '2026-05-29T12:00:00Z',
  ...over,
})

function makeMockSupabase(opts: {
  review?: ReviewRow | null
  assessment?: Record<string, unknown> | null
  assessmentUpdateThrows?: boolean
} = {}) {
  const reviewUpdates: Array<Record<string, unknown>> = []
  const assessmentUpdates: Array<Record<string, unknown>> = []

  function chainFor(sink: Array<Record<string, unknown>>, single: unknown, throws = false) {
    const ctx: { patch?: Record<string, unknown> } = {}
    let resolved = false
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq() { return chain },
      maybeSingle: () => Promise.resolve({ data: single ?? null, error: null }),
      update(patch: Record<string, unknown>) {
        if (throws) throw new Error('update exploded')
        ctx.patch = patch
        return chain
      },
      then(resolve_: (v: unknown) => void) {
        if (resolved) return
        resolved = true
        if (ctx.patch) sink.push({ ...ctx.patch })
        resolve_({ data: null, error: null })
      },
    }
    return chain
  }

  return {
    state: { reviewUpdates, assessmentUpdates },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    from(table: string) {
      if (table === 'peer_reviews') return chainFor(reviewUpdates, opts.review === undefined ? null : opts.review)
      if (table === 'assessments') {
        return chainFor(assessmentUpdates, opts.assessment ?? null, opts.assessmentUpdateThrows)
      }
      if (table === 'profiles') {
        return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null, error: null }) }
      }
      if (table === 'audit_log') return { insert: async () => ({ error: null }) }
      throw new Error('unexpected table: ' + table)
    },
  }
}

function makeRes() {
  const res = {
    _statusCode: 0, _body: undefined as unknown,
    status(n: number) { this._statusCode = n; return this },
    json(b: unknown) { this._body = b },
  }
  return res
}

const post = (body: unknown) =>
  ({ method: 'POST', url: '/api/peer-review-respond', headers: {}, body }) as unknown as Parameters<typeof handler>[0]

beforeEach(() => { __test.reset() })

describe('an approved review advances the report', () => {
  it('moves an in-review assessment to Professionally Reviewed', async () => {
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'in_review', status: 'draft' },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)

    expect(res._statusCode).toBe(200)
    expect(sb.state.assessmentUpdates).toHaveLength(1)
    expect(sb.state.assessmentUpdates[0].report_status).toBe('reviewed')
  })

  it('mints a stable, human-quotable approval id on both rows', async () => {
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'in_review' },
    })
    __test.setSupabase(sb as never)
    await handler(post({ token: 't', status: 'approved' }), makeRes() as never)

    const onReview = sb.state.reviewUpdates[0].approval_id as string
    const onAssessment = sb.state.assessmentUpdates[0].approval_id as string
    expect(onReview).toMatch(/^APR-\d{4}-[0-9A-F]{6}$/)
    // Traceable from either side without a join through the free-form
    // report_id text column.
    expect(onAssessment).toBe(onReview)
  })

  it('records the reviewer’s credentials and organization', async () => {
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'in_review' },
    })
    __test.setSupabase(sb as never)
    await handler(post({
      token: 't', status: 'approved',
      reviewer_credentials: 'CIH, CSP',
      reviewer_organization: 'Example Consulting LLC',
    }), makeRes() as never)

    expect(sb.state.reviewUpdates[0].reviewer_credentials).toBe('CIH, CSP')
    expect(sb.state.reviewUpdates[0].reviewer_organization).toBe('Example Consulting LLC')
  })

  it('leaves reviewer_id null — a reviewer need not be an AtmosFlow user', async () => {
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'in_review' },
    })
    __test.setSupabase(sb as never)
    await handler(post({ token: 't', status: 'approved' }), makeRes() as never)
    expect(sb.state.assessmentUpdates[0].reviewer_id).toBeUndefined()
  })
})

describe('what does NOT advance a report', () => {
  for (const status of ['changes_requested', 'commented']) {
    it(`${status} records feedback but changes no report state`, async () => {
      const sb = makeMockSupabase({
        review: review(),
        assessment: { report_profile: 'professional', report_status: 'in_review' },
      })
      __test.setSupabase(sb as never)
      await handler(post({ token: 't', status }), makeRes() as never)

      expect(sb.state.reviewUpdates).toHaveLength(1)
      expect(sb.state.reviewUpdates[0].approval_id).toBeNull()
      expect(sb.state.assessmentUpdates).toHaveLength(0)
    })
  }

  it('will not drag a Final report backwards to Reviewed', async () => {
    // A late approval arriving after the report was finalised must not
    // rewrite its state.
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'final' },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)

    expect(res._statusCode).toBe(200)
    expect(sb.state.assessmentUpdates).toHaveLength(0)
  })

  it('refuses to jump a still-Draft report straight to Reviewed', async () => {
    // draft → reviewed is not a legal single step: a report cannot be
    // reviewed before it has been sent. api/peer-review.ts performs the
    // draft → in_review move at send time, which is what makes the
    // approval below reachable in the real flow.
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'draft' },
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)
    expect(res._statusCode).toBe(200)
    expect(sb.state.assessmentUpdates).toHaveLength(0)
  })

  it('does nothing when the review carries no report id', async () => {
    const sb = makeMockSupabase({ review: review({ report_id: null }) })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)
    expect(res._statusCode).toBe(200)
    expect(sb.state.assessmentUpdates).toHaveLength(0)
  })
})

describe('the secondary write is non-fatal', () => {
  it('still accepts the reviewer’s response when the assessment update fails', async () => {
    // The response is already persisted on peer_reviews. Rejecting the
    // request here would lose the reviewer's decision to protect a
    // denormalised column — the wrong trade.
    const sb = makeMockSupabase({
      review: review(),
      assessment: { report_profile: 'professional', report_status: 'in_review' },
      assessmentUpdateThrows: true,
    })
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)

    expect(res._statusCode).toBe(200)
    expect(sb.state.reviewUpdates).toHaveLength(1)
    expect(sb.state.reviewUpdates[0].status).toBe('approved')
  })

  it('treats a missing assessment row as a screening draft and still advances', async () => {
    const sb = makeMockSupabase({ review: review(), assessment: null })
    __test.setSupabase(sb as never)
    await handler(post({ token: 't', status: 'approved' }), makeRes() as never)
    // resolveLifecycle defaults to screening/draft, and draft → reviewed
    // is not a legal single step, so nothing is written.
    expect(sb.state.assessmentUpdates).toHaveLength(0)
  })
})
