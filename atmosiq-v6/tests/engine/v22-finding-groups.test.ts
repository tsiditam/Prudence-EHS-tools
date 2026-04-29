/**
 * v2.2 visual upgrade — finding-group regression tests.
 *
 * Validates:
 *   1. Significant findings group correctly into Air Quality / HVAC /
 *      Environmental / Occupant / Corrosion buckets.
 *   2. Empty groups are omitted from output (an office assessment
 *      without corrosion findings produces no Corrosion Indicators
 *      group).
 *   3. Within a group, duplicate ConditionTypes dedup to one
 *      observation (PM2.5 elevated in three zones renders once).
 *   4. Pass/info findings do not contribute to any group.
 *   5. Each observation carries a non-empty leadTerm and statement.
 */

import { describe, it, expect } from 'vitest'
import { groupFindingsByDomain, getFindingGroup, getLeadTerm } from '../../src/engine/report/finding-groups'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import type { AssessmentMeta, Finding, FindingId, ZoneId } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test Site',
  siteAddress: '123 Test St',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'Recipient', organization: 'Org' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated',
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-01' as FindingId, category: 'Contaminants', zoneId: 'Z-01' as ZoneId,
    scope: 'zone',
    severityInternal: 'high', titleInternal: 't', observationInternal: 'o',
    deductionInternal: 10,
    conditionType: 'pm_screening_elevated',
    confidenceTier: 'provisional_screening_level',
    definitiveConclusionAllowed: false, causationSupported: false, regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'PM2.5 mass concentration was elevated. Confirmatory continuous sampling recommended.',
    evidenceBasis: { kind: 'screening_continuous', rationale: '', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: false, withinNoiseFloor: false },
    limitations: [], recommendedActions: [],
    thresholdSource: '',
    ...overrides,
  }
}

describe('v2.2 finding-groups — domain mapping', () => {
  it('PM2.5 → Air Quality Indicators', () => {
    expect(getFindingGroup('pm_screening_elevated')).toBe('Air Quality Indicators')
  })

  it('Corrosion → Corrosion Indicators', () => {
    expect(getFindingGroup('possible_corrosive_environment')).toBe('Corrosion Indicators')
  })

  it('HVAC drain pan → HVAC System', () => {
    expect(getFindingGroup('hvac_drain_pan_microbial_reservoir')).toBe('HVAC System')
  })

  it('Humidity → Environmental Conditions', () => {
    expect(getFindingGroup('humidity_microbial_amplification_range')).toBe('Environmental Conditions')
  })

  it('Occupant cluster → Occupant Feedback', () => {
    expect(getFindingGroup('occupant_cluster_anecdotal')).toBe('Occupant Feedback')
  })

  it('Lead terms are reader-friendly (not raw ConditionType)', () => {
    expect(getLeadTerm('pm_screening_elevated')).toBe('PM2.5 (screening-level)')
    expect(getLeadTerm('humidity_above_comfort_upper_bound')).toBe('Relative humidity')
    expect(getLeadTerm('possible_corrosive_environment')).toBe('Corrosive environment indicators')
  })
})

describe('v2.2 finding-groups — groupFindingsByDomain', () => {
  it('Empty findings list → empty groups array', () => {
    expect(groupFindingsByDomain([])).toEqual([])
  })

  it('All-pass findings → empty groups array (pass filtered out)', () => {
    const findings = [
      makeFinding({ severityInternal: 'pass', conditionType: 'pm_screening_elevated' }),
      makeFinding({ severityInternal: 'info', conditionType: 'co_screening_elevated' }),
    ]
    expect(groupFindingsByDomain(findings)).toEqual([])
  })

  it('Single significant finding → one-group result', () => {
    const result = groupFindingsByDomain([makeFinding({ conditionType: 'pm_screening_elevated' })])
    expect(result.length).toBe(1)
    expect(result[0].groupName).toBe('Air Quality Indicators')
    expect(result[0].observations.length).toBe(1)
    expect(result[0].observations[0].leadTerm).toBe('PM2.5 (screening-level)')
  })

  it('Multiple findings of same conditionType in same group → one observation (dedup)', () => {
    // PM2.5 elevated in three zones — should produce ONE observation
    const findings = [
      makeFinding({ id: 'F-01' as FindingId, conditionType: 'pm_screening_elevated' }),
      makeFinding({ id: 'F-02' as FindingId, conditionType: 'pm_screening_elevated' }),
      makeFinding({ id: 'F-03' as FindingId, conditionType: 'pm_screening_elevated' }),
    ]
    const result = groupFindingsByDomain(findings)
    expect(result.length).toBe(1)
    expect(result[0].observations.length).toBe(1)
  })

  it('Mixed groups produce multiple buckets, ordered canonically', () => {
    const findings = [
      makeFinding({ conditionType: 'occupant_cluster_anecdotal' }),
      makeFinding({ conditionType: 'pm_screening_elevated' }),
      makeFinding({ conditionType: 'humidity_microbial_amplification_range' }),
      makeFinding({ conditionType: 'hvac_filter_loaded', scope: 'hvac_system' }),
    ]
    const result = groupFindingsByDomain(findings)
    // Canonical order: Air Quality, HVAC System, Environmental, Occupant Feedback, Corrosion
    expect(result.map(g => g.groupName)).toEqual([
      'Air Quality Indicators',
      'HVAC System',
      'Environmental Conditions',
      'Occupant Feedback',
    ])
  })

  it('Empty groups absent from output (no corrosion findings → no Corrosion group)', () => {
    const findings = [makeFinding({ conditionType: 'pm_screening_elevated' })]
    const result = groupFindingsByDomain(findings)
    expect(result.find(g => g.groupName === 'Corrosion Indicators')).toBeUndefined()
  })

  it('Each observation carries non-empty leadTerm and statement', () => {
    const findings = [
      makeFinding({ conditionType: 'pm_screening_elevated' }),
      makeFinding({
        conditionType: 'apparent_microbial_growth',
        approvedNarrativeIntent: 'Apparent fungal growth was observed. Visual identification only.',
      }),
    ]
    const result = groupFindingsByDomain(findings)
    for (const g of result) {
      for (const obs of g.observations) {
        expect(obs.leadTerm.length).toBeGreaterThan(0)
        expect(obs.statement.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('v2.2 finding-groups — end-to-end through ClientReport', () => {
  it('renderClientReport populates ExecutiveSummary.findingsByGroup', () => {
    const zone = {
      zn: 'Z1', su: 'office',
      co2: '1400', co2o: '420', // high — Air Quality
      tf: '79', rh: '68',         // out of comfort — Environmental
      pm: '12',                   // pass
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const groups = result.report.executiveSummary.findingsByGroup
    expect(groups.length).toBeGreaterThan(0)
    // Should have Air Quality (CO2 elevated) + Environmental (humidity/temp)
    const groupNames = groups.map(g => g.groupName)
    expect(groupNames).toContain('Air Quality Indicators')
    expect(groupNames).toContain('Environmental Conditions')
    // Should NOT have Corrosion (no corrosion findings)
    expect(groupNames).not.toContain('Corrosion Indicators')
  })

  it('All-pass assessment produces empty findingsByGroup', () => {
    const zone = {
      zn: 'Quiet', su: 'office',
      co2: '600', co2o: '420', tf: '72', rh: '45', pm: '5',
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    expect(result.report.executiveSummary.findingsByGroup).toEqual([])
  })
})
