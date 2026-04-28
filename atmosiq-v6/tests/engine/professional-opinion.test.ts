import { describe, it, expect } from 'vitest'
import { evaluateZoneOpinion, evaluateSiteOpinion, OPINION_TIER_LANGUAGE, CONFIDENCE_TIER_LANGUAGE } from '../../src/engine/report/professional-opinion'
import type { ZoneScore, Finding, FindingId, ZoneId, CategoryScore } from '../../src/engine/types/domain'

function makeFinding(sev: string, conf: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id: ('F-' + Math.random().toString(36).slice(2, 6)) as FindingId,
    category: 'Contaminants', zoneId: 'Z-01' as ZoneId,
    severityInternal: sev as any, titleInternal: 'test', observationInternal: 'test', deductionInternal: 5,
    conditionType: 'co_screening_elevated', confidenceTier: conf as any,
    definitiveConclusionAllowed: false, causationSupported: false, regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'test', evidenceBasis: { kind: 'screening_grab', rationale: '', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    limitations: [], recommendedActions: [], thresholdSource: '',
    ...overrides,
  }
}

function makeZone(findings: Finding[]): ZoneScore {
  return {
    zoneId: 'Z-01' as ZoneId, zoneName: 'Test Zone', composite: 50, tier: 'Moderate',
    confidence: 'provisional_screening_level',
    categories: [{ category: 'Contaminants', rawScore: 15, cappedScore: 15, maxScore: 25, status: 'scored', findings, sufficiencyRatio: 0.8 }],
    professionalOpinion: 'no_significant_concerns_identified',
  }
}

describe('Professional Opinion — zone-level rollup', () => {
  it('Rule 1: validated_defensible + critical → corrective_action', () => {
    const zone = makeZone([makeFinding('critical', 'validated_defensible')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_corrective_action')
  })

  it('Rule 1: validated_defensible + high → corrective_action', () => {
    const zone = makeZone([makeFinding('high', 'validated_defensible')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_corrective_action')
  })

  it('Rule 2: any critical regardless of confidence → corrective_action', () => {
    const zone = makeZone([makeFinding('critical', 'qualitative_only')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_corrective_action')
  })

  it('Rule 3: validated_defensible + medium → further_investigation', () => {
    const zone = makeZone([makeFinding('medium', 'validated_defensible')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_further_investigation')
  })

  it('Rule 4: 2+ provisional at high/medium → further_investigation', () => {
    const zone = makeZone([
      makeFinding('high', 'provisional_screening_level'),
      makeFinding('medium', 'provisional_screening_level'),
    ])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_further_investigation')
  })

  it('Rule 4: single provisional high → NOT further_investigation', () => {
    const zone = makeZone([makeFinding('high', 'provisional_screening_level')])
    expect(evaluateZoneOpinion(zone)).not.toBe('conditions_warrant_further_investigation')
  })

  it('Rule 5: qualitative_only + medium → monitoring', () => {
    const zone = makeZone([makeFinding('medium', 'qualitative_only')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_monitoring')
  })

  it('Rule 7: all pass/info → no_significant_concerns', () => {
    const zone = makeZone([makeFinding('pass', 'provisional_screening_level')])
    expect(evaluateZoneOpinion(zone)).toBe('no_significant_concerns_identified')
  })
})

describe('Professional Opinion — site-level rollup', () => {
  it('worst zone wins', () => {
    const z1 = makeZone([makeFinding('critical', 'validated_defensible')])
    z1.professionalOpinion = evaluateZoneOpinion(z1) as any
    const z2 = makeZone([makeFinding('pass', 'provisional_screening_level')])
    z2.professionalOpinion = evaluateZoneOpinion(z2) as any
    expect(evaluateSiteOpinion([z1, z2])).toBe('conditions_warrant_corrective_action')
  })

  it('empty zones → no significant concerns', () => {
    expect(evaluateSiteOpinion([])).toBe('no_significant_concerns_identified')
  })
})

describe('Professional Opinion — language maps', () => {
  it('every tier has language', () => {
    expect(OPINION_TIER_LANGUAGE.no_significant_concerns_identified).toBeDefined()
    expect(OPINION_TIER_LANGUAGE.conditions_warrant_monitoring).toBeDefined()
    expect(OPINION_TIER_LANGUAGE.conditions_warrant_further_investigation).toBeDefined()
    expect(OPINION_TIER_LANGUAGE.conditions_warrant_corrective_action).toBeDefined()
  })

  it('every confidence tier has language', () => {
    expect(CONFIDENCE_TIER_LANGUAGE.validated_defensible).toBeDefined()
    expect(CONFIDENCE_TIER_LANGUAGE.provisional_screening_level).toBeDefined()
    expect(CONFIDENCE_TIER_LANGUAGE.qualitative_only).toBeDefined()
    expect(CONFIDENCE_TIER_LANGUAGE.insufficient_data).toBeDefined()
  })
})
