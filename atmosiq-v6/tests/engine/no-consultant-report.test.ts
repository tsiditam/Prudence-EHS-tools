/**
 * The consultant report is gone and stays gone.
 *
 * Removed in 2026-08 at the product owner's direction — it had accumulated
 * too many defects to keep as a deliverable. It was one of TWO parallel
 * client deliverables; the AtmosFlow report (`assembleRenderModel` →
 * sections-atmosflow) is the survivor and was already the pipeline behind
 * both PDF paths, so the product still ships a client report.
 *
 * What this asserts, and why each matters:
 *
 *   • The DOCX generators and their section builders are gone, so nothing
 *     can quietly re-import a half-removed renderer.
 *   • Share and peer review attach the AtmosFlow DOCX. Both used to call
 *     `getConsultantDocxBlob`; a silent revert there would mail a client
 *     a document that no longer exists in the picker.
 *   • Editorial suppressions are gone end to end. Only the consultant
 *     renderer honoured them, so leaving the panel would have shipped an
 *     approval flow that changed no output — the exact "a layer deciding
 *     something independently" defect this codebase fights.
 *
 * DELIBERATELY NOT asserted: `renderClientReport` and `src/engine/report/`
 * still exist and are still exercised by ~20 suites. PrintReport.jsx renders
 * the HTML print view from them and the investigation agent shares several
 * of their modules. Only the DOCX deliverable went. See docs/CRITERIA.md.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as DocxReport from '../../src/components/DocxReport.js'

const root = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('the consultant DOCX deliverable is gone', () => {
  it('exports no consultant generator', () => {
    for (const name of [
      'generateConsultantOnly',
      'getConsultantDocxBlob',
      'getConsultantReportResult',
      'augmentWithCalibrationAppendices',
      'generateDocx',
    ]) {
      expect(name in DocxReport, `${name} is exported again`).toBe(false)
    }
  })

  it('still exports the surviving deliverables', () => {
    // Guards the guard: if these vanished too, the assertions above would
    // pass for the wrong reason.
    for (const name of ['generateAtmosFlowOnly', 'getAtmosFlowDocxBlob', 'generateTechnicalOnly']) {
      expect(name in DocxReport, `${name} disappeared`).toBe(true)
    }
  })

  it('the consultant-only section builders are deleted', () => {
    for (const f of [
      'src/components/docx/sections-v21client.js',
      'src/components/docx/sections-supplemental.js',
      'src/components/docx/sections-resurvey.js',
      'src/components/docx/applied-references.js',
      'src/components/docx/sections-methodology-currency.js',
      'src/components/docx/calibration-appendix.js',
      'src/components/docx/sections-lab-results.js',
      'src/components/docx/sections-sensor.js',
      'src/components/docx/sections-conceptual-model.js',
      'src/components/docx/sections-cih-reasoning.js',
      'src/components/docx/sections-traceability.js',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} is back`).toBe(false)
    }
  })

  it('DocxReport imports none of them', () => {
    const src = read('src/components/DocxReport.js')
    for (const m of [
      'sections-v21client', 'calibration-appendix', 'sections-lab-results',
      'sections-sensor', 'sections-conceptual-model', 'sections-cih-reasoning',
      'sections-traceability',
    ]) {
      expect(src, `DocxReport still imports ${m}`).not.toMatch(new RegExp(`from '\\./docx/${m}'`))
    }
  })
})

describe('share and peer review attach the surviving report', () => {
  it('MobileApp no longer builds a consultant blob', () => {
    const src = read('src/components/MobileApp.jsx')
    expect(src).not.toContain('getConsultantDocxBlob')
    expect(src).not.toContain('generateConsultantOnly')
    // Both call sites — share and peer review — now build the AtmosFlow DOCX.
    const hits = src.split('getAtmosFlowDocxBlob(reportData)').length - 1
    expect(hits, 'expected share + peer review to build the AtmosFlow DOCX').toBe(2)
  })

  it('the report-type picker is gone, since only one report remains', () => {
    const src = read('src/components/MobileApp.jsx')
    expect(src).not.toContain('docxPicker')
    expect(src).not.toContain('Report Type Picker')
  })
})

describe('editorial suppressions are gone end to end', () => {
  it('the feature files are deleted', () => {
    for (const f of [
      'src/components/EditorialReviewPanel.jsx',
      'src/utils/editorialSuppressions.js',
      'src/utils/editorialReviewDigest.js',
      'api/report-editorial-review.js',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} is back`).toBe(false)
    }
  })

  it('nothing reads or persists a suppression any more', () => {
    // The persistence layer mapped the DB column both ways. Left in place it
    // would keep round-tripping a value no renderer consumes.
    for (const f of ['src/utils/supabaseStorage.js', 'src/components/MobileApp.jsx']) {
      expect(read(f), `${f} still handles editorial suppressions`)
        .not.toMatch(/editorialSuppressions|editorial_suppressions/)
    }
  })
})
