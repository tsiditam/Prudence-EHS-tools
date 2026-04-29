/**
 * v2.4 acceptance fixture renderer.
 *
 * Produces two .docx files and extracts the text content of each
 * to a side-by-side .txt file so the acceptance runner can do
 * needle-based contains/excludes checks.
 *
 *   /tmp/acceptance-report.docx                — multi-zone Hizinburg-style
 *                                                 data-center fixture with
 *                                                 HVAC findings, an empty
 *                                                 zone, photos, and full
 *                                                 recipient data
 *   /tmp/acceptance-report.docx.txt
 *   /tmp/acceptance-report-no-building.docx    — fixture WITHOUT building-
 *                                                 scoped findings (zone-only)
 *   /tmp/acceptance-report-no-building.docx.txt
 *
 * Gated on VITEST_RENDER_FIXTURES=1 so it doesn't slow the regular
 * test suite. Invoked by `npm run render:acceptance`.
 */

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Document, Packer, SectionType } from 'docx'
import JSZip from 'jszip'

import { renderClientReport } from '../src/engine/report/client'
import { legacyToAssessmentScore } from '../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../src/engines/scoring'
import { buildClientDocx } from '../src/components/docx/sections-v21client.js'
import { DOCX_STYLES } from '../src/components/docx/styles.js'
import type { AssessmentMeta } from '../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Hizinburg Data Center — Building 2',
  siteAddress: '8100 Gateway Blvd, Newark, NJ 07102',
  assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'Tsidi Tamakloe', credentials: ['CIH', 'CSP'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC', contact: { email: 'support@prudenceehs.com', phone: '301-541-8362' } },
  projectNumber: 'PSEC-2026-0042',
  transmittalRecipient: {
    fullName: 'Jordan Reyes',
    title: 'Director of Facilities',
    organization: 'Hizinburg Data Center Operations',
    addressLine1: '8100 Gateway Blvd',
    addressLine2: 'Building 2, Suite 200',
    city: 'Newark',
    state: 'NJ',
    zip: '07102',
  },
  instrumentsUsed: [
    { model: 'TSI Q-Trak 7575', serial: 'QT7575-000123', lastCalibration: '2026-01-15', calibrationStatus: 'Calibrated within manufacturer spec' },
    { model: 'TSI DustTrak DRX 8534', lastCalibration: '2026-02-01', calibrationStatus: 'Calibrated' },
  ],
}

const PRESURVEY = {
  ps_assessor: 'Tsidi Tamakloe',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT7575-000123',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
}

async function renderToDocx(score: any, opts: { includeAssessmentIndexAppendix?: boolean } = {}) {
  const result = renderClientReport(score, opts)
  const built = buildClientDocx(result)
  const doc = new Document({
    creator: 'AtmosFlow',
    title: 'Acceptance Fixture',
    description: 'v2.4 acceptance fixture',
    styles: DOCX_STYLES,
    sections: [
      built.cover,
      {
        properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: built.main,
      },
    ],
  })
  return await Packer.toBuffer(doc)
}

async function docxBufferToText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Could not find word/document.xml in docx buffer')
  const xml = await docFile.async('string')
  const withParagraphs = xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/?>/g, '\t')
    .replace(/<w:br\/?>/g, '\n')
  const stripped = withParagraphs.replace(/<[^>]+>/g, '')
  return stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ── Canonical fixture ──
// 3 zones: Data Hall A (data_hall, with elevated CO2/temp/PM, sick-building
// pattern via complaints + symptom-resolves-away), NOC Office (empty —
// pass-level on every parameter), Battery Room (medium temp/RH).
// Building HVAC findings: maintenance overdue + heavily loaded filter +
// drain pan biological growth. Symptom cluster + symptoms-resolve-away
// in Data Hall A to trigger the sick-building synthesis template.

function buildCanonicalScore() {
  const zones = [
    {
      zn: 'Data Hall A — Primary',
      su: 'office',
      zone_subtype: 'data_hall',
      co2: '1180', co2o: '420',
      tf: '74', rh: '52',
      pm: '12', tv: '600',
      cx: 'Yes — complaints reported',
      ac: '6-10',
      cc: 'Yes — this zone',
      sr: 'Yes — clear pattern',
      sy: ['Headache', 'Fatigue', 'Eye irritation'],
    },
    {
      zn: 'NOC Office',
      su: 'office',
      co2: '550', co2o: '420', tf: '72', rh: '45', pm: '5',
    },
    {
      zn: 'Battery Room',
      su: 'office',
      co2: '900', co2o: '420', tf: '76', rh: '55', pm: '20',
    },
  ]
  const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded', dp: 'Bio growth observed' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  return legacyToAssessmentScore(
    lzs as any,
    cs as any,
    zones.map(z => ({ ...z, ...bldg })) as any,
    { meta: META, presurvey: PRESURVEY },
  )
}

function buildNoBuildingScore() {
  const zones = [
    { zn: 'Data Hall A', su: 'office', co2: '1300', co2o: '420', tf: '74', rh: '52', pm: '12' },
  ]
  const bldg = {}
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  return legacyToAssessmentScore(
    lzs as any,
    cs as any,
    zones.map(z => ({ ...z, ...bldg })) as any,
    { meta: META, presurvey: PRESURVEY },
  )
}

describe.runIf(process.env.VITEST_RENDER_FIXTURES === '1')('render v2.4 acceptance fixtures', () => {
  it('canonical fixture (3 zones, HVAC findings, sick-building pattern)', async () => {
    mkdirSync('/tmp', { recursive: true })
    const buf = await renderToDocx(buildCanonicalScore())
    writeFileSync('/tmp/acceptance-report.docx', buf)
    writeFileSync('/tmp/acceptance-report.docx.txt', await docxBufferToText(buf as Buffer))
    expect(buf.byteLength).toBeGreaterThan(2000)
  })

  it('no-building fixture (zone findings only, NO HVAC)', async () => {
    mkdirSync('/tmp', { recursive: true })
    const buf = await renderToDocx(buildNoBuildingScore())
    writeFileSync('/tmp/acceptance-report-no-building.docx', buf)
    writeFileSync('/tmp/acceptance-report-no-building.docx.txt', await docxBufferToText(buf as Buffer))
    expect(buf.byteLength).toBeGreaterThan(2000)
  })
})
