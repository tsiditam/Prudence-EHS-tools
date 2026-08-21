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

const TIER_ORDER_FOR_TEST: Record<string, number> = {
  no_significant_concerns_identified: 0,
  conditions_warrant_monitoring: 1,
  conditions_warrant_further_investigation: 2,
  conditions_warrant_corrective_action: 3,
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

  // This test previously asserted the OPPOSITE — that a single provisional
  // high finding must NOT reach further_investigation. That was the bug
  // written down as a requirement: the old "2+" rule meant one such finding
  // matched nothing and fell through to no_significant_concerns, so a room
  // at CO₂ 2,500 ppm was reported as having no significant concerns.
  it('a single provisional high finding still warrants further investigation', () => {
    const zone = makeZone([makeFinding('high', 'provisional_screening_level')])
    expect(evaluateZoneOpinion(zone)).toBe('conditions_warrant_further_investigation')
  })

  describe('properties that make the tiers non-contradictory', () => {
    const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
    const CONFIDENCES = [
      'insufficient_data', 'qualitative_only', 'provisional_screening_level', 'validated_defensible',
    ] as const

    // Volume is not severity. If N identical findings could outrank one,
    // then splitting a finding in two would change the verdict.
    it('is count-invariant — one finding and ten identical ones agree', () => {
      for (const sev of SEVERITIES) {
        for (const conf of CONFIDENCES) {
          const one = evaluateZoneOpinion(makeZone([makeFinding(sev, conf)]))
          const ten = evaluateZoneOpinion(makeZone(Array.from({ length: 10 }, () => makeFinding(sev, conf))))
          expect(ten, `${sev}/${conf}: 1 gave ${one}, 10 gave ${ten}`).toBe(one)
        }
      }
    })

    // Better evidence must never produce a weaker verdict. It did: one
    // qualitative_only high reached monitoring while one
    // provisional_screening_level high reached no_significant_concerns, so
    // an observation outranked a measurement.
    it('is monotonic in confidence — better evidence never lowers the tier', () => {
      for (const sev of SEVERITIES) {
        let previous = -1
        for (const conf of CONFIDENCES) {
          const rank = TIER_ORDER_FOR_TEST[evaluateZoneOpinion(makeZone([makeFinding(sev, conf)]))]
          expect(rank, `${sev}: ${conf} ranked below a weaker confidence tier`).toBeGreaterThanOrEqual(previous)
          previous = rank
        }
      }
    })

    // Severity is the primary axis: a worse finding never yields a milder
    // verdict than a lesser one at the same confidence.
    it('is monotonic in severity', () => {
      for (const conf of CONFIDENCES) {
        const ranks = [...SEVERITIES].reverse().map(
          (sev) => TIER_ORDER_FOR_TEST[evaluateZoneOpinion(makeZone([makeFinding(sev, conf)]))])
        for (let i = 1; i < ranks.length; i++) {
          expect(ranks[i], `${conf}: severity order broken`).toBeGreaterThanOrEqual(ranks[i - 1])
        }
      }
    })

    it('never reports a significant finding as no concerns', () => {
      for (const sev of ['critical', 'high', 'medium'] as const) {
        for (const conf of CONFIDENCES) {
          expect(evaluateZoneOpinion(makeZone([makeFinding(sev, conf)])),
            `${sev}/${conf} was reported as no concerns`).not.toBe('no_significant_concerns_identified')
        }
      }
    })
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
