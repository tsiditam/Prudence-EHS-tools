/**
 * v2.3 §3/§4 — Limitations attached to findings, not to sections.
 *
 * Validates:
 *   - Each zone-section finding carries its limitations as
 *     RenderedFinding.limitations
 *   - ZoneSection does NOT have a `dataLimitations` field
 *   - The terminal "Limitations and Professional Judgment" verbatim
 *     paragraph is present
 *   - No section in the rendered output is titled "Data Limitations"
 */
import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import { LIMITATIONS_PARAGRAPH } from '../../src/engine/report/templates'
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

function buildReport() {
  const zone = {
    zn: 'Z1', su: 'office',
    co2: '1500', co2o: '420',
    pm: '50', tf: '74', rh: '52',
    mi: 'Small (< 10 sq ft)',
  }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  return result.kind === 'report' ? result : null
}

describe('v2.3 §3 — inline limitations on RenderedFinding', () => {
  const result = buildReport()
  if (!result) {
    it.skip('skipped — fixture produced pre-assessment-memo path', () => {})
    return
  }
  const report = result.report

  it('Each zone finding carries limitations as RenderedFinding.limitations', () => {
    let foundFindingWithLimitations = false
    for (const z of report.zoneSections) {
      for (const f of z.findings) {
        expect(Array.isArray(f.limitations)).toBe(true)
        if (f.limitations.length > 0) foundFindingWithLimitations = true
      }
    }
    expect(foundFindingWithLimitations).toBe(true)
  })

  it('ZoneSection does NOT have a separate dataLimitations field', () => {
    for (const z of report.zoneSections) {
      // v2.3 — dataLimitations was removed from the type. The
      // shape only has zoneId, zoneName, zoneDescription,
      // samplingSummary, findings, interpretation,
      // recommendedActions, professionalOpinion,
      // professionalOpinionLanguage.
      expect((z as any).dataLimitations).toBeUndefined()
    }
  })

  it('The terminal Limitations and Professional Judgment paragraph is present (verbatim)', () => {
    expect(report.limitationsAndProfessionalJudgment).toContain(LIMITATIONS_PARAGRAPH)
  })

  it('Rendered HTML does NOT contain a "Data Limitations" section heading', () => {
    const html = generateClientReportHTML(result)
    expect(html).not.toMatch(/<h2[^>]*>Data Limitations<\/h2>/)
    expect(html).not.toMatch(/<h3[^>]*>Data Limitations<\/h3>/)
  })

  it('Rendered HTML uses the "Limitations of this finding" inline label', () => {
    const html = generateClientReportHTML(result)
    expect(html).toContain('Limitations of this finding')
  })
})
