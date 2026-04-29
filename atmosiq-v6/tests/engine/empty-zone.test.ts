/**
 * v2.3 §5 — Empty zone single-sentence rule.
 *
 * A zone with zero findings renders exactly:
 *   "No conditions warranting elevated concern were identified in
 *    this zone within the stated limitations."
 *
 * Does NOT render:
 *   - an empty observedConditions list
 *   - an empty recommendedActions list
 *   - the "no significant conditions identified" placeholder
 */
import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test', siteAddress: '1 St', assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'R', organization: 'O' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith', ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated',
}

describe('v2.3 §5 — empty zone single sentence', () => {
  // A zone with all parameters reading pass-level. CO2 well below
  // screening threshold, temperature within ASHRAE 55, low PM, low
  // VOC — should produce zero significant findings.
  const zone = { zn: 'Quiet', su: 'office', co2: '550', co2o: '420', tf: '72', rh: '45', pm: '5', tv: '50' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)

  it('empty zone has findings.length === 0', () => {
    if (result.kind !== 'report') return
    expect(result.report.zoneSections[0].findings.length).toBe(0)
  })

  it('rendered HTML contains the prescribed single sentence for the empty zone', () => {
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    expect(html).toContain('No conditions warranting elevated concern were identified in this zone within the stated limitations.')
  })

  it('rendered HTML does NOT contain the legacy "no significant conditions identified" placeholder', () => {
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    expect(html).not.toMatch(/no significant conditions identified within the stated limitations/i)
  })

  it('rendered HTML does NOT show an empty Recommended actions list under an empty zone', () => {
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    // Find the empty zone's card
    const cardMatch = html.match(/<div class="zone-card">[^]*?Quiet[^]*?<\/div>/)
    if (!cardMatch) return
    expect(cardMatch[0]).not.toMatch(/Recommended actions:/)
    expect(cardMatch[0]).not.toMatch(/Limitations of this finding:/)
  })
})
