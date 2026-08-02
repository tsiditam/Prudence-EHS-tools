// @vitest-environment jsdom
/**
 * Reading a .docx that Word/`docx` actually produced.
 *
 * The synthetic-XML tests in docxText.test.ts pin the extraction rules
 * against hand-written markup. This file pins them against a REAL
 * OOXML file built by the same `docx` package the AtmosFlow reports are
 * generated with — so run-splitting, nested tables, and the separate
 * header/footer parts are exercised as the library emits them, not as I
 * imagined them.
 *
 * The document is built here rather than loaded from a fixture so the
 * test runs everywhere. A checked-in .docx would be a tracked binary,
 * and a fixture read from a scratch directory would silently skip in CI
 * — which is close to having no test at all.
 */
import { describe, it, expect } from 'vitest'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, TabStopType,
} from 'docx'
import { readDocxText } from '../../src/utils/docxText'
import {
  buildTextDigest, digestToPrompt, digestSummaryLine, MAX_DOCUMENT_DIGEST_CHARS,
} from '../../src/utils/chatAttachments'

/** A document shaped like an AtmosFlow deliverable. */
async function buildReportDocx(bodyExtra: Paragraph[] = []) {
  const cell = (t: string) => new TableCell({ children: [new Paragraph(t)] })
  const doc = new Document({
    sections: [{
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
            children: [
              new TextRun('Jul 13 – 17, 2026'),
              new TextRun('\t'),
              new TextRun('AtmosFlow'),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph('Confidential · Prepared for Northgate Property Group')],
        }),
      },
      children: [
        new Paragraph('Indoor Environmental Monitoring Report'),
        // Word splits a sentence into runs at every formatting change.
        new Paragraph({
          children: [
            new TextRun('Carbon dioxide '),
            new TextRun({ text: 'averaged 940 ppm', bold: true }),
            new TextRun(' during occupied hours.'),
          ],
        }),
        new Table({
          rows: [
            new TableRow({ children: [cell('Parameter'), cell('Mean'), cell('Max')] }),
            new TableRow({ children: [cell('CO2'), cell('940 ppm'), cell('1,620 ppm')] }),
          ],
        }),
        ...bodyExtra,
        new Paragraph('Limitations'),
        new Paragraph('This report is provided for screening and documentation purposes.'),
      ],
    }],
  })
  return new Blob([new Uint8Array(await Packer.toBuffer(doc))])
}

describe('reading a real OOXML document', () => {
  it('recovers prose, split runs, and table cells', async () => {
    const { text } = await readDocxText(await buildReportDocx())

    expect(text).toContain('Indoor Environmental Monitoring Report')
    // The three runs rejoin into one readable sentence.
    expect(text).toContain('Carbon dioxide averaged 940 ppm during occupied hours.')
    // Table cells survive, each on its own line rather than fused.
    expect(text).toMatch(/Parameter/)
    expect(text).toMatch(/1,620 ppm/)
    expect(text).toContain('Limitations')
  })

  it('recovers who the report is for, which lives only in the footer', async () => {
    const { text } = await readDocxText(await buildReportDocx())
    // Reading word/document.xml alone yields a report that never names
    // its client — the footer is a separate part of the package.
    expect(text).toContain('Northgate Property Group')
    expect(text).toMatch(/\[Running footer\]/)
    expect(text).toMatch(/\[Running header\]/)
    expect(text).toContain('Jul 13 – 17, 2026')
  })

  it('rejects a zip that is not a Word document', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
    const blob = new Blob([new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' }))])
    await expect(readDocxText(blob)).rejects.toThrow(/not a Word/i)
  })

  it('carries a long report whole, and marks it when it cannot', async () => {
    // ~9,000 characters of body — the size range a real monitoring
    // report lands in, and well past the 4,000-char structured budget.
    const filler = Array.from({ length: 150 }, (_, i) =>
      new Paragraph(`Finding ${i}: readings were logged at five-minute intervals throughout.`))
    const { text, truncated } = await readDocxText(await buildReportDocx(filler))

    expect(text.length).toBeGreaterThan(8000)
    expect(truncated).toBe(false)

    const digest = buildTextDigest(text, 'report.docx', { kind: 'docx' })
    const prompt = digestToPrompt(digest)
    expect(digest.truncated).toBe(false)
    // The TAIL survives — the structured budget would have cut this off
    // long before the limitations section.
    expect(prompt).toContain('Limitations')
    expect(prompt.length).toBeLessThanOrEqual(MAX_DOCUMENT_DIGEST_CHARS)
    expect(digestSummaryLine(digest)).toMatch(/words read/)
  })

  it('marks a document that genuinely overruns the budget', async () => {
    const filler = Array.from({ length: 900 }, (_, i) =>
      new Paragraph(`Observation ${i}: supplementary detail recorded during the monitoring period.`))
    const { text } = await readDocxText(await buildReportDocx(filler))
    const digest = buildTextDigest(text, 'big.docx', { kind: 'docx' })

    expect(digest.truncated).toBe(true)
    // Truncation is stated rather than passed off as the whole document.
    expect(digestToPrompt(digest)).toContain('truncated')
  })
})
