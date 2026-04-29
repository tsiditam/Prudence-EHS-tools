/**
 * Regression — pass/info findings must not produce recommended actions.
 *
 * Previously the bridge attached the phrase library's default
 * recommendedActions to every classified finding, including those
 * whose severity came back at 'pass' or 'info'. The renderer filters
 * pass/info findings out of "Observed conditions" but pulled their
 * actions into the "Recommended actions" list, producing zones that
 * said "No significant conditions identified" while listing 4–6
 * follow-up actions immediately below. This test pins the fix.
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
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'Recipient', organization: 'Org' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
}

describe('Pass/info findings do not produce recommended actions', () => {
  it('Zone with all-pass parameters carries zero recommendedActions', () => {
    // CO2 ~520 with outdoor 420 → diff 100, well within screening
    // pass. Temperature 72°F + 45% RH within ASHRAE 55. PM low.
    const zone = {
      zn: 'Quiet Zone', su: 'office',
      co2: '520', co2o: '420', tf: '72', rh: '45', pm: '5',
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })

    // Every finding the bridge produced should be either pass/info
    // (with empty recommendedActions) OR significant.
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    expect(findings.length).toBeGreaterThan(0) // bridge does emit findings
    for (const f of findings) {
      const isSignificant = f.severityInternal !== 'pass' && f.severityInternal !== 'info'
      if (!isSignificant) {
        expect(f.recommendedActions.length).toBe(0)
      }
    }

    // Zone section should not display contradictory output:
    // if "No significant conditions" is the message, the
    // recommendedActions array should also be empty.
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const zs = result.report.zoneSections[0]
    const noSignificant = zs.observedConditions.some(c =>
      c.toLowerCase().includes('no significant conditions identified'),
    )
    if (noSignificant) {
      expect(zs.recommendedActions.length).toBe(0)
    }
  })

  it('Zone with mixed pass + significant findings only carries actions from the significant ones', () => {
    // CO2 elevated (>700 ppm above outdoor) + temp/RH pass.
    // Recommended actions should reflect only the elevated CO2,
    // not also follow-up actions tied to the passed temp/RH
    // findings.
    const zone = {
      zn: 'Mixed Zone', su: 'office',
      co2: '1400', co2o: '420', // diff 980 → high
      tf: '72', rh: '45',       // pass
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })

    const findings = score.zones[0].categories.flatMap(c => c.findings)
    const significantFindings = findings.filter(f =>
      f.severityInternal !== 'pass' && f.severityInternal !== 'info',
    )
    const passFindings = findings.filter(f =>
      f.severityInternal === 'pass' || f.severityInternal === 'info',
    )

    // Pass findings should have empty recommendedActions
    for (const f of passFindings) {
      expect(f.recommendedActions.length).toBe(0)
    }

    // Significant findings should carry their phrase-library actions
    expect(significantFindings.length).toBeGreaterThan(0)
    expect(significantFindings.some(f => f.recommendedActions.length > 0)).toBe(true)
  })

  it('Building-scoped pass-level HVAC condition produces no actions', () => {
    // hm='Within 6 months' → 'pass' severity in scoring.js.
    // The HVAC maintenance finding gets classified as
    // hvac_maintenance_overdue (the only ConditionType the
    // classifier produces for HVAC maintenance text), but since
    // severity is pass, it should carry no recommendedActions.
    const zone = { zn: 'Z1', su: 'office', co2: '600', co2o: '420', tf: '72', rh: '50', pm: '5' }
    const bldg = { hm: 'Within 6 months' } // pass
    const lz = scoreZone(zone, bldg)
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [{ ...zone, ...bldg }] as any, { meta: META, presurvey: PRESURVEY })

    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    // Building-conditions section should report "no conditions identified"
    // and carry no recommended actions.
    const bs = result.report.buildingAndSystemConditions
    const allClear = bs.observedConditions.some(c =>
      c.toLowerCase().includes('no building or system conditions'),
    )
    if (allClear) {
      expect(bs.recommendedActions.length).toBe(0)
    }
  })
})
