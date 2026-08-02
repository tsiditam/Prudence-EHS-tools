// @vitest-environment jsdom
/**
 * Reading a .docx in the browser.
 *
 * AtmosFlow's own deliverables are .docx, so "here is my report, what do
 * you make of it?" is the most natural question the assistant can be
 * asked — and the extraction has to preserve enough structure for the
 * answer to be about the right numbers. A run-on string where an analyte
 * and its value have merged is worse than no text at all.
 */
import { describe, it, expect } from 'vitest'
import { documentXmlToText } from '../../src/utils/docxText'

const wrap = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
   <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
     <w:body>${inner}</w:body>
   </w:document>`

const para = (...runs: string[]) =>
  `<w:p><w:r>${runs.map((r) => `<w:t>${r}</w:t>`).join('')}</w:r></w:p>`

describe('documentXmlToText', () => {
  it('returns paragraphs in document order, one per line', () => {
    const xml = wrap(para('Indoor Environmental Monitoring Report') + para('Prepared for Northgate'))
    expect(documentXmlToText(xml)).toBe('Indoor Environmental Monitoring Report\nPrepared for Northgate')
  })

  it('joins the runs inside a paragraph, which Word splits arbitrarily', () => {
    // Word breaks a sentence into runs at every formatting change, so
    // "CO2 was elevated" can arrive as three separate <w:t> elements.
    const xml = wrap('<w:p><w:r><w:t>Carbon dioxide </w:t></w:r><w:r><w:t>was </w:t></w:r><w:r><w:t>elevated.</w:t></w:r></w:p>')
    expect(documentXmlToText(xml)).toBe('Carbon dioxide was elevated.')
  })

  it('keeps a tab between cells so a row stays parseable', () => {
    const xml = wrap('<w:p><w:r><w:t>CO2</w:t><w:tab/><w:t>1,240 ppm</w:t></w:r></w:p>')
    // Without the tab this reads "CO21,240 ppm" — the parameter and its
    // value fused into one token.
    expect(documentXmlToText(xml)).toBe('CO2\t1,240 ppm')
  })

  it('treats an explicit break as a line break', () => {
    const xml = wrap('<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>')
    expect(documentXmlToText(xml)).toBe('Line one\nLine two')
  })

  it('drops empty paragraphs rather than emitting blank lines', () => {
    const xml = wrap(para('Findings') + '<w:p/>' + '<w:p><w:r><w:t>   </w:t></w:r></w:p>' + para('Recommendations'))
    expect(documentXmlToText(xml)).toBe('Findings\nRecommendations')
  })

  it('reads text nested inside table cells', () => {
    const xml = wrap(
      `<w:tbl><w:tr><w:tc>${para('Parameter')}</w:tc><w:tc>${para('Result')}</w:tc></w:tr></w:tbl>`,
    )
    expect(documentXmlToText(xml)).toBe('Parameter\nResult')
  })

  it('returns empty for junk rather than throwing', () => {
    expect(documentXmlToText('')).toBe('')
    expect(documentXmlToText(null as any)).toBe('')
    expect(documentXmlToText('not xml at all <<<')).toBe('')
  })
})
