/**
 * AtmosFlow 3.0 — end-to-end domain run on the canonical Meridian demo.
 *
 * Runs the Investigation Decision Framework (Stage 2) over the SAME demo data
 * the legacy engine scores, and asserts the evidence-based output: findings,
 * statuses, priorities, escalations, conservative summary, and — critically —
 * that NO numeric risk score appears anywhere in the v3 output.
 */

import { describe, it, expect } from 'vitest'
import { assessBuildingV3 } from '../../lib/investigation/assess'
import {
  AssessmentStatus,
  ComparisonApplicability,
  FindingStatus,
  InvestigationPriority,
} from '../../lib/investigation/types'
// eslint-disable-next-line import/extensions
import { DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData'

// v3 consumes the same shape the legacy engine does; merge building-level HVAC
// fields into each zone exactly as scoreZone(z, bldg) does (d = {...bldg, ...z}).
const CTX = {
  engineVersion: '3.0.0-alpha',
  now: '2026-08-11T00:00:00Z',
  calibrationStatus: 'current' as const,
  occupancyDocumented: false,
}
const zones = (DEMO_ZONES as any[]).map((z) => ({ ...(DEMO_BUILDING as any), ...z }))

describe('AtmosFlow 3.0 e2e — Meridian Commerce Tower', () => {
  const result = assessBuildingV3(zones, CTX)

  it('produces an evidence-based summary with NO numeric risk score anywhere', () => {
    // Summary shape carries no score field.
    for (const k of ['score', 'riskScore', 'composite', 'tot', 'risk']) {
      expect(Object.keys(result.summary)).not.toContain(k)
    }
    // No finding carries a legacy numeric score field.
    const allFindings = result.zones.flatMap((z) => z.findings)
    for (const f of allFindings) {
      for (const k of ['tot', 'score', 'risk', 'rc', 'composite']) {
        expect(Object.keys(f)).not.toContain(k)
      }
    }
    expect(allFindings.length).toBeGreaterThan(5)
  })

  it('summary is conservative: conditions identified, priority follow-up, professional review', () => {
    expect(result.summary.status).toBe(AssessmentStatus.CONDITIONS_IDENTIFIED)
    expect(result.summary.highestPriority).toBe(InvestigationPriority.PRIORITY)
    expect(result.professionalReviewRequired).toBe(true)
  })

  it('the open-office CO₂ finding is a ventilation surrogate, further-evaluation, no health-limit claim', () => {
    const openOffice = result.zones[0]
    const co2 = openOffice.findings.find((f) => f.parameter === 'co2_ventilation_surrogate')!
    expect(co2.findingStatus).toBe(FindingStatus.FURTHER_EVALUATION_WARRANTED)
    expect(co2.referenceAssessment?.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    expect(co2.prohibitedInterpretations.join(' ').toLowerCase()).toContain('co₂ exceeded the safe limit')
  })

  it('the open-office PM2.5 I/O pattern is a condition (indoor source), priority', () => {
    const pm = result.zones[0].findings.find((f) => f.parameter === 'pm2.5')!
    expect(pm.findingStatus).toBe(FindingStatus.CONDITION_IDENTIFIED)
    expect(pm.investigationPriority).toBe(InvestigationPriority.PRIORITY)
  })

  it('the shared drain-pan condition escalates (critical HVAC)', () => {
    const anyHvacEscalation = result.zones.some((z) =>
      z.escalations.some((e) => e.ruleId === 'AF-ESC-HVAC-CRITICAL'),
    )
    expect(anyHvacEscalation).toBe(true)
  })

  it('the conference-room active leak is stated as observed and escalates', () => {
    const confRoom = result.zones[1]
    const water = confRoom.findings.find((f) => f.parameter === 'water_intrusion')!
    expect(water.observedCondition.toLowerCase()).toContain('active water intrusion was observed')
    expect(confRoom.escalations.some((e) => e.ruleId === 'AF-ESC-ACTIVE-WATER')).toBe(true)
  })

  it('suspected discoloration is never called confirmed mold', () => {
    const micro = result.zones[0].findings.find((f) => f.parameter === 'suspected_microbial_growth')!
    expect(micro.findingStatus).toBe(FindingStatus.FURTHER_EVALUATION_WARRANTED)
    expect(micro.prohibitedInterpretations).toContain('confirmed mold')
  })
})
