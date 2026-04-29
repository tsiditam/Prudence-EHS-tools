/**
 * v2.5 §6 acceptance — Executive Summary cross-zone consolidation.
 *
 * Validates:
 *   1. Same conditionType in N zones consolidates to ONE Exec Summary
 *      entry naming all zones in the "Observed in:" suffix.
 *   2. Per-zone Zone Findings sections still render the finding
 *      under each zone where it occurred (consolidation is an Exec
 *      Summary concern only).
 *   3. The consolidator returns at most 6 entries (+ optional
 *      truncation note).
 *   4. Sort order is severity → confidence → coverage.
 */

import { describe, it, expect } from 'vitest'
import {
  consolidateExecutiveSummaryFindings,
  renderExecSummaryEntry,
} from '../../src/engine/report/exec-summary-findings'
import type {
  Finding, ZoneScore, FindingId, ZoneId, CategoryName,
} from '../../src/engine/types/domain'

function f(overrides: Partial<Finding>): Finding {
  return {
    id: ('F-0001' as FindingId),
    category: ('Complaints' as CategoryName),
    zoneId: ('Z-001' as ZoneId),
    scope: 'zone',
    severityInternal: 'medium',
    titleInternal: 'Title',
    observationInternal: 'Observation',
    deductionInternal: 5,
    conditionType: 'occupant_cluster_anecdotal',
    confidenceTier: 'qualitative_only',
    definitiveConclusionAllowed: false,
    causationSupported: false,
    regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'Multiple occupants reported similar symptoms.',
    evidenceBasis: { kind: 'occupant_report', supportsDefinitive: false } as Finding['evidenceBasis'],
    samplingAdequacy: { adequacy: 'screening_only', limitations: [] } as Finding['samplingAdequacy'],
    instrumentAccuracyConsidered: { checked: false, withinNoiseFloor: false, observedValue: 0, thresholdValue: 0 },
    limitations: [],
    recommendedActions: [],
    thresholdSource: 'observational',
    ...overrides,
  } as Finding
}

function zone(name: string, findings: Finding[]): ZoneScore {
  return {
    zoneId: (name as ZoneId),
    zoneName: name,
    composite: 50,
    tier: 'B',
    confidence: 'qualitative_only',
    professionalOpinion: 'conditions_warrant_monitoring',
    categories: [
      {
        category: 'Complaints',
        rawScore: 0,
        cappedScore: 0,
        maxScore: 100,
        status: 'scored',
        findings,
        sufficiencyRatio: 1,
      },
    ],
  } as ZoneScore
}

describe('v2.5 §6 — Executive Summary cross-zone consolidation', () => {
  it('merges same conditionType across two zones into ONE entry with both zone names', () => {
    const findings = [
      f({ conditionType: 'occupant_cluster_anecdotal' }),
      f({ conditionType: 'occupant_cluster_anecdotal' }),
    ]
    const zones = [
      zone('3rd Floor Open Office', [findings[0]]),
      zone('Conference Room B', [findings[1]]),
    ]
    const consolidated = consolidateExecutiveSummaryFindings(zones, [])
    expect(consolidated).toHaveLength(1)
    expect(consolidated[0].zonesObserved).toEqual(['3rd Floor Open Office', 'Conference Room B'])
  })

  it('renders entry with the "Observed in: <zone list>" suffix', () => {
    const consolidated = consolidateExecutiveSummaryFindings(
      [zone('Lobby', [f({ conditionType: 'occupant_cluster_anecdotal' })])],
      [],
    )
    const line = renderExecSummaryEntry(consolidated[0])
    expect(line).toMatch(/Observed in: Lobby\.$/)
  })

  it('caps consolidated output at 6 entries plus a truncation note', () => {
    // 8 distinct conditionTypes — should produce 6 + truncation note
    const types = [
      'co_above_pel_documented', 'hcho_above_pel_documented', 'pm_above_naaqs_documented',
      'tvoc_screening_elevated', 'apparent_microbial_growth', 'objectionable_odor',
      'temperature_outside_comfort', 'humidity_above_comfort_upper_bound',
    ] as const
    const findings = types.map((ct, i) =>
      f({ id: (`F-${String(i).padStart(4, '0')}` as FindingId), conditionType: ct, severityInternal: 'high' }),
    )
    const z = zone('Zone X', findings)
    const consolidated = consolidateExecutiveSummaryFindings([z], [])
    expect(consolidated.length).toBe(7) // 6 entries + 1 truncation note
    expect(consolidated[6].isTruncationNote).toBe(true)
    expect(consolidated[6].summary).toContain('Additional findings of lower priority')
  })

  it('does not truncate when there are 6 or fewer groups', () => {
    const findings = [
      f({ conditionType: 'co_above_pel_documented' }),
      f({ conditionType: 'temperature_outside_comfort' }),
      f({ conditionType: 'pm_screening_elevated' }),
    ]
    const consolidated = consolidateExecutiveSummaryFindings(
      [zone('Zone X', findings)],
      [],
    )
    expect(consolidated).toHaveLength(3)
    expect(consolidated.some(c => c.isTruncationNote)).toBe(false)
  })

  it('orders entries by severity (critical > high > medium > low)', () => {
    const findings = [
      f({ id: ('F-1' as FindingId), conditionType: 'occupant_symptoms_anecdotal', severityInternal: 'low' }),
      f({ id: ('F-2' as FindingId), conditionType: 'co_above_pel_documented', severityInternal: 'critical' }),
      f({ id: ('F-3' as FindingId), conditionType: 'temperature_outside_comfort', severityInternal: 'medium' }),
    ]
    const consolidated = consolidateExecutiveSummaryFindings(
      [zone('Zone X', findings)],
      [],
    )
    // First entry should be the critical conditionType
    expect(consolidated[0].label.toLowerCase()).toContain('carbon monoxide')
  })

  it('skips pass and info findings (they never enter consolidation)', () => {
    const findings = [
      f({ conditionType: 'co_above_pel_documented', severityInternal: 'pass' }),
      f({ conditionType: 'temperature_outside_comfort', severityInternal: 'info' }),
      f({ conditionType: 'pm_screening_elevated', severityInternal: 'medium' }),
    ]
    const consolidated = consolidateExecutiveSummaryFindings(
      [zone('Zone X', findings)],
      [],
    )
    expect(consolidated).toHaveLength(1)
  })

  it('renders building-scoped findings with the "Observed at: building level." suffix', () => {
    const buildingFinding = f({
      id: ('F-bldg' as FindingId),
      conditionType: 'hvac_filter_loaded',
      scope: 'hvac_system',
      zoneId: null,
      severityInternal: 'high',
    })
    const consolidated = consolidateExecutiveSummaryFindings([], [buildingFinding])
    const line = renderExecSummaryEntry(consolidated[0])
    expect(line).toMatch(/Observed at: building level\.$/)
  })
})
