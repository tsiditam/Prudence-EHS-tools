import { describe, it, expect } from 'vitest'
import { validateNarrativeForFinding, assertNoInternalFields, BannedTermViolation } from '../../src/engine/report/validators'
import type { Finding, FindingId, ZoneId } from '../../src/engine/types/domain'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-01' as FindingId,
    category: 'Contaminants',
    zoneId: 'Z-01' as ZoneId,
    severityInternal: 'medium',
    titleInternal: 'Test finding',
    observationInternal: 'Test observation',
    deductionInternal: 5,
    conditionType: 'co_screening_elevated',
    confidenceTier: 'provisional_screening_level',
    definitiveConclusionAllowed: false,
    causationSupported: false,
    regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'Carbon monoxide was detected at screening levels.',
    evidenceBasis: { kind: 'screening_grab', rationale: 'Grab sample', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    limitations: ['Screening only'],
    recommendedActions: [],
    thresholdSource: '29 CFR 1910.1000',
    ...overrides,
  }
}

describe('Validators — conditional banned terms', () => {
  it('throws when "confirmed" used without definitiveConclusionAllowed', () => {
    const finding = makeFinding({ definitiveConclusionAllowed: false })
    expect(() => validateNarrativeForFinding('CO contamination confirmed in the zone', finding))
      .toThrow(BannedTermViolation)
  })

  it('permits "confirmed" when definitiveConclusionAllowed=true', () => {
    const finding = makeFinding({ definitiveConclusionAllowed: true, evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] }, samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] } })
    expect(() => validateNarrativeForFinding('CO exceedance confirmed by 8-hour TWA', finding))
      .not.toThrow()
  })

  it('throws when "noncompliant" used without regulatoryConclusionAllowed', () => {
    const finding = makeFinding({ regulatoryConclusionAllowed: false })
    expect(() => validateNarrativeForFinding('The facility is noncompliant with OSHA standards', finding))
      .toThrow(BannedTermViolation)
  })

  it('permits "noncompliant" with regulatoryConclusionAllowed=true', () => {
    const finding = makeFinding({
      definitiveConclusionAllowed: true,
      regulatoryConclusionAllowed: true,
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
    })
    expect(() => validateNarrativeForFinding('The facility is noncompliant', finding))
      .not.toThrow()
  })

  it('throws when "caused by" used without causationSupported', () => {
    const finding = makeFinding({ causationSupported: false })
    expect(() => validateNarrativeForFinding('Symptoms caused by ventilation deficiency', finding))
      .toThrow(BannedTermViolation)
  })

  it('throws when "toxic mold" used without definitiveConclusionAllowed', () => {
    const finding = makeFinding({ conditionType: 'apparent_microbial_growth', definitiveConclusionAllowed: false })
    expect(() => validateNarrativeForFinding('Toxic mold was found in the ceiling', finding))
      .toThrow(BannedTermViolation)
  })

  it('BannedTermViolation has correct properties', () => {
    const finding = makeFinding()
    try {
      validateNarrativeForFinding('This is confirmed contamination', finding)
    } catch (e) {
      expect(e).toBeInstanceOf(BannedTermViolation)
      expect((e as BannedTermViolation).term).toBe('confirmed')
      expect((e as BannedTermViolation).requiredPermission).toBe('definitiveConclusionAllowed')
      expect((e as BannedTermViolation).findingId).toBe('F-01')
    }
  })
})

describe('Validators — assertNoInternalFields', () => {
  it('throws on severityInternal in object', () => {
    expect(() => assertNoInternalFields({ severityInternal: 'high' })).toThrow('Internal field')
  })

  it('throws on nested siteScore', () => {
    expect(() => assertNoInternalFields({ data: { siteScore: 85 } })).toThrow('Internal field')
  })

  it('throws on tier label as standalone string value', () => {
    expect(() => assertNoInternalFields({ risk: 'Critical' })).toThrow('Internal tier label')
  })

  it('passes on clean object', () => {
    expect(() => assertNoInternalFields({
      overview: 'Assessment completed',
      findings: ['condition 1', 'condition 2'],
      score: undefined,
    })).not.toThrow()
  })

  it('handles arrays', () => {
    expect(() => assertNoInternalFields([{ deductionInternal: 5 }])).toThrow('Internal field')
  })

  it('handles null and undefined gracefully', () => {
    expect(() => assertNoInternalFields(null)).not.toThrow()
    expect(() => assertNoInternalFields(undefined)).not.toThrow()
  })
})
