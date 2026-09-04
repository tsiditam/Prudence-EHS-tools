/**
 * Cross-tenant "reviewed" stamp (audit 2026-09 C2).
 *
 * /api/peer-review-respond runs its assessments update on the service-role
 * client keyed by the review row's report_id — a client-minted
 * `rpt-<timestamp>` string. Without a user_id filter, an approval could
 * advance another user's report that shares the id. This pins that both
 * the lookup and the update are scoped to the review's assessor.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import handler, { __test } from '../../api/peer-review-respond'

interface Assessment { id: string; user_id: string; report_profile: string; report_status: string }

function makeMockSupabase(assessments: Assessment[]) {
  const assessmentUpdates: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> = []
  const lookups: Array<Record<string, unknown>> = []
  const review = {
    id: 'ab12cd34-0000-0000-0000-000000000000',
    assessor_id: 'assessor-1',
    report_id: 'rpt-shared',
    facility_name: 'Acme HQ',
    reviewer_name: 'Pat', reviewer_email: 'pat@firm.example', message: null,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    reviewed_at: null, created_at: '2026-05-29T12:00:00Z',
  }
  function reviewsChain() {
    const chain: Record<string, unknown> = {
      select() { return chain }, eq() { return chain },
      maybeSingle: () => Promise.resolve({ data: review, error: null }),
      update() { return chain },
      then(resolve: (v: unknown) => void) { resolve({ data: null, error: null }) },
    }
    return chain
  }
  function assessmentsChain() {
    const ctx: { filters: Record<string, unknown>; patch?: Record<string, unknown> } = { filters: {} }
    let resolved = false
    const chain: Record<string, unknown> = {
      select() { return chain },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return chain },
      maybeSingle() {
        resolved = true
        lookups.push({ ...ctx.filters })
        const match = assessments.find((a) => Object.entries(ctx.filters).every(([k, v]) => (a as unknown as Record<string, unknown>)[k] === v))
        return Promise.resolve({ data: match ?? null, error: null })
      },
      update(patch: Record<string, unknown>) { ctx.patch = patch; return chain },
      then(resolve: (v: unknown) => void) {
        if (resolved) return
        resolved = true
        if (ctx.patch) assessmentUpdates.push({ patch: { ...ctx.patch }, filters: { ...ctx.filters } })
        resolve({ data: null, error: null })
      },
    }
    return chain
  }
  return {
    state: { assessmentUpdates, lookups },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    from(table: string) {
      if (table === 'peer_reviews') return reviewsChain()
      if (table === 'assessments') return assessmentsChain()
      if (table === 'profiles') return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null, error: null }) }
      if (table === 'audit_log') return { insert: async () => ({ error: null }) }
      throw new Error('unexpected table: ' + table)
    },
  }
}

const post = (body: unknown) =>
  ({ method: 'POST', url: '/api/peer-review-respond', headers: {}, body }) as unknown as Parameters<typeof handler>[0]
function makeRes() {
  const res = { _statusCode: 0, _body: undefined as unknown, status(n: number) { this._statusCode = n; return this }, json(b: unknown) { this._body = b } }
  return res
}

beforeEach(() => { __test.reset() })

describe('approval is scoped to the assessor who requested the review', () => {
  it('advances the assessor\'s own report and filters the update by user_id', async () => {
    const sb = makeMockSupabase([
      { id: 'rpt-shared', user_id: 'assessor-1', report_profile: 'professional', report_status: 'in_review' },
    ])
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)
    expect(res._statusCode).toBe(200)
    expect(sb.state.lookups[0]).toEqual({ id: 'rpt-shared', user_id: 'assessor-1' })
    expect(sb.state.assessmentUpdates).toHaveLength(1)
    expect(sb.state.assessmentUpdates[0].filters).toEqual({ id: 'rpt-shared', user_id: 'assessor-1' })
    expect(sb.state.assessmentUpdates[0].patch.report_status).toBe('reviewed')
  })

  it('does NOT touch another user\'s report that shares the id', async () => {
    // Same report id, owned by someone else, sitting in_review — the exact
    // row the old unscoped update would have stamped.
    const sb = makeMockSupabase([
      { id: 'rpt-shared', user_id: 'someone-else', report_profile: 'professional', report_status: 'in_review' },
    ])
    __test.setSupabase(sb as never)
    const res = makeRes()
    await handler(post({ token: 't', status: 'approved' }), res as never)
    expect(res._statusCode).toBe(200)   // the review itself is still recorded
    expect(sb.state.assessmentUpdates).toHaveLength(0)
  })
})
