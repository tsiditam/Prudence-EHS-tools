/**
 * Acceptance: the governance layer between a validated reading and a
 * professional deliverable.
 *
 * The whole point is that a validated interpretation means "the model produced
 * this and the gates passed it" and NOTHING more. Every test here asks the
 * same question from a different angle: can anything reach the monitoring
 * report that a credentialed assessor did not, knowingly, put there?
 */
import { describe, it, expect } from 'vitest'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { validateForensicOutput, buildForensicInterpretationRecord } from '../../src/utils/forensicValidate.js'
import { patternEvidence } from '../../src/utils/forensicPresent.js'
import {
  emptyForensicReview, acceptInterpretation, dismissInterpretation, reopenInterpretation,
  reviewStatusFor, reviewDecision, reviewedPatterns, monitoringPatternReview,
  REVIEW_STATUSES, INELIGIBLE_REASONS, FORENSIC_REVIEW_VERSION,
} from '../../src/utils/forensicReview.js'
import { buildMonitoringReportModel } from '../../src/utils/monitoringReportModel.js'
import { buildPatternReviewSection, buildMonitoringSections } from '../../src/components/docx/sections-monitoring.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000
const multiDay = (days: number, f: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  return pts
}
const mk = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})
const sensorData = (over: any = {}) => ({
  version: 2,
  datasets: [mk('primary', 'indoor', 'Indoor', multiDay(4, (_d, h) => ({ co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI) })), ['co2'], { co2: 'ppm' })],
  occupancyWindows: [], graphs: {}, thresholds: {}, ...over,
})
const bundleFor = (over: any = {}) => buildForensicBundle({ sensorData: sensorData(over), utcOffsetMin: 0 })

const bundle: any = bundleFor()
const cycle = bundle.patterns.find((p: any) => p.kind === 'recurring_cycle')

const reading = (over: any = {}) => ({
  pattern_id: cycle.id,
  title: 'Repeating daily swing',
  importance: 'worth_review',
  interpretation: 'The recurring shape is consistent with scheduled occupancy. It cannot distinguish that from mechanical operation and requires confirmation.',
  alternative_explanations: ['A timed system start may contribute to the same shape.'],
  missing_context_ids: [],
  recommended_reviews: ['Compare the pattern against the operating schedule; this warrants review.'],
  report_candidate: true,
  evidence_ids: [],
  ...over,
})
const recordFor = (b: any, readings: any[]) =>
  buildForensicInterpretationRecord({ bundle: b, validation: validateForensicOutput({ interpretations: readings }, b) })

const record = recordFor(bundle, [reading()])
const accepted = () => acceptInterpretation(emptyForensicReview(), {
  patternId: cycle.id, interpretation: reading(), fingerprint: bundle.fingerprint, reviewedAt: '2026-03-10T00:00:00.000Z',
})
/** The report rows, as the Logger Studio page computes them. */
const rows = (review: any, rec: any = record, b: any = bundle) => monitoringPatternReview({ bundle: b, record: rec, review })

describe('a decision is recorded, reversible, and says what it was about', () => {
  it('starts empty and reads unreviewed', () => {
    expect(emptyForensicReview()).toEqual({ version: FORENSIC_REVIEW_VERSION, decisions: {} })
    expect(reviewStatusFor(emptyForensicReview(), cycle.id)).toBe('unreviewed')
    expect(reviewStatusFor(null, cycle.id)).toBe('unreviewed')
    expect(REVIEW_STATUSES).toEqual(['unreviewed', 'accepted', 'dismissed'])
  })

  it('freezes the accepted language, not a pointer to it', () => {
    // The precedent is `applyOverride`: a regeneration must never quietly
    // rewrite words the assessor put their name to.
    const d: any = reviewDecision(accepted(), cycle.id)
    expect(d.status).toBe('accepted')
    expect(d.fingerprint).toBe(bundle.fingerprint)
    expect(d.reviewedAt).toBe('2026-03-10T00:00:00.000Z')
    expect(d.accepted.interpretation).toBe(reading().interpretation)
    expect(d.accepted.alternative_explanations).toEqual(reading().alternative_explanations)
    // Pointers into a bundle are NOT frozen — they would outlive the session.
    expect(d.accepted).not.toHaveProperty('evidence_ids')
    expect(d.accepted).not.toHaveProperty('missing_context_ids')
  })

  it('records a dismissal with what was dismissed', () => {
    const r = dismissInterpretation(emptyForensicReview(), { patternId: cycle.id, interpretation: reading(), fingerprint: bundle.fingerprint })
    expect(reviewStatusFor(r, cycle.id)).toBe('dismissed')
    expect((reviewDecision(r, cycle.id) as any).accepted.interpretation).toBe(reading().interpretation)
  })

  it('reopens by deleting the decision, so unreviewed has exactly one meaning', () => {
    const r = reopenInterpretation(accepted(), cycle.id)
    expect(r.decisions).toEqual({})
    expect(reviewStatusFor(r, cycle.id)).toBe('unreviewed')
    // Reopening something never decided is a no-op, not an error.
    expect(reopenInterpretation(emptyForensicReview(), cycle.id).decisions).toEqual({})
  })

  it('changes a decision in place', () => {
    const r = dismissInterpretation(accepted(), { patternId: cycle.id, interpretation: reading(), fingerprint: bundle.fingerprint })
    expect(reviewStatusFor(r, cycle.id)).toBe('dismissed')
    expect(Object.keys(r.decisions)).toHaveLength(1)
  })

  it('refuses a decision with no pattern, rather than storing a nameless one', () => {
    expect(acceptInterpretation(emptyForensicReview(), {}).decisions).toEqual({})
    expect(dismissInterpretation(null, { patternId: '' }).decisions).toEqual({})
  })
})

describe('only an accepted, fresh, current reading reaches the report', () => {
  it('a validated but UNREVIEWED interpretation does not enter the report', () => {
    const state = reviewedPatterns({ bundle, record, review: emptyForensicReview() })
    const row = state.find((r) => r.patternId === cycle.id)!
    expect(row.interpretation).toBeTruthy()   // it validated
    expect(row.status).toBe('unreviewed')
    expect(row.eligible).toBe(false)
    expect(rows(emptyForensicReview())).toEqual([])
    expect(rows(null)).toEqual([])
  })

  it('an ACCEPTED, fresh interpretation does', () => {
    const out = rows(accepted())
    expect(out).toHaveLength(1)
    expect(out[0].patternId).toBe(cycle.id)
    expect(out[0].reading).toBe(reading().interpretation)
    expect(out[0].reviewedAt).toBe('2026-03-10T00:00:00.000Z')
  })

  it('a DISMISSED interpretation does not', () => {
    const r = dismissInterpretation(emptyForensicReview(), { patternId: cycle.id, interpretation: reading(), fingerprint: bundle.fingerprint })
    expect(rows(r)).toEqual([])
  })

  it('a STALE previously accepted interpretation does not, even though it was accepted', () => {
    const r = acceptInterpretation(emptyForensicReview(), {
      patternId: cycle.id, interpretation: reading(), fingerprint: 'an-older-session',
    })
    const row = reviewedPatterns({ bundle, record, review: r }).find((x) => x.patternId === cycle.id)!
    expect(row.status).toBe('accepted')
    expect(row.stale).toBe(true)
    expect(row.ineligible).toContain('stale')
    expect(row.eligible).toBe(false)
    expect(rows(r)).toEqual([])
  })

  it('REANALYSIS changes the fingerprint and invalidates the prior acceptance', () => {
    // The assessor marks an occupancy window after accepting. Same readings,
    // different inputs, so a different session — and the reading describes one
    // that no longer exists.
    const review = accepted()
    expect(rows(review)).toHaveLength(1)
    const reanalyzed: any = bundleFor({ occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }] })
    expect(reanalyzed.fingerprint).not.toBe(bundle.fingerprint)
    const newCycle = reanalyzed.patterns.find((p: any) => p.kind === 'recurring_cycle')
    expect(newCycle.id).toBe(cycle.id) // the pattern survives; the decision does not
    const rec2 = recordFor(reanalyzed, [reading({ pattern_id: newCycle.id })])
    expect(rows(review, rec2, reanalyzed)).toEqual([])
  })

  it('a SUPERSEDED acceptance does not — the model was asked again and said something else', () => {
    // Same session, same fingerprint, different wording. Without this the panel
    // would show one reading and the report would carry another.
    const rewritten = recordFor(bundle, [reading({ interpretation: 'The recurring shape is consistent with a timed system start, and requires confirmation.' })])
    const row = reviewedPatterns({ bundle, record: rewritten, review: accepted() }).find((r) => r.patternId === cycle.id)!
    expect(row.stale).toBe(false)
    expect(row.superseded).toBe(true)
    expect(rows(accepted(), rewritten)).toEqual([])
  })

  it('an acceptance whose pattern the current record no longer reads is superseded too', () => {
    const emptyRecord = recordFor(bundle, [])
    expect(emptyRecord.validation.status).toBe('empty')
    expect(rows(accepted(), emptyRecord)).toEqual([])
  })

  it('a rejected, partial or empty AI result never creates accepted content by itself', () => {
    for (const rec of [recordFor(bundle, []), recordFor(bundle, [reading({ interpretation: 'This proves the copier is the source.' })])]) {
      expect(rows(emptyForensicReview(), rec)).toEqual([])
      expect(rows(null, rec)).toEqual([])
    }
    // A rejected record carries no interpretations at all, so nothing is even
    // offered for acceptance.
    const rejected = recordFor(bundle, [reading({ interpretation: 'This proves the copier is the source.' })])
    expect(rejected.validation.status).toBe('rejected')
    expect(rejected.interpretations).toEqual([])
  })

  it('names every way an acceptance can stop counting', () => {
    expect(INELIGIBLE_REASONS).toEqual(['stale', 'superseded', 'digits_in_prose'])
  })
})

describe('the report carries deterministic figures and no model numbers', () => {
  it('the evidence on a row is the bundle’s own, not the prose’s', () => {
    const out = rows(accepted())
    expect(out[0].evidence).toEqual(patternEvidence(cycle, bundle))
    expect(out[0].evidence).toContain('peak hour 14:00')
    expect(out[0].evidence).toContain('amplitude 400 ppm')
    // And the reading itself states none of them.
    expect(out[0].reading).not.toMatch(/\d/)
  })

  it('a hand-built acceptance carrying a figure is refused at the boundary', () => {
    // The validator rejects digits at generation, so this can only be a
    // hand-built or tampered record. The deliverable boundary checks again.
    const smuggled = acceptInterpretation(emptyForensicReview(), {
      patternId: cycle.id, fingerprint: bundle.fingerprint,
      interpretation: reading({ interpretation: 'The swing peaks at 1450 ppm, which warrants review.' }),
    })
    const forged = recordFor(bundle, [])
    forged.interpretations = [reading({ interpretation: 'The swing peaks at 1450 ppm, which warrants review.' })]
    const row = reviewedPatterns({ bundle, record: forged, review: smuggled }).find((r) => r.patternId === cycle.id)!
    expect(row.ineligible).toContain('digits_in_prose')
    expect(rows(smuggled, forged)).toEqual([])
  })

  it('the report model drops a row whose prose carries a figure, however it got there', () => {
    const model: any = buildMonitoringReportModel(
      { datasets: [{ ...sensorData().datasets[0], summary: { start: T0, end: T0 + DAY } }], utcOffsetMin: 0 },
      { patternReview: [
        { title: 'Clean', evidence: ['peak hour 14:00'], reading: 'Consistent with scheduled occupancy.', alternatives: [], reviews: [] },
        { title: 'Dirty', evidence: ['peak hour 14:00'], reading: 'The swing peaks at 1450 ppm.', alternatives: [], reviews: [] },
        { title: 'Dirty in an alternative', evidence: [], reading: 'Consistent with occupancy.', alternatives: ['Roughly 3 times the overnight level.'], reviews: [] },
      ] },
    )
    expect(model.patternReview.map((r: any) => r.title)).toEqual(['Clean'])
  })

  it('the evidence line survives into the model verbatim', () => {
    const model: any = buildMonitoringReportModel(
      { datasets: [{ ...sensorData().datasets[0], summary: { start: T0, end: T0 + DAY } }], utcOffsetMin: 0 },
      { patternReview: rows(accepted()) },
    )
    expect(model.patternReview).toHaveLength(1)
    expect(model.patternReview[0].evidence).toEqual(patternEvidence(cycle, bundle))
  })
})

describe('the report section is optional', () => {
  const modelWith = (patternReview: any[]) => buildMonitoringReportModel(
    { datasets: [{ ...sensorData().datasets[0], summary: { start: T0, end: T0 + DAY } }], utcOffsetMin: 0 },
    { patternReview },
  )

  it('does not exist when nothing fresh was accepted', () => {
    const model: any = modelWith(rows(emptyForensicReview()))
    expect(model.patternReview).toEqual([])
    expect(buildPatternReviewSection(model, 7)).toBe(null)
    const { body } = buildMonitoringSections(model)
    expect(body.some((s: any) => s.title === 'Monitoring Pattern Review')).toBe(false)
  })

  it('is absent entirely when the model was built without the option', () => {
    const model: any = buildMonitoringReportModel({ datasets: [{ ...sensorData().datasets[0], summary: { start: T0, end: T0 + DAY } }] }, {})
    expect(model.patternReview).toEqual([])
    expect(buildPatternReviewSection(model, 3)).toBe(null)
  })

  it('appears, numbered, once a fresh acceptance exists', () => {
    const model: any = modelWith(rows(accepted()))
    const section: any = buildPatternReviewSection(model, 7)
    expect(section.title).toBe('Monitoring Pattern Review')
    const { body } = buildMonitoringSections(model)
    const found: any = body.find((s: any) => s.title === 'Monitoring Pattern Review')
    expect(found).toBeTruthy()
    expect(typeof found.num).toBe('number')
    // Between the dataset's integrity and what the report does not claim.
    const titles = body.map((s: any) => s.title)
    expect(titles.indexOf('Monitoring Pattern Review')).toBeGreaterThan(titles.indexOf('Dataset integrity'))
    expect(titles.indexOf('Monitoring Pattern Review')).toBeLessThan(titles.indexOf('Limitations'))
  })

  it('leaves every other section of the report untouched', () => {
    const without: any = modelWith([])
    const with_: any = modelWith(rows(accepted()))
    const keys = Object.keys(without).filter((k) => k !== 'patternReview')
    keys.forEach((k) => expect(JSON.stringify(with_[k]), k).toBe(JSON.stringify(without[k])))
  })
})
