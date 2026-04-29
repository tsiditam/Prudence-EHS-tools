/**
 * v2.2 §1a — rollup bug regression tests.
 *
 * Validates that:
 *   1. Observational ConditionTypes (visible mold, drain pan growth,
 *      water damage, occupant clusters, etc.) are capped at
 *      severityInternal = 'high' even when the legacy scoring engine
 *      emits 'critical'.
 *   2. An assessment with extensive observational findings but NO
 *      validated_defensible measurements rolls up to AT MOST
 *      conditions_warrant_further_investigation — never
 *      conditions_warrant_corrective_action.
 *   3. An assessment with measured PEL-exceedance evidence still
 *      rolls up to corrective_action via Rule 2 (severity=critical).
 */

import { describe, it, expect } from 'vitest'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { renderClientReport } from '../../src/engine/report/client'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test Site',
  siteAddress: '123 Test St',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH', 'CSP'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'Recipient', organization: 'Org' },
}

describe('v2.2 §1a — observational severity cap', () => {
  it('Extensive visible mold caps at severityInternal=high (not critical)', () => {
    const zone = { zn: 'Z1', su: 'office', mi: 'Extensive (> 100 sq ft)' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    const moldFinding = findings.find(f => f.conditionType === 'apparent_microbial_growth')
    expect(moldFinding).toBeDefined()
    expect(moldFinding!.severityInternal).toBe('high')
  })

  it('Drain pan with biological growth caps at severityInternal=high (building-scoped)', () => {
    const zone = { zn: 'Z1', su: 'office' }
    const bldg = { dp: 'Bio growth observed' }
    const lz = scoreZone(zone, bldg)
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ ...zone, ...bldg } as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    const dpFinding = findings.find(f => f.conditionType === 'hvac_drain_pan_microbial_reservoir')
    expect(dpFinding).toBeDefined()
    expect(dpFinding!.severityInternal).toBe('high')
    // And by §1b, it is building-scoped:
    expect(dpFinding!.scope).toBe('hvac_system')
  })

  it('Extensive water damage caps at severityInternal=high', () => {
    const zone = { zn: 'Z1', su: 'office', wd: 'Extensive damage' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    const wd = findings.find(f => f.conditionType === 'active_or_historical_water_damage')
    expect(wd).toBeDefined()
    expect(wd!.severityInternal).toBe('high')
  })

  it('Observational-only assessment rolls up to conditions_warrant_further_investigation, NOT corrective_action', () => {
    // Many observational findings, NO measured PEL exceedance.
    const zone = {
      zn: 'Bad Zone',
      su: 'office',
      mi: 'Extensive (> 100 sq ft)',
      wd: 'Extensive damage',
      cx: 'Yes — complaints reported',
      ac: 'More than 10',
      sr: 'Yes — clear pattern',
      cc: 'Yes — this zone',
      sy: ['Headache', 'Fatigue'],
    }
    const bldg = { dp: 'Bio growth observed', fc: 'Damaged / Bypass', hm: 'Over 12 months' }
    const lz = scoreZone(zone, bldg)
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ ...zone, ...bldg } as any], { meta: META })
    expect(score.zones[0].professionalOpinion).not.toBe('conditions_warrant_corrective_action')
    expect([
      'conditions_warrant_monitoring',
      'conditions_warrant_further_investigation',
    ]).toContain(score.zones[0].professionalOpinion)
  })

  it('Measured PEL exceedance still produces severity=critical and corrective_action rollup', () => {
    // CO above OSHA PEL is a measured-exceedance ConditionType, NOT in
    // the observational cap list, so the legacy critical severity flows
    // through and the rollup hits Rule 2 (any critical → corrective).
    const zone = { zn: 'Z1', su: 'office', co: '60' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    const co = findings.find(f => f.conditionType === 'co_above_pel_documented')
    expect(co).toBeDefined()
    expect(co!.severityInternal).toBe('critical')
    expect(score.zones[0].professionalOpinion).toBe('conditions_warrant_corrective_action')
  })
})

describe('v2.2 §1a — site-level rollup honors per-zone caps', () => {
  it('All-observational, multi-zone site does not roll up to corrective_action', () => {
    const zones = [
      { zn: 'A', su: 'office', mi: 'Extensive (> 100 sq ft)' },
      { zn: 'B', su: 'office', wd: 'Extensive damage' },
      { zn: 'C', su: 'office', cx: 'Yes — complaints reported', ac: 'More than 10', cc: 'Yes — this zone' },
    ]
    const bldg = { dp: 'Bio growth observed' }
    const lzs = zones.map(z => scoreZone(z, bldg))
    const cs = compositeScore(lzs)
    const result = renderClientReport(legacyToAssessmentScore(lzs, cs, zones.map(z => ({ ...z, ...bldg })) as any, { meta: META }))
    if (result.kind === 'pre_assessment_memo') return // memo path is also defensible
    expect(result.report.executiveSummary.overallProfessionalOpinion).not.toBe('conditions_warrant_corrective_action')
  })
})
