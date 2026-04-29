/**
 * v2.5 acceptance fixture renderer.
 *
 * Produces two .docx files and extracts the text content of each
 * to a side-by-side .txt file so the acceptance runner can do
 * needle-based contains/excludes checks.
 *
 *   /tmp/acceptance-report.docx                — canonical Meridian
 *                                                 Commerce Tower fixture
 *                                                 with 3 zones, HVAC
 *                                                 findings, full recipient,
 *                                                 photos, and a known +
 *                                                 unknown-zero-reading
 *                                                 instrument set
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
import { Document, Packer } from 'docx'
import JSZip from 'jszip'

import { renderClientReport } from '../src/engine/report/client'
import { legacyToAssessmentScore } from '../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../src/engines/scoring'
import { buildClientDocx } from '../src/components/docx/sections-v21client.js'
import { DOCX_STYLES } from '../src/components/docx/styles.js'
import { BODY_SECTION_PROPERTIES } from '../src/components/docx/page-setup.js'
import type { AssessmentMeta } from '../src/engine/types/domain'
import type { AssessmentPhoto } from '../src/engine/report/appendix-c'

// v2.5 §1 — canonical Meridian Commerce Tower fixture with full
// transmittalRecipient population so the Executive Summary
// metadata table renders Client Name / Site Contact / Requested By
// from the recipient (no em-dash placeholders).
const META: AssessmentMeta = {
  siteName: 'Meridian Commerce Tower',
  siteAddress: '450 Commerce Blvd, Suite 1100, Hartford, CT 06103',
  assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'Tsidi Tamakloe', credentials: ['CIH', 'CSP'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC', contact: { email: 'support@prudenceehs.com', phone: '301-541-8362' } },
  projectNumber: 'PSEC-2026-0042',
  transmittalRecipient: {
    fullName: 'Sarah Lin',
    title: 'Director of Property Operations',
    organization: 'Meridian Properties LLC',
    addressLine1: '450 Commerce Blvd',
    addressLine2: 'Suite 1100',
    city: 'Hartford',
    state: 'CT',
    zip: '06103',
  },
  // v2.5 §7 — instrument set includes one known instrument used
  // for the survey AND one unknown instrument (RAE MiniRAE 3000)
  // with zero readings tied to it. The renderer must filter the
  // zero-reading instrument from Sampling Methodology and
  // Appendix B; if it does not, acceptance fails.
  instrumentsUsed: [
    { model: 'TSI Q-Trak 7575', serial: 'QT7575-000123', lastCalibration: '2026-01-15', calibrationStatus: 'Calibrated within manufacturer spec' },
    { model: 'TSI DustTrak DRX 8534', lastCalibration: '2026-02-01', calibrationStatus: 'Calibrated' },
    { model: 'RAE MiniRAE 3000', lastCalibration: '', calibrationStatus: '' },
  ],
}

const PRESURVEY = {
  ps_assessor: 'Tsidi Tamakloe',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT7575-000123',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
}

// v2.5 §7 — readings tied to each instrument. The Q-Trak and
// DustTrak collected dozens of readings each across the three
// zones; the MiniRAE is in the equipment list but no readings
// were recorded on it. The renderer filters the zero-reading
// instrument out of Sampling Methodology and Appendix B.
const READINGS_BY_INSTRUMENT: Readonly<Record<string, number>> = {
  'TSI Q-Trak 7575': 12,
  'TSI DustTrak DRX 8534': 9,
  'RAE MiniRAE 3000': 0,
}

// v2.5 §5 — photo set. One building-level photo, one in 3rd Floor
// Open Office, one in Conference Room B. Captions are plausible
// CIH field observations. relativePath is a placeholder filename
// for the field photo set delivered separately.
const PHOTOS: ReadonlyArray<AssessmentPhoto> = [
  {
    caption: 'Visible water staining at southwest corner of mechanical room ceiling',
    zoneName: null,
    relativePath: 'photo-001.jpg',
    capturedAt: '2026-04-29T10:14:00',
  },
  {
    caption: 'Loaded supply air filter at AHU-3 serving 3rd Floor Open Office',
    zoneName: '3rd Floor Open Office',
    relativePath: 'photo-002.jpg',
    capturedAt: '2026-04-29T11:02:00',
  },
  {
    caption: 'Apparent fungal growth on wall behind cubicle 3F-12',
    zoneName: 'Conference Room B',
    relativePath: 'photo-003.jpg',
    capturedAt: '2026-04-29T11:48:00',
  },
]

async function renderToDocx(score: any, opts: { includeAssessmentIndexAppendix?: boolean } = {}) {
  const result = renderClientReport(score, opts)
  const built = buildClientDocx(result)
  const doc = new Document({
    creator: 'AtmosFlow',
    title: 'Acceptance Fixture',
    description: 'v2.5 acceptance fixture',
    styles: DOCX_STYLES,
    sections: [
      built.cover,
      {
        // v2.5.1 — explicit Letter portrait so content fills the
        // 6.5-inch printable area rather than rendering at A4 width.
        properties: BODY_SECTION_PROPERTIES,
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
// 3 zones: 3rd Floor Open Office (with elevated CO2/PM/TVOC,
// sick-building pattern via complaints + symptom-resolves-away),
// Conference Room B (medium CO2 + symptom cluster — drives the
// cross-zone consolidation §6 test), 5th Floor Reception (empty —
// pass-level on every parameter).
// Building HVAC findings: maintenance overdue + heavily loaded
// filter + drain pan biological growth.

function buildCanonicalScore() {
  const zones = [
    {
      zn: '3rd Floor Open Office',
      su: 'office',
      co2: '1180', co2o: '420',
      tf: '74', rh: '52',
      pm: '12', tv: '600',
      co: '2', hc: '0.05',
      cx: 'Yes — complaints reported',
      ac: '6-10',
      cc: 'Yes — this zone',
      sr: 'Yes — clear pattern',
      sy: ['Headache', 'Fatigue', 'Eye irritation'],
    },
    {
      zn: 'Conference Room B',
      su: 'conference',
      co2: '1100', co2o: '420',
      tf: '76', rh: '58',
      pm: '8',
      co: '1', hc: '0.04',
      cx: 'Yes — complaints reported',
      cc: 'Yes — this zone',
      sy: ['Headache'],
    },
    {
      // Empty zone — every parameter at pass-level so the
      // empty-zone single-sentence renders here. CO/HCHO are
      // intentionally omitted so this zone has zero significant
      // findings.
      zn: '5th Floor Reception',
      su: 'office',
      co2: '550', co2o: '420', tf: '72', rh: '45', pm: '5',
    },
  ]
  const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded', dp: 'Bio growth observed' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  const base = legacyToAssessmentScore(
    lzs as any,
    cs as any,
    zones.map(z => ({ ...z, ...bldg })) as any,
    { meta: META, presurvey: PRESURVEY },
  )
  // v2.5 §5 + §7 — attach photos and readings-by-instrument to the
  // AssessmentScore so the renderer can build Appendix C and filter
  // zero-reading instruments without round-tripping through the
  // bridge.
  return {
    ...base,
    photos: PHOTOS,
    readingsByInstrument: READINGS_BY_INSTRUMENT,
  }
}

function buildNoBuildingScore() {
  const zones = [
    { zn: '3rd Floor Open Office', su: 'office', co2: '1300', co2o: '420', tf: '74', rh: '52', pm: '12' },
  ]
  const bldg = {}
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  const base = legacyToAssessmentScore(
    lzs as any,
    cs as any,
    zones.map(z => ({ ...z, ...bldg })) as any,
    { meta: META, presurvey: PRESURVEY },
  )
  return {
    ...base,
    readingsByInstrument: READINGS_BY_INSTRUMENT,
  }
}

describe.runIf(process.env.VITEST_RENDER_FIXTURES === '1')('render v2.5 acceptance fixtures', () => {
  it('canonical Meridian fixture (3 zones, HVAC findings, sick-building pattern, photos, zero-reading instrument)', async () => {
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
