/**
 * markdownToDocx — markdown → docx converter for the AI narrative.
 *
 * Pins:
 *   • Headings, paragraphs, and bullets map to docx Paragraph nodes; a
 *     GFM table maps to a docx Table node.
 *   • The rendered document.xml actually carries bold runs and a table
 *     (verified by packing to a .docx and reading word/document.xml,
 *     since docx stores run formatting non-enumerably).
 *   • Empty/whitespace input never silently drops the narrative.
 */
import { describe, it, expect } from 'vitest'
import { Document, Packer, Paragraph, Table } from 'docx'
import PizZip from 'pizzip'
import { markdownToDocx } from '../../src/components/docx/markdownToDocx'

async function toXml(nodes: any[]): Promise<string> {
  const doc = new Document({ sections: [{ children: nodes as any }] })
  const buf = await Packer.toBuffer(doc)
  return new PizZip(buf).file('word/document.xml')!.asText()
}

const SAMPLE = [
  '## Hypotheses',
  '',
  'Readings were **elevated** relative to the outdoor reference.',
  '',
  '- first hypothesis',
  '- second hypothesis',
  '',
  '| Hypothesis | Increases confidence | Decreases confidence |',
  '| --- | --- | --- |',
  '| Under-ventilation | CO2 decay test | OA rate at reference |',
  '',
  'IH Review Required — screening output; not a compliance determination or causation finding.',
].join('\n')

describe('markdownToDocx', () => {
  it('returns docx Paragraph and Table nodes for headings/bullets/tables', () => {
    const nodes = markdownToDocx(SAMPLE)
    expect(nodes.length).toBeGreaterThan(0)
    // Every node is a real docx block.
    expect(nodes.every(n => n instanceof Paragraph || n instanceof Table)).toBe(true)
    // The GFM table produced a Table.
    expect(nodes.some(n => n instanceof Table)).toBe(true)
    // Headings/paragraphs/bullets produced multiple Paragraphs.
    expect(nodes.filter(n => n instanceof Paragraph).length).toBeGreaterThan(2)
  })

  it('renders bold runs and a table into the document XML', async () => {
    const xml = await toXml(markdownToDocx(SAMPLE))
    expect(/<w:b\b/.test(xml)).toBe(true) // **elevated** → bold run
    expect(xml.includes('<w:tbl>')).toBe(true) // GFM table → Word table
    expect(xml).toContain('Under-ventilation')
    expect(xml).toContain('IH Review Required')
  })

  it('honors the font option (Inter for the narrative-share doc)', async () => {
    const xml = await toXml(markdownToDocx('plain paragraph', { font: 'Inter' }))
    expect(xml).toContain('Inter')
  })

  it('never drops non-empty input', () => {
    expect(markdownToDocx('just text').length).toBeGreaterThan(0)
    expect(markdownToDocx('').length).toBe(0)
    expect(markdownToDocx('   ').length).toBe(0)
  })
})
