import { describe, it, expect } from 'vitest'
import { evaluatePermissions } from '../../src/engine/report/permissions'
import type { Finding, FindingId, ZoneId } from '../../src/engine/types/domain'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-01' as FindingId,
    category: 'Contaminants',
    zoneId: 'Z-01' as ZoneId,
    severityInternal: 'high',
    titleInternal: 'CO elevated',
    observationInternal: 'CO above screening threshold',
    deductionInternal: 12,
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

describe('Permissions — definitiveConclusionAllowed', () => {
  it('false when evidence is screening_grab', () => {
    const p = evaluatePermissions(makeFinding())
    expect(p.definitiveConclusionAllowed).toBe(false)
    expect(p.rationale.some(r => r.includes('not definitive'))).toBe(true)
  })

  it('true when evidence is documented_8hr_twa + sampling adequate + not in noise floor', () => {
    const p = evaluatePermissions(makeFinding({
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '8-hr TWA', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p.definitiveConclusionAllowed).toBe(true)
  })

  it('true when evidence is laboratory_speciation + sampling adequate', () => {
    const p = evaluatePermissions(makeFinding({
      evidenceBasis: { kind: 'laboratory_speciation', rationale: 'Lab results', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p.definitiveConclusionAllowed).toBe(true)
  })

  it('false when evidence is definitive but within noise floor', () => {
    const p = evaluatePermissions(makeFinding({
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: true },
    }))
    expect(p.definitiveConclusionAllowed).toBe(false)
    expect(p.rationale.some(r => r.includes('noise floor'))).toBe(true)
  })

  it('false when evidence is definitive but sampling inadequate', () => {
    const p = evaluatePermissions(makeFinding({
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p.definitiveConclusionAllowed).toBe(false)
    expect(p.rationale.some(r => r.includes('sampling adequacy'))).toBe(true)
  })
})

describe('Permissions — causationSupported', () => {
  it('false when finding is not definitive even if causation flag set', () => {
    const p = evaluatePermissions(makeFinding({ causationSupported: true }))
    expect(p.causationSupported).toBe(false)
    expect(p.rationale.some(r => r.includes('causal language blocked'))).toBe(true)
  })

  it('true when finding is definitive AND causation flag set', () => {
    const p = evaluatePermissions(makeFinding({
      causationSupported: true,
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p.causationSupported).toBe(true)
  })
})

describe('Permissions — regulatoryConclusionAllowed', () => {
  it('false when finding is not definitive even if regulatory flag set', () => {
    const p = evaluatePermissions(makeFinding({ regulatoryConclusionAllowed: true }))
    expect(p.regulatoryConclusionAllowed).toBe(false)
  })

  it('true when finding is definitive AND regulatory flag set', () => {
    const p = evaluatePermissions(makeFinding({
      regulatoryConclusionAllowed: true,
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p.regulatoryConclusionAllowed).toBe(true)
  })
})

describe('Permissions — rationale always populated', () => {
  it('rationale is non-empty for every evaluation', () => {
    const p1 = evaluatePermissions(makeFinding())
    expect(p1.rationale.length).toBeGreaterThan(0)

    const p2 = evaluatePermissions(makeFinding({
      evidenceBasis: { kind: 'documented_8hr_twa', rationale: '', citationRefs: [] },
      samplingAdequacy: { forConclusion: true, forScreening: true, forHypothesis: true, rationale: [] },
      instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    }))
    expect(p2.rationale.length).toBeGreaterThan(0)
  })
})
