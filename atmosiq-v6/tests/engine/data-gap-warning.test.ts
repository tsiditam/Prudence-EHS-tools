/**
 * Engine v2.9 — a fired data-gap trigger WARNS, it does not refuse.
 *
 * Up to v2.8, `renderClientReport` returned a Pre-Assessment Memo
 * instead of the report whenever any trigger fired. The reasoning was
 * sound about AUTHORITY — do not lend a professional report's weight to
 * findings that cannot carry it — and wrong about DELIVERY: withholding
 * the deliverable does not improve the data, and leaves the assessor
 * with nothing to hand a client and nothing showing what to fix.
 *
 * Product decision (2026-08): always issue, and carry the fired triggers
 * into the document. This file pins the half that is easy to lose — that
 * NOTHING is suppressed in the trade. Every description that would have
 * appeared in the memo appears in the report.
 *
 * The trigger logic itself is unchanged and is covered by
 * refusal-to-issue.test.ts, which still passes: `shouldRefuseToIssue`
 * still reports `refuse: true`. What changed is that nothing acts on it
 * as a refusal.
 */
import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { shouldRefuseToIssue, evaluateRefusalTriggers } from '../../src/engine/report/pre-assessment-memo'
import type { AssessmentScore, ZoneScore, Finding, FindingId, ZoneId } from '../../src/engine/types/domain'

function makeScore(overrides: Partial<AssessmentScore> = {}): AssessmentScore {
  return {
    siteScore: null, siteTier: null, zones: [],
    confidenceValue: 0, confidenceBand: 'insufficient_data',
    defensibilityFlags: {
      hasInstrumentData: false, hasCalibrationRecords: false,
      hasSufficientZoneCoverage: false, hasQualifiedAssessor: true,
      overallDefensible: false,
    },
    meta: {
      siteName: 'Test Site', siteAddress: '123 Test St', assessmentDate: '2026-04-28',
      preparingAssessor: { fullName: 'Test Assessor', credentials: ['CSP'] },
      reviewStatus: 'draft_pending_professional_review',
      issuingFirm: { name: 'Test Firm' },
      projectNumber: 'PSEC-TEST-0001',
      transmittalRecipient: { fullName: 'Test Recipient', organization: 'Test Org' },
    },
    ...overrides,
  }
}

function makeFinding(evidenceKind: string, conf: string): Finding {
  return {
    id: 'F-01' as FindingId, category: 'Contaminants', zoneId: 'Z-01' as ZoneId,
    severityInternal: 'medium', titleInternal: '', observationInternal: '', deductionInternal: 5,
    conditionType: 'co_screening_elevated', confidenceTier: conf as never,
    definitiveConclusionAllowed: false, causationSupported: false, regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'test',
    evidenceBasis: { kind: evidenceKind as never, rationale: '', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    limitations: [], recommendedActions: [], thresholdSource: '',
  }
}

function makeZone(findings: Finding[]): ZoneScore {
  return {
    zoneId: 'Z-01' as ZoneId, zoneName: 'Zone 1', composite: 50, tier: 'Moderate',
    confidence: 'provisional_screening_level',
    categories: [{
      category: 'Contaminants', rawScore: 15, cappedScore: 15, maxScore: 25,
      status: 'scored' as never, findings, sufficiencyRatio: 0.8,
    }],
    professionalOpinion: 'conditions_warrant_monitoring',
  }
}

/** An assessment thin enough that v2.8 would have refused outright. */
const thinScore = () => makeScore({
  zones: [makeZone([makeFinding('visual_olfactory_screening', 'qualitative_only')])],
})

describe('a fired trigger no longer withholds the report', () => {
  it('the triggers still fire — only the consequence changed', () => {
    // If this stops being true the test below proves nothing.
    expect(shouldRefuseToIssue(thinScore()).refuse).toBe(true)
  })

  it('issues a full report rather than a memo', () => {
    const result = renderClientReport(thinScore())
    expect(result.kind).toBe('report')
    expect(result.kind === 'report' && result.report).toBeTruthy()
  })

  it('still issues a report when the assessment is clean', () => {
    const clean = makeScore({
      zones: [makeZone([makeFinding('direct_reading_instrument', 'validated_defensible')])],
      defensibilityFlags: {
        hasInstrumentData: true, hasCalibrationRecords: true,
        hasSufficientZoneCoverage: true, hasQualifiedAssessor: true,
        overallDefensible: true,
      },
    })
    const result = renderClientReport(clean)
    expect(result.kind).toBe('report')
  })
})

describe('nothing is suppressed in the trade', () => {
  it('carries every fired trigger description onto the result', () => {
    const score = thinScore()
    const expected = evaluateRefusalTriggers(score).filter((t) => t.fired).map((t) => t.description)
    const result = renderClientReport(score)

    expect(result.kind).toBe('report')
    if (result.kind !== 'report') return
    expect(expected.length).toBeGreaterThan(0)
    // Verbatim, not paraphrased — the descriptions name the fix location,
    // and restating them anywhere else would let the two drift.
    expect([...result.dataGapWarnings]).toEqual(expected)
  })

  it('preserves the calibration trigger’s fix-location instruction', () => {
    const result = renderClientReport(thinScore())
    if (result.kind !== 'report') throw new Error('expected a report')
    const joined = result.dataGapWarnings.join(' ')
    expect(joined).toMatch(/Pre-Survey → Instruments/)
  })

  it('reports an empty array — not an absent field — when nothing fired', () => {
    // Absent would be ambiguous between "evaluated, nothing found" and
    // "not evaluated", which is the wrong thing to be vague about.
    const clean = makeScore({
      zones: [makeZone([makeFinding('direct_reading_instrument', 'validated_defensible')])],
      defensibilityFlags: {
        hasInstrumentData: true, hasCalibrationRecords: true,
        hasSufficientZoneCoverage: true, hasQualifiedAssessor: true,
        overallDefensible: true,
      },
    })
    const result = renderClientReport(clean)
    if (result.kind !== 'report') throw new Error('expected a report')
    expect(Array.isArray(result.dataGapWarnings)).toBe(true)
    expect(result.dataGapWarnings).toHaveLength(0)
  })
})

describe('the memo is retained, just no longer automatic', () => {
  it('is still buildable on demand', async () => {
    const { buildPreAssessmentMemo } = await import('../../src/engine/report/pre-assessment-memo')
    const score = thinScore()
    const memo = buildPreAssessmentMemo(score, shouldRefuseToIssue(score).reasons)
    expect(memo).toBeTruthy()
    expect(memo.dataGaps.length).toBeGreaterThan(0)
  })

  it('is never produced by renderClientReport, however thin the data', () => {
    // Including the degenerate case: an assessment with no zones at all.
    for (const score of [thinScore(), makeScore({ zones: [] })]) {
      expect(renderClientReport(score).kind).toBe('report')
    }
  })
})
