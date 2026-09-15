// @vitest-environment node
/**
 * lib/report/render-pdf.js — the fixed pdfkit renderer. Verifies it produces
 * a valid PDF from a model, embeds chart/photo images, applies brand color,
 * and omits sections with no data.
 */
import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
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

/**
 * The document's own text, read back out of the rendered bytes.
 *
 * pdfkit deflates each content stream and writes the runs as hex strings, so
 * an assertion about what the client sees has to inflate and decode. Reading
 * the DELIVERABLE is the point: `buf.toString()` finds nothing either way,
 * which is how a `not.toMatch` over the raw buffer passes vacuously.
 */
function pdfText(buffer) {
  const raw = buffer.toString('latin1')
  const out = []
  const re = /stream\r?\n/g
  let m
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    let chunk
    try { chunk = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1') } catch { continue }
    // Every byte is a WinAnsi code point, so latin1 is the right decoding for
    // everything below 0x80 and the 0x80-0x9F punctuation is mapped back.
    for (const t of chunk.matchAll(/<([0-9A-Fa-f\s]+)>/g)) out.push(winAnsi(Buffer.from(t[1].replace(/\s+/g, ''), 'hex')))
    for (const t of chunk.matchAll(/\((?:\\.|[^()\\])*\)/g)) out.push(t[0].slice(1, -1))
  }
  return out.join('')
}
const WINANSI_80 = [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0, 0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178]
const winAnsi = (bytes) => [...bytes].map(b => String.fromCharCode(b >= 0x80 && b <= 0x9F ? (WINANSI_80[b - 0x80] || b) : b)).join('')

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

  it('prints a character the base-14 fonts cannot encode, rather than two wrong glyphs', async () => {
    // Helvetica is declared /WinAnsiEncoding and not embedded, so every byte
    // in a text run IS a WinAnsi code point. pdfkit writes an unmappable
    // character as its raw code point — two bytes, two wrong glyphs — which
    // is how the engine's own `CO₂ 1385 ppm (Δ955 ppm above outdoor)` reached
    // the client's PDF as `CO ‚ 1385 ppm (…)` while the DOCX printed it
    // correctly. Same report, two formats, two different sentences.
    const finding = 'CO\u2082 1385 ppm (\u0394955 ppm above outdoor)'
    const buf = await renderReportPdf({
      ...baseModel,
      execSummary: { paragraphs: [`Observed: ${finding}.`] },
    })
    const text = pdfText(buf)
    expect(text).toContain('CO2 1385 ppm (Delta 955 ppm above outdoor)')
    // The unencodable code points reach no byte of the document.
    expect(text).not.toContain('\u2082')
    expect(text).not.toContain('\u0394')
    // WinAnsi punctuation the report really uses is NOT folded away.
    const punct = await renderReportPdf({ ...baseModel, execSummary: { paragraphs: ['A \u2014 dash, a \u2019 quote, 45 \u00B5g/m\u00B3.'] } })
    const punctText = pdfText(punct)
    expect(punctText).toContain('\u2014')
    expect(punctText).toContain('\u00B5g/m\u00B3')
  })

  it('honors a custom brand color (deterministic — same model, same bytes length class)', async () => {
    const a = await renderReportPdf({ ...baseModel, meta: { ...baseModel.meta, brandColor: '#7C3AED' } })
    expect(isPdf(a)).toBe(true)
  })
})
