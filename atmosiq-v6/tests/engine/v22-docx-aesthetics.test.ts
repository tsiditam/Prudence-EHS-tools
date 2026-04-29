/**
 * v2.2 visual upgrade — DOCX packing smoke.
 *
 * The docx library does deferred validation: malformed Table /
 * TableCell / TableRow shapes only surface at Packer.toBlob/toBuffer
 * time, not when the objects are constructed. The existing tests
 * exercise the engine + HTML pipeline but never exercise the docx
 * Packer. This test forces the full path: build a ClientReport, run
 * it through buildClientDocx, wrap in a Document, pack to a Buffer.
 *
 * If any of the new Table-based builders (heading2 banner,
 * exec-summary metadata table, exec narrative blocks, opinion-card,
 * signature columns) produce malformed docx, this test fails.
 */

import { describe, it, expect } from 'vitest'
import { Document, Packer, SectionType } from 'docx'
import { buildClientDocx } from '../../src/components/docx/sections-v21client.js'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { DOCX_STYLES } from '../../src/components/docx/styles.js'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Meridian Commerce Tower',
  siteAddress: '450 Commerce Blvd, Suite 300, Hartford, CT 06103',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'Tsidi Tamakloe', credentials: ['CSP'] },
  reviewingProfessional: { fullName: 'Kweku Blankson', credentials: ['CIH'] },
  reviewStatus: 'reviewed_by_qualified_professional',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC', contact: { email: 'support@prudenceehs.com', phone: '301-541-8362' } },
  projectNumber: 'PSEC-2026-0042',
  transmittalRecipient: {
    fullName: 'Roger Navins', title: 'Mr.', organization: 'Sage Realty',
    addressLine1: '777 Third Avenue', city: 'New York', state: 'NY', zip: '10017',
  },
  instrumentsUsed: [{ model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15' }],
}

const PRESURVEY = {
  ps_assessor: 'Tsidi Tamakloe',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
}

function buildDemoReport() {
  const zones = [
    { zn: '3rd Floor Open Office', su: 'office', co2: '1180', co2o: '420', tf: '74', rh: '52', pm: '12' },
    { zn: 'Conference Room B', su: 'conference', co2: '1100', tf: '76', rh: '58' },
  ]
  const bldg = { hm: 'Within 6 months', fc: 'Light dust' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  const score = legacyToAssessmentScore(lzs as any, cs as any, zones.map(z => ({ ...z, ...bldg })) as any, { meta: META, presurvey: PRESURVEY })
  return renderClientReport(score)
}

describe('v2.2 DOCX aesthetics — Packer smoke', () => {
  it('Full client report packs to a non-empty docx buffer', async () => {
    const result = buildDemoReport()
    if (result.kind !== 'report') throw new Error('Expected report (fixture should produce one)')
    const { cover, main } = buildClientDocx(result)
    const doc = new Document({
      creator: 'AtmosFlow',
      title: 'Test',
      styles: DOCX_STYLES,
      sections: [
        cover,
        {
          properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: main,
        },
      ],
    })
    const buf = await Packer.toBuffer(doc)
    // .docx is a zip; should be at least a few kB.
    expect(buf.byteLength).toBeGreaterThan(2000)
  })

  it('Pre-assessment memo also packs cleanly', async () => {
    // Force memo path: empty zone with no measurements triggers refusal-to-issue.
    const zone = { zn: 'Empty', su: 'office' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META })
    const result = renderClientReport(score)
    // Either kind packs cleanly via buildClientDocx
    const { cover, main } = buildClientDocx(result)
    const doc = new Document({
      creator: 'AtmosFlow',
      title: 'Test',
      styles: DOCX_STYLES,
      sections: [
        cover,
        {
          properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: main,
        },
      ],
    })
    const buf = await Packer.toBuffer(doc)
    expect(buf.byteLength).toBeGreaterThan(2000)
  })

  it('Single-signatory letter packs cleanly (no reviewer column)', async () => {
    const meta = { ...META, reviewingProfessional: undefined, reviewStatus: 'draft_pending_professional_review' as const }
    const zones = [{ zn: 'Z1', su: 'office', co2: '900', co2o: '420', tf: '74', rh: '52', pm: '12' }]
    const lz = scoreZone(zones[0], {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, zones as any, { meta, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const { cover, main } = buildClientDocx(result)
    const doc = new Document({
      creator: 'AtmosFlow', title: 'Test', styles: DOCX_STYLES,
      sections: [cover, { properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: main }],
    })
    const buf = await Packer.toBuffer(doc)
    expect(buf.byteLength).toBeGreaterThan(2000)
  })
})
