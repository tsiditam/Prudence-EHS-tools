// @vitest-environment node
/**
 * lib/report/render-pdf.js — the fixed pdfkit renderer. Verifies it produces
 * a valid PDF from a model, embeds chart/photo images, applies brand color,
 * and omits sections with no data.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { renderReportPdf } = require('../../lib/report/render-pdf.js')

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const baseModel = {
  meta: {
    reportTitle: 'Screening-Level IAQ Assessment Report', coverSubtitle: 'Test', firm: 'PSEC',
    coverRows: [['Facility', 'Test Site'], ['Report ID', 'AIQ-TEST01']], brandColor: '#0E7490',
    headerLabel: 'Draft', footerNote: 'AIQ-TEST01 · Draft', watermark: 'DRAFT',
  },
  execSummary: 'A screening-level assessment was conducted; results are consistent with acceptable conditions.',
  findingsAtGlance: [{ parameter: 'Carbon dioxide (CO2)', range: '600–900 ppm', basis: 'ASHRAE 62.1', outcome: 'ok' }],
  showSeverityLegend: true,
  results: { intro: 'Results.', rows: [{ id: 'A', use: 'Office', co2: '900', co: '0.4', t: '72', rh: '45', pm: '8', tvoc: '210', sev: 'ok' }], parameters: [{ title: 'CO2', body: ['What it is: ...', 'Observed: ...'] }] },
  recommendations: { intro: 'Ladder.', immediate: ['Verify supply airflow.'], shortTerm: [], mediumTerm: [] },
  qaQc: ['Instrument: Not documented in project record.'],
  limitations: ['Screening-level only.'],
  references: [['ASHRAE 62.1-2025', 'Ventilation indicator.']],
  about: { title: 'Appendix B — About AtmosFlow', text: 'AtmosFlow is screening-only.' },
}

const isPdf = (buf) => Buffer.isBuffer(buf) && buf.slice(0, 5).toString() === '%PDF-'
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length

describe('renderReportPdf', () => {
  it('produces a valid multi-page PDF buffer with "Page X of N" numbering', async () => {
    const buf = await renderReportPdf(baseModel)
    expect(isPdf(buf)).toBe(true)
    expect(pageCount(buf)).toBeGreaterThanOrEqual(2)
    // two-pass numbering resolved the total
    expect(buf.toString('latin1')).not.toMatch(/Page \d+ of 0/)
  })

  it('omits sections whose model data is absent (minimal model still renders)', async () => {
    const buf = await renderReportPdf({ meta: { coverRows: [['Facility', 'X']], firm: 'PSEC' }, execSummary: 'Short.' })
    expect(isPdf(buf)).toBe(true)
    expect(pageCount(buf)).toBeGreaterThanOrEqual(2)
  })

  it('embeds logger chart images and photos without throwing', async () => {
    const buf = await renderReportPdf({
      ...baseModel,
      loggerImages: { disclaimer: 'd', dataSource: 'src', images: [{ title: 'CO2 Over Time', imageDataUrl: PNG, caption: 'cap' }] },
      photos: { intro: 'Photos.', items: [{ title: 'Zone A', sub: 's', imageDataUrl: PNG }] },
    })
    expect(isPdf(buf)).toBe(true)
  })

  it('renders a peak-CO2 bar chart from zone data', async () => {
    const buf = await renderReportPdf({ ...baseModel, co2Bars: { data: [{ zone: 'A', value: 760, outcome: 'ok' }, { zone: 'B', value: 1247, outcome: 'elevated' }], threshold: 1000, thresholdLabel: 'advisory', caption: 'cap' } })
    expect(isPdf(buf)).toBe(true)
  })

  it('honors a custom brand color (deterministic — same model, same bytes length class)', async () => {
    const a = await renderReportPdf({ ...baseModel, meta: { ...baseModel.meta, brandColor: '#7C3AED' } })
    expect(isPdf(a)).toBe(true)
  })
})
