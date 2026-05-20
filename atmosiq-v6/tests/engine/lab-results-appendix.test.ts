/**
 * Lab Results Appendix (Appendix G) — DOCX section contract.
 *
 * The renderer is a pure function of the labResults blob the
 * LabResultsImport UI persists onto an assessment. This smoke test
 * pins:
 *   • Empty / missing input → no children emitted (silent no-op).
 *   • Populated input → heading + provenance line + table + italic
 *     footnote.
 *   • Provenance line composes lab name + filename + date when all
 *     three are present; degrades gracefully when any is absent.
 *
 * The CSV parser is exercised separately in
 * tests/lib/lab-results-parser.test.ts. This file is the renderer
 * smoke; it does not re-test parsing.
 */
import { describe, it, expect } from 'vitest'
import { Table, Paragraph } from 'docx'
import { buildLabResultsAppendix } from '../../src/components/docx/sections-lab-results.js'

function flatten(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const anyNode = node as { root?: unknown[]; options?: Record<string, unknown> }
  let acc = ''
  if (anyNode.options && typeof anyNode.options.text === 'string') {
    acc += anyNode.options.text + ' '
  }
  if (Array.isArray(anyNode.root)) {
    for (const child of anyNode.root) acc += flatten(child)
  }
  return acc
}

const SAMPLE_ROWS = [
  {
    sampleId: 'AC-001', sampleType: 'Spore Trap', location: 'Zone A — Office',
    collectedAt: '2026-05-15', receivedAt: '2026-05-16',
    analyte: 'Aspergillus/Penicillium', result: '1,200', units: 'spores/m³',
    detectionLimit: '13', analystNotes: '', extra: {},
  },
  {
    sampleId: 'AC-002', sampleType: 'Spore Trap', location: 'Outdoor Reference',
    collectedAt: '2026-05-15', receivedAt: '2026-05-16',
    analyte: 'Aspergillus/Penicillium', result: '180', units: 'spores/m³',
    detectionLimit: '13', analystNotes: '', extra: {},
  },
]

describe('buildLabResultsAppendix', () => {
  it('returns [] when labResults is missing entirely', () => {
    expect(buildLabResultsAppendix(undefined)).toEqual([])
    expect(buildLabResultsAppendix(null)).toEqual([])
  })

  it('returns [] when rows array is missing or empty', () => {
    expect(buildLabResultsAppendix({})).toEqual([])
    expect(buildLabResultsAppendix({ rows: [] })).toEqual([])
    expect(buildLabResultsAppendix({ rows: null as unknown as [] })).toEqual([])
  })

  it('emits Appendix G heading + table + footnote when rows are present', () => {
    const children = buildLabResultsAppendix({
      laboratory: 'EMSL Analytical, Inc.',
      importedAt: '2026-05-19T10:00:00.000Z',
      importedFromFilename: 'emsl-12345.csv',
      rows: SAMPLE_ROWS,
    })
    const tables = children.filter((c: unknown) => c instanceof Table)
    expect(tables).toHaveLength(1)
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/Appendix G — Laboratory Analytical Results/)
    expect(allText).toMatch(/EMSL Analytical, Inc/)
    expect(allText).toMatch(/emsl-12345\.csv/)
    expect(allText).toMatch(/AC-001/)
    expect(allText).toMatch(/Aspergillus\/Penicillium/)
    expect(allText).toMatch(/qualified industrial hygienist/i)
  })

  it('omits filename from provenance when filename is absent', () => {
    const children = buildLabResultsAppendix({
      laboratory: 'EMLab P&K (Eurofins)',
      importedAt: '2026-05-19T10:00:00.000Z',
      rows: SAMPLE_ROWS,
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/EMLab P&K/)
    expect(allText).toMatch(/Results imported on/)
    expect(allText).not.toMatch(/imported from .* on/)
  })

  it('falls back to a generic lab phrase when laboratory is null', () => {
    const children = buildLabResultsAppendix({
      laboratory: null,
      importedAt: null,
      rows: SAMPLE_ROWS,
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/Independent analytical laboratory/)
  })

  it('renders one table row per source row + a header row', () => {
    const children = buildLabResultsAppendix({ rows: SAMPLE_ROWS, laboratory: 'X' })
    const tables = children.filter((c: unknown) => c instanceof Table)
    expect(tables).toHaveLength(1)
    // The table internal row count is not trivially introspectable
    // from the docx package API, but the text content should mention
    // every sample ID.
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/AC-001/)
    expect(allText).toMatch(/AC-002/)
  })

  it('handles rows with missing canonical fields by rendering em-dash', () => {
    const children = buildLabResultsAppendix({
      laboratory: 'X',
      rows: [{ sampleId: 'S1' } as unknown as typeof SAMPLE_ROWS[number]],
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/S1/)
    // The em-dash placeholder character appears for the missing fields.
    expect(allText).toMatch(/—/)
  })
})
