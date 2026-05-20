/**
 * Re-survey Schedule — cadence selection + due-date arithmetic.
 *
 * Pins the contract the DOCX section depends on:
 *   • Cadence escalates to whichever bucket has items, in priority
 *     order (immediate > shortTerm > furtherEvaluation > longTerm).
 *   • Counts come from either the v2.1 recommendationsRegister
 *     shape (immediate / shortTerm / furtherEvaluation /
 *     longTermOptional) OR the legacy ctx.recs shape
 *     (imm / eng / adm / mon).
 *   • Due date computation handles ISO + "Month D, YYYY" + Date
 *     inputs; falls back to null on unparseable input.
 *
 * Pure function — no DOM, no IO. Lives in src/engines/ (plural).
 */
import { describe, it, expect } from 'vitest'
import { computeResurveySchedule, CADENCE } from '../../src/engines/resurveySchedule.js'

describe('computeResurveySchedule — cadence selection', () => {
  it('returns 12-month cadence when no recommendations exist', () => {
    const out = computeResurveySchedule({ recommendations: {}, assessmentDate: '2026-05-19' })
    expect(out.cadence).toEqual(CADENCE.low)
    expect(out.counts).toEqual({ immediate: 0, shortTerm: 0, furtherEvaluation: 0, longTermOptional: 0 })
  })

  it('returns 30-day cadence when any immediate item exists', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}], shortTerm: [{}, {}], furtherEvaluation: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.cadence).toEqual(CADENCE.critical)
    expect(out.counts.immediate).toBe(1)
  })

  it('returns 90-day cadence when shortTerm has items but immediate is empty', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [], shortTerm: [{}, {}], furtherEvaluation: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.cadence).toEqual(CADENCE.high)
  })

  it('returns 6-month cadence when only furtherEvaluation has items', () => {
    const out = computeResurveySchedule({
      recommendations: { furtherEvaluation: [{}, {}, {}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.cadence).toEqual(CADENCE.medium)
  })

  it('returns 12-month cadence when only longTermOptional has items', () => {
    const out = computeResurveySchedule({
      recommendations: { longTermOptional: [{}, {}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.cadence).toEqual(CADENCE.low)
    expect(out.counts.longTermOptional).toBe(2)
  })

  it('accepts the legacy ctx.recs shape (imm / eng / adm / mon)', () => {
    const out = computeResurveySchedule({
      recommendations: { imm: [{}], eng: [{}, {}], adm: [], mon: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.cadence).toEqual(CADENCE.critical)
    expect(out.counts.immediate).toBe(1)
    expect(out.counts.shortTerm).toBe(2)
    expect(out.counts.longTermOptional).toBe(1)
  })
})

describe('computeResurveySchedule — rationale text', () => {
  it('mentions immediate-priority action count when critical', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}, {}, {}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.rationale).toMatch(/3 immediate-priority actions/)
    expect(out.rationale).toMatch(/30 days/)
  })

  it('uses singular wording for one item', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.rationale).toMatch(/1 immediate-priority action(?!s)/)
  })

  it('describes the no-recs case as routine', () => {
    const out = computeResurveySchedule({ recommendations: {}, assessmentDate: '2026-05-19' })
    expect(out.rationale).toMatch(/No active recommendations/)
    expect(out.rationale).toMatch(/12 months/)
  })
})

describe('computeResurveySchedule — due date arithmetic', () => {
  it('adds 30 days to the assessment date for critical', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.dueDate).toBe('June 18, 2026')
  })

  it('adds 90 days for high', () => {
    const out = computeResurveySchedule({
      recommendations: { shortTerm: [{}] },
      assessmentDate: '2026-01-01',
    })
    expect(out.dueDate).toBe('April 1, 2026')
  })

  it('adds 180 days for medium', () => {
    const out = computeResurveySchedule({
      recommendations: { furtherEvaluation: [{}] },
      assessmentDate: '2026-05-19',
    })
    expect(out.dueDate).toBe('November 15, 2026')
  })

  it('adds 365 days for low', () => {
    const out = computeResurveySchedule({
      recommendations: {},
      assessmentDate: '2026-05-19',
    })
    expect(out.dueDate).toBe('May 19, 2027')
  })

  it('accepts the "Month D, YYYY" date form that DocxReport.js emits', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      assessmentDate: 'May 19, 2026',
    })
    expect(out.dueDate).toBe('June 18, 2026')
  })

  it('accepts a Date instance', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      assessmentDate: new Date('2026-05-19T00:00:00Z'),
    })
    expect(out.dueDate).toMatch(/^June 1[78], 2026$/)
  })

  it('returns null dueDate when assessmentDate is missing and no now provided', () => {
    const out = computeResurveySchedule({ recommendations: { immediate: [{}] } })
    expect(out.dueDate).toBeNull()
  })

  it('falls back to opts.now when assessmentDate is missing', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      now: new Date('2026-05-19T00:00:00Z'),
    })
    expect(out.dueDate).toMatch(/^June 1[78], 2026$/)
  })

  it('returns null dueDate for unparseable assessmentDate strings', () => {
    const out = computeResurveySchedule({
      recommendations: { immediate: [{}] },
      assessmentDate: 'not a date',
    })
    expect(out.dueDate).toBeNull()
  })
})

describe('computeResurveySchedule — edge cases', () => {
  it('handles null / undefined / non-object recommendations input', () => {
    expect(computeResurveySchedule({ recommendations: null, assessmentDate: '2026-05-19' }).cadence).toEqual(CADENCE.low)
    expect(computeResurveySchedule({ recommendations: undefined, assessmentDate: '2026-05-19' }).cadence).toEqual(CADENCE.low)
    expect(computeResurveySchedule({ recommendations: 'not-an-object' as unknown, assessmentDate: '2026-05-19' }).cadence).toEqual(CADENCE.low)
  })

  it('treats missing buckets as zero counts (not crashes)', () => {
    const out = computeResurveySchedule({ recommendations: { immediate: [{}] }, assessmentDate: '2026-05-19' })
    expect(out.counts.shortTerm).toBe(0)
    expect(out.counts.furtherEvaluation).toBe(0)
    expect(out.counts.longTermOptional).toBe(0)
  })
})
