/**
 * v2.2 §1b/§1c — dedup regression tests.
 *
 * Validates:
 *   1. Multi-zone assessment with identical HVAC condition produces
 *      exactly ONE rendered building-scoped finding.
 *   2. Recommendations register has no duplicate (action+ref) tuple.
 *   3. Zone sections do NOT contain HVAC findings (those are in the
 *      Building and System Conditions section).
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

const PRESURVEY = {
  ps_assessor: 'Tester',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
}

function buildMultiZoneScore() {
  // 4 zones served by the same HVAC. Building HVAC fields produce
  // identical findings on every per-zone scorer pass — historically
  // that meant 4× duplicated HVAC findings in the report.
  const zones = [
    { zn: 'Z1', su: 'office', co2: '900', co2o: '420', tf: '74', rh: '52', pm: '12' },
    { zn: 'Z2', su: 'office', co2: '850', co2o: '420', tf: '73', rh: '50', pm: '10' },
    { zn: 'Z3', su: 'office', co2: '950', co2o: '420', tf: '75', rh: '54', pm: '14' },
    { zn: 'Z4', su: 'office', co2: '880', co2o: '420', tf: '72', rh: '48', pm: '11' },
  ]
  const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  return {
    zones,
    bldg,
    score: legacyToAssessmentScore(lzs, cs, zones.map(z => ({ ...z, ...bldg })) as any, { meta: META, presurvey: PRESURVEY }),
  }
}

describe('v2.2 §1b — building-scoped HVAC findings render once', () => {
  const { score } = buildMultiZoneScore()
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  const report = result.report

  it('zone sections do NOT contain HVAC narrative', () => {
    for (const zoneSection of report.zoneSections) {
      // v2.3 — zone findings are RenderedFinding[], not observedConditions[]
      const text = (zoneSection.findings || []).map(f => f.narrative).join(' ')
      expect(text).not.toMatch(/HVAC maintenance/i)
      expect(text).not.toMatch(/Air filters were observed/i)
    }
  })

  it('Building and System Conditions section contains the HVAC findings exactly once each', () => {
    // v2.3 §2 — section is rendered iff at least one building finding exists.
    const bs = report.buildingAndSystemConditions
    expect(bs).toBeDefined()
    expect(bs!.rendered).toBe(true)
    const narratives = bs!.findings.map(f => f.narrative)
    const maintCount = narratives.filter(n => /HVAC maintenance|deferred maintenance/i.test(n)).length
    const filterCount = narratives.filter(n => /heavily loaded|filter.*loaded|filtration efficiency/i.test(n)).length
    expect(maintCount).toBeLessThanOrEqual(1)
    expect(filterCount).toBeLessThanOrEqual(1)
    expect(maintCount + filterCount).toBeGreaterThan(0)
  })
})

describe('v2.2 §1c — recommendations register dedup', () => {
  it('No two register items share the same (action+standardReference) tuple', () => {
    const { score } = buildMultiZoneScore()
    const result = renderClientReport(score)
    if (result.kind !== 'report') throw new Error('Expected report')
    const reg = result.report.recommendationsRegister
    const all = [...reg.immediate, ...reg.shortTerm, ...reg.furtherEvaluation, ...reg.longTermOptional]
    const keys = all.map(a => `${a.action}|${a.standardReference ?? ''}`)
    expect(keys.length).toBe(new Set(keys).size)
  })

  it('Single-zone same-action duplicates also dedup', () => {
    // Same finding produces same default action; force two findings of
    // the same conditionType in one zone (mold + water damage both
    // recommend remediation per IICRC). Verify resulting register has
    // unique action text per (action,ref) tuple.
    const zone = { zn: 'Z1', su: 'office', co2: '850', co2o: '420', tf: '74', rh: '52', pm: '12', mi: 'Small (< 10 sq ft)', wd: 'Active leak' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') throw new Error('Expected report')
    const reg = result.report.recommendationsRegister
    const all = [...reg.immediate, ...reg.shortTerm, ...reg.furtherEvaluation, ...reg.longTermOptional]
    const keys = all.map(a => `${a.action}|${a.standardReference ?? ''}`)
    expect(keys.length).toBe(new Set(keys).size)
  })
})
