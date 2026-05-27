/**
 * Phase 2 — canonical additive report sections (DOCX layer).
 *
 * Covers: the hardcoded Benchmarks table data + benchmark-type
 * taxonomy, banned-language cleanliness of all new static prose
 * (Disclaimer, Conclusions closing, Certification, Benchmarks
 * footnote/intro), the section builders, and an end-to-end render
 * asserting the new headings + TOC entries reach the packed DOCX.
 */

import { describe, it, expect } from 'vitest'
import { Document, Packer, SectionType } from 'docx'
import JSZip from 'jszip'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { scanProseForBannedLanguage } from '../../src/engine/report/cih-validation'
import {
  buildClientDocx, buildBenchmarksSection, buildDocumentControl,
  buildConclusions, buildDisclaimer, buildCertification, buildDataGapsSection,
  buildInstrumentAccuracyNote,
} from '../../src/components/docx/sections-v21client.js'
import { DOCX_STYLES } from '../../src/components/docx/styles.js'
import {
  BENCHMARK_ROWS, BENCHMARK_TYPE_LABELS, BENCHMARK_INTRO, BENCHMARK_FOOTNOTE,
  DISCLAIMER_PARAGRAPHS, CONCLUSIONS_CLOSING, certificationStatement,
  DATA_GAP_MESSAGES, DATA_GAPS_INTRO, INSTRUMENT_ACCURACY_NOTE,
} from '../../src/components/docx/canonical-content.js'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test Site', siteAddress: '123 Test St',
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

function buildReport() {
  const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  return result
}

describe('Phase 2 — benchmark table data', () => {
  it('is 14 rows × 5 columns', () => {
    expect(BENCHMARK_ROWS.length).toBe(14)
    for (const row of BENCHMARK_ROWS) expect(row.length).toBe(5)
  })
  it('every benchmark-type label is in the docs/report-spec §7 taxonomy', () => {
    for (const row of BENCHMARK_ROWS) expect(BENCHMARK_TYPE_LABELS).toContain(row[3])
  })
  it('classifies NIOSH RELs as recommended (not occupational) exposure limits', () => {
    const niosh = BENCHMARK_ROWS.filter(r => /NIOSH/i.test(r[2]))
    expect(niosh.length).toBeGreaterThan(0)
    for (const r of niosh) expect(r[3]).toBe('Recommended exposure limit')
  })
})

describe('Phase 2 — new static prose passes the banned-language linter', () => {
  const statics: ReadonlyArray<[string, string]> = [
    ['benchmark intro', BENCHMARK_INTRO],
    ['benchmark footnote', BENCHMARK_FOOTNOTE],
    ['conclusions closing', CONCLUSIONS_CLOSING],
    ...DISCLAIMER_PARAGRAPHS.map((p, i) => [`disclaimer #${i}`, p] as [string, string]),
    ['data-gaps intro', DATA_GAPS_INTRO],
    ...Object.entries(DATA_GAP_MESSAGES).map(([k, v]) => [`data gap: ${k}`, v] as [string, string]),
    ['instrument-accuracy note', INSTRUMENT_ACCURACY_NOTE],
  ]
  for (const [label, text] of statics) {
    it(`${label} is clean`, () => {
      expect(scanProseForBannedLanguage(text).map(h => h.term)).toEqual([])
    })
  }

  for (const reviewStatus of ['draft_pending_professional_review', 'reviewed_by_qualified_professional', 'final_issued_to_client']) {
    it(`certification (${reviewStatus}) is clean`, () => {
      const paras = certificationStatement({
        assessor: 'J. Smith', assessorCreds: 'CIH',
        reviewer: 'A. Reviewer', reviewerCreds: 'CIH, PE',
        reviewStatus,
      })
      for (const para of paras) {
        expect(scanProseForBannedLanguage(para).map(h => h.term)).toEqual([])
      }
    })
  }
})

describe('Phase 2 — section builders', () => {
  it('each builder returns a non-empty node array', () => {
    const r = buildReport().report
    expect(buildDocumentControl(r).length).toBeGreaterThan(0)
    expect(buildBenchmarksSection().length).toBeGreaterThan(0)
    expect(buildConclusions(r).length).toBeGreaterThan(0)
    expect(buildDisclaimer().length).toBeGreaterThan(0)
    expect(buildCertification(r).length).toBeGreaterThan(0)
  })
  it('data-gaps builder is a no-op for an empty list and renders for a populated one', () => {
    expect(buildDataGapsSection([])).toEqual([])
    expect(buildDataGapsSection(undefined as any)).toEqual([])
    expect(buildDataGapsSection([DATA_GAP_MESSAGES.outdoor]).length).toBeGreaterThan(0)
  })
  it('instrument-accuracy builder is a no-op without an instrument and renders with one', () => {
    expect(buildInstrumentAccuracyNote(null as any)).toEqual([])
    expect(buildInstrumentAccuracyNote({} as any)).toEqual([])
    const out = buildInstrumentAccuracyNote({
      iaqName: 'TSI Q-Trak 7575', iaqAccuracy: 'CO₂ ±3%', calStatus: 'Calibrated within manufacturer spec',
      calibrationLine: 'TSI Q-Trak 7575 calibration is current as of the report date.',
    } as any)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('Phase 2 — rendered DOCX', () => {
  it('contains the new section headings, TOC titles, and benchmark content', async () => {
    const result = buildReport()
    const { cover, main } = buildClientDocx(result, {
      dataGaps: [DATA_GAP_MESSAGES.outdoor, DATA_GAP_MESSAGES.lab],
      instrumentAccuracy: {
        iaqName: 'TSI Q-Trak 7575', iaqAccuracy: 'CO2 plus-minus 3 percent',
        calStatus: 'Calibrated within manufacturer spec',
        calibrationLine: 'TSI Q-Trak 7575 calibration is current as of the report date.',
      },
    })
    const doc = new Document({
      creator: 'AtmosFlow', title: 'Test', styles: DOCX_STYLES,
      sections: [cover, { properties: { type: SectionType.NEXT_PAGE }, children: main }],
    })
    const buf = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')
    for (const t of ['Document Control', 'Standards, Guidelines, and Benchmark Types', 'Instrument Accuracy and Calibration', 'Conclusions', 'Data Gaps and Limitations on Interpretation', 'Disclaimer', 'Certification']) {
      expect(xml).toContain(t)
    }
    expect(xml).toContain('CO2 plus-minus 3 percent')
    expect(xml).toContain('ASHRAE 62.1-2025')
    expect(xml).toContain('Occupational exposure limit')
    expect(xml).toContain('Recommended exposure limit')
  })
})
