/**
 * resolveFinalizeTarget — the guard against duplicate reports for one project.
 *
 * The regression this pins: after a finalize, the session pointer (draftId)
 * must advance to the finalized report id, so a follow-up finalize in the same
 * session — e.g. right after fixing a readiness blocker — UPDATES that report
 * instead of minting a second one.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without types
import { resolveFinalizeTarget } from '../../src/utils/finalizeTarget'

describe('resolveFinalizeTarget', () => {
  it('mints a fresh id for a brand-new assessment (draft id not yet a report)', () => {
    const { rid, reuse } = resolveFinalizeTarget({ currentId: 'draft-123', reportIds: [], newId: 'rpt-A' })
    expect(reuse).toBe(false)
    expect(rid).toBe('rpt-A')
  })

  it('reuses the id when the session already points at a finalized report', () => {
    const { rid, reuse } = resolveFinalizeTarget({ currentId: 'rpt-A', reportIds: ['rpt-A', 'rpt-Z'], newId: 'rpt-B' })
    expect(reuse).toBe(true)
    expect(rid).toBe('rpt-A')
  })

  it('mints a fresh id when there is no current id', () => {
    expect(resolveFinalizeTarget({ currentId: null, reportIds: ['rpt-A'], newId: 'rpt-B' }).rid).toBe('rpt-B')
    expect(resolveFinalizeTarget({ currentId: undefined, reportIds: ['rpt-A'], newId: 'rpt-B' }).reuse).toBe(false)
  })

  it('tolerates a missing reportIds list', () => {
    // @ts-expect-error — exercising the defensive default
    expect(resolveFinalizeTarget({ currentId: 'x', newId: 'rpt-B' }).rid).toBe('rpt-B')
  })

  it('does NOT duplicate across a finalize → fix-blocker → re-finalize loop', () => {
    // 1) First finalize of a new assessment: session points at a draft id.
    const reportIds: string[] = []
    const first = resolveFinalizeTarget({ currentId: 'draft-123', reportIds, newId: 'rpt-A' })
    expect(first.rid).toBe('rpt-A')
    reportIds.push(first.rid) // the report now exists in the index

    // The caller MUST advance its session pointer to the finalized id.
    const sessionId = first.rid // was the bug: this stayed 'draft-123'

    // 2) User fixes a readiness blocker and finalizes again in the SAME session.
    const second = resolveFinalizeTarget({ currentId: sessionId, reportIds, newId: 'rpt-B' })
    expect(second.reuse).toBe(true)
    expect(second.rid).toBe('rpt-A') // updates in place — no rpt-B duplicate
    expect(reportIds).toEqual(['rpt-A'])
  })

  it('reproduces the duplicate when the pointer is NOT advanced (documents the bug)', () => {
    const reportIds = ['rpt-A']
    // Pointer still at the retired draft id — the pre-fix behaviour.
    const again = resolveFinalizeTarget({ currentId: 'draft-123', reportIds, newId: 'rpt-B' })
    expect(again.reuse).toBe(false)
    expect(again.rid).toBe('rpt-B') // this is the duplicate the fix prevents
  })
})
