/**
 * AtmosFlow assessment Word report — the consultant assessment content rendered
 * in the monitoring report's visual system (sections-atmosflow.js).
 *
 * Builds a small assessment fixture through the same engine pipeline the
 * consultant report uses (scoreZone → compositeScore → legacyToAssessmentScore →
 * renderClientReport), then renders it through atmosFlowReportChildren and packs
 * a Document to inspect the emitted XML. Asserts the children are non-empty, a
 * numbered section heading and real content survive to the DOCX, and an
 * editorially-suppressed finding is omitted.
 */
import { describe, it, expect } from 'vitest'
import { Document, Packer } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { renderClientReport } from '../../src/engine/report/client'
// @ts-expect-error — JS module without types
import { atmosFlowReportChildren } from '../../src/components/docx/sections-atmosflow'
// @ts-expect-error — JS module without types
import { MONITORING_DOCX_STYLES } from '../../src/components/docx/sections-monitoring'

const META: any = {
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

function buildReport(): any {
  const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz], cs, [zone], { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  return result
}

async function renderXml(report: any, options: any = {}): Promise<string> {
  const children = atmosFlowReportChildren(report, options)
  const doc = new Document({
    creator: 'AtmosFlow',
    title: 'Test',
    styles: MONITORING_DOCX_STYLES,
    sections: [{ children }],
  })
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('atmosFlowReportChildren — assessment report in the monitoring look', () => {
  it('produces a non-empty children array', () => {
    const result = buildReport()
    const children = atmosFlowReportChildren(result.report, {})
    expect(Array.isArray(children)).toBe(true)
    expect(children.length).toBeGreaterThan(0)
  })

  it('renders the cover title, a numbered section heading and real content', async () => {
    const result = buildReport()
    const xml = await renderXml(result.report)
    // Cover hero (buildCoverSection strips the "Indoor Air Quality " prefix).
    expect(xml).toContain('Assessment Report')
    // A numbered section heading from sectionHeading().
    expect(xml).toContain('Executive Summary')
    expect(xml).toContain('Recommendations')
    // Real engine content: the first results subsection heading survives.
    const firstResult = result.report.resultsSection?.subsections?.[0]?.heading
    if (firstResult) expect(xml).toContain(firstResult)
    // The limitations prose is rendered verbatim.
    const lim = (result.report.limitationsAndProfessionalJudgment || '').slice(0, 40)
    if (lim) expect(xml).toContain(lim)
  })

  it('omits an editorially-suppressed finding', async () => {
    const result = buildReport()
    const zoneWithFinding = (result.report.zoneSections || []).find(
      (z: any) => Array.isArray(z.findings) && z.findings.length > 0,
    )
    expect(zoneWithFinding).toBeTruthy()
    const finding = zoneWithFinding.findings[0]
    const snippet = (finding.narrative || '').slice(0, 40)
    expect(snippet.length).toBeGreaterThan(0)

    const base = await renderXml(result.report)
    expect(base).toContain(snippet)

    const cut = await renderXml(result.report, {
      editorialSuppressions: { targets: [{ kind: 'finding', findingId: finding.findingId }] },
    })
    expect(cut).not.toContain(snippet)
  })
})
