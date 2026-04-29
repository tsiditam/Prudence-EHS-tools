import { describe, it, expect } from 'vitest'
import { evaluateRefusalTriggers, shouldRefuseToIssue, buildPreAssessmentMemo } from '../../src/engine/report/pre-assessment-memo'
import { PRE_ASSESSMENT_MEMO_NOTICE } from '../../src/engine/report/templates'
import type { AssessmentScore, ZoneScore, CategoryScore, Finding, FindingId, ZoneId } from '../../src/engine/types/domain'

function makeMinimalScore(overrides: Partial<AssessmentScore> = {}): AssessmentScore {
  return {
    siteScore: null,
    siteTier: null,
    zones: [],
    confidenceValue: 0,
    confidenceBand: 'insufficient_data',
    defensibilityFlags: {
      hasInstrumentData: false,
      hasCalibrationRecords: false,
      hasSufficientZoneCoverage: false,
      hasQualifiedAssessor: true,
      overallDefensible: false,
    },
    meta: {
      siteName: 'Test Site',
      siteAddress: '123 Test St',
      assessmentDate: '2026-04-28',
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
    conditionType: 'co_screening_elevated', confidenceTier: conf as any,
    definitiveConclusionAllowed: false, causationSupported: false, regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'test', evidenceBasis: { kind: evidenceKind as any, rationale: '', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    limitations: [], recommendedActions: [], thresholdSource: '',
  }
}

function makeZone(findings: Finding[], status = 'scored'): ZoneScore {
  return {
    zoneId: 'Z-01' as ZoneId, zoneName: 'Zone 1', composite: 50, tier: 'Moderate',
    confidence: 'provisional_screening_level',
    categories: [{ category: 'Contaminants', rawScore: 15, cappedScore: 15, maxScore: 25, status: status as any, findings, sufficiencyRatio: 0.8 }],
    professionalOpinion: 'conditions_warrant_monitoring',
  }
}

describe('Refusal to Issue — trigger evaluation', () => {
  it('trigger 1: no-measurement fires when all evidence is observational', () => {
    const score = makeMinimalScore({
      zones: [makeZone([makeFinding('visual_olfactory_screening', 'qualitative_only')])],
    })
    const triggers = evaluateRefusalTriggers(score)
    expect(triggers.find(t => t.id === 'no_measurement')?.fired).toBe(true)
  })

  it('trigger 1: does NOT fire when instrument measurement exists', () => {
    const score = makeMinimalScore({
      zones: [makeZone([makeFinding('screening_continuous', 'provisional_screening_level')])],
    })
    const triggers = evaluateRefusalTriggers(score)
    expect(triggers.find(t => t.id === 'no_measurement')?.fired).toBe(false)
  })

  it('trigger 2: bulk-insufficiency fires when >50% cells insufficient', () => {
    const insufficientCats: CategoryScore[] = Array.from({ length: 4 }, (_, i) => ({
      category: ['Ventilation', 'Contaminants', 'HVAC', 'Environment'][i] as any,
      rawScore: 0, cappedScore: 0, maxScore: 25, status: 'insufficient' as any, findings: [], sufficiencyRatio: 0,
    }))
    const scoredCat: CategoryScore = { category: 'Complaints', rawScore: 15, cappedScore: 15, maxScore: 15, status: 'scored', findings: [], sufficiencyRatio: 1 }
    const score = makeMinimalScore({
      zones: [{ zoneId: 'Z-01' as ZoneId, zoneName: 'Z1', composite: null, tier: null, confidence: 'insufficient_data', categories: [...insufficientCats, scoredCat], professionalOpinion: 'no_significant_concerns_identified' }],
    })
    const triggers = evaluateRefusalTriggers(score)
    expect(triggers.find(t => t.id === 'bulk_insufficiency')?.fired).toBe(true)
  })

  it('trigger 4: calibration-absence fires when no calibration records', () => {
    const score = makeMinimalScore({ defensibilityFlags: { hasInstrumentData: true, hasCalibrationRecords: false, hasSufficientZoneCoverage: true, hasQualifiedAssessor: true, overallDefensible: false } })
    const triggers = evaluateRefusalTriggers(score)
    expect(triggers.find(t => t.id === 'calibration_absence')?.fired).toBe(true)
  })

  it('trigger 5: credential-absence fires when no credentials and no reviewer', () => {
    const score = makeMinimalScore()
    score.meta.preparingAssessor.credentials = [] as any
    const triggers = evaluateRefusalTriggers(score)
    expect(triggers.find(t => t.id === 'credential_absence')?.fired).toBe(true)
  })
})

describe('Refusal to Issue — shouldRefuseToIssue', () => {
  it('returns refuse=true when any trigger fires', () => {
    const score = makeMinimalScore()
    const result = shouldRefuseToIssue(score)
    expect(result.refuse).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('returns refuse=false when no triggers fire', () => {
    const score = makeMinimalScore({
      zones: [makeZone([makeFinding('screening_continuous', 'provisional_screening_level')])],
      defensibilityFlags: { hasInstrumentData: true, hasCalibrationRecords: true, hasSufficientZoneCoverage: true, hasQualifiedAssessor: true, overallDefensible: true },
    })
    const result = shouldRefuseToIssue(score)
    expect(result.refuse).toBe(false)
  })
})

describe('Refusal to Issue — PreAssessmentMemo', () => {
  it('memo contains required fields', () => {
    const score = makeMinimalScore()
    const memo = buildPreAssessmentMemo(score, ['No measurements', 'No calibration'])
    expect(memo.cover.title).toBe('Pre-Assessment Site Visit Memo')
    expect(memo.notice).toBe(PRE_ASSESSMENT_MEMO_NOTICE)
    expect(memo.dataGaps.length).toBe(2)
    expect(memo.recommendedFollowUp.length).toBeGreaterThan(0)
    expect(memo.signatoryBlock.preparedBy.name).toBe('Test Assessor')
  })

  it('memo does NOT contain finding language or opinion tiers', () => {
    const score = makeMinimalScore()
    const memo = buildPreAssessmentMemo(score, ['test reason'])
    const memoStr = JSON.stringify(memo)
    expect(memoStr).not.toContain('conditions_warrant')
    expect(memoStr).not.toContain('severityInternal')
    expect(memoStr).not.toContain('deductionInternal')
  })
})
