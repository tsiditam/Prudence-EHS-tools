// @vitest-environment node
/**
 * Sections the consultant deliverable deliberately does not carry.
 *
 * Four were removed by product decision (2026-08) after a CIH review found
 * the report overbuilt for the work behind it:
 *
 *   • Criteria Applied            (was "Standards, Guidelines, and Benchmark Types")
 *   • Additional Criteria Considered (was "Standards Currency")
 *   • Potential Contributing Factors
 *   • Appendix F — Glossary
 *
 * They join the standards register, dropped for the same reason
 * (no-standards-register.test.ts). The common thread: each restated, in a
 * dedicated section, something the report already says where it matters.
 *
 * This file asserts absence from BOTH the DOCX and the HTML consultant
 * renderers, and — the part that actually bit us — that no contents-page
 * entry survives its section. "Standards, Guidelines, and Benchmark Types"
 * sat in the TOC after the section was renamed, so a removal that only
 * deletes the body is not finished.
 *
 * The builders themselves are NOT deleted and stay unit-tested; this is a
 * composition decision, and it is reversible by re-adding one line each.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'

const BUILDING = { fn: 'Omission Test', fl: '1 Test St', ft: 'Office', ht: 'CAV AHU', assessmentDate: '2026-08-19' }
// Trip a wide spread so every removed section would have content to render.
const ZONES = [
  { zid: 'z1', zn: 'Zone 1', su: 'office', tf: '90', rh: '80', co2: '1600', co2o: '420', co: '60', pm: '60', pmo: '6', tv: '4000', hc: '1', oc: '10', cx: 'Yes — complaints reported', sy: ['Headache', 'Fatigue'] },
  { zid: 'z2', zn: 'Zone 2', su: 'office', tf: '72', rh: '46', co2: '700', co2o: '420', co: '1', pm: '6', pmo: '6', tv: '110', hc: '0', oc: '8' },
]
const PRESURVEY = {
  ps_survey_date: '2026-08-19', ps_recipient_org: 'Omission Test',
  ps_inst_meter: 'TSI Q-Trak 7575', ps_inst_serial: 'QT-1',
  ps_inst_cal: '2026-06-02', ps_inst_cal_status: 'Current',
}

const REMOVED_HEADINGS = [
  'Criteria Applied',
  'Standards, Guidelines, and Benchmark Types',
  'Additional Criteria Considered',
  'Standards Currency',
  'Potential Contributing Factors',
  'Glossary',
]

function score() {
  const zoneScores = ZONES.map((z) => scoreZone(z, BUILDING))
  return { zoneScores, comp: compositeScore(zoneScores) }
}

async function docxXml(): Promise<string> {
  const { zoneScores, comp } = score()
  const { blob } = await getConsultantDocxBlob({
    building: BUILDING, presurvey: PRESURVEY, zones: ZONES, zoneScores, comp,
    profile: { name: 'J. Smith, CIH' }, photos: {}, version: '6.0.0', userMode: 'ih',
  })
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
  return zip.file('word/document.xml')!.async('string')
}

function html(): string {
  const { zoneScores, comp } = score()
  const s = legacyToAssessmentScore(zoneScores as never, comp as never, ZONES as never, {
    meta: {
      siteName: 'Omission Test', siteAddress: '1 Test St', assessmentDate: '2026-08-19',
      preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
      reviewStatus: 'draft_pending_professional_review',
      issuingFirm: { name: 'PSEC' }, projectNumber: 'PSEC-TEST-0001',
      transmittalRecipient: { fullName: 'R', organization: 'O' },
    } as never,
    presurvey: PRESURVEY, building: BUILDING,
  } as never)
  const result = renderClientReport(s)
  if (result.kind !== 'report') throw new Error('expected a report')
  return generateClientReportHTML(result)
}

describe('removed sections — DOCX', () => {
  it('renders none of the removed headings', async () => {
    const xml = await docxXml()
    for (const heading of REMOVED_HEADINGS) {
      expect(xml, `"${heading}" still renders`).not.toContain(heading)
    }
  })

  it('lists none of them in the table of contents either', async () => {
    const xml = await docxXml()
    // A removal that deletes only the body leaves the contents page pointing
    // at a section the reader cannot find.
    for (const heading of REMOVED_HEADINGS) {
      expect((xml.match(new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length,
        `"${heading}" appears in the document`).toBe(0)
    }
    expect(xml).not.toContain('Appendix F')
  })

  it('still renders the sections that were kept', async () => {
    const xml = await docxXml()
    for (const kept of ['Executive Summary', 'Zone Findings', 'Recommendations Register', 'Limitations', 'Certification', 'Criteria Background']) {
      expect(xml, `"${kept}" should still render`).toContain(kept)
    }
  })
})

describe('removed sections — HTML', () => {
  it('renders none of the removed headings', () => {
    const out = html()
    for (const heading of ['Potential Contributing Factors', 'Glossary']) {
      expect(out, `"${heading}" still renders`).not.toContain(heading)
    }
    expect(out).not.toContain('id="potential-contributing-factors"')
    expect(out).not.toContain('id="appendix-f"')
  })

  it('keeps the contents page consistent with the body', () => {
    const out = html()
    for (const anchorId of [...out.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1])) {
      expect(out, `TOC lists #${anchorId} with no matching section`).toContain(`id="${anchorId}"`)
    }
  })
})
