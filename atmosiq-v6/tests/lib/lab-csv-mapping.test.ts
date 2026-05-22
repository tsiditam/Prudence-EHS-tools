/**
 * Lab CSV column-mapping additions:
 *   • parseLabResultsCsv accepts a per-header `overrides` map that
 *     wins over the auto-detect
 *   • Empty-string override explicitly unmaps an auto-detected column
 *   • previewLabResultsCsv returns headers + auto mapping + a small
 *     sample-row slice for the wizard UI
 *   • getCanonicalFields exposes the dropdown options
 *
 * Plus the per-lab template store (localStorage-backed):
 *   • saveTemplate persists name + laboratory + mapping
 *   • listTemplates returns newest-first
 *   • findTemplateForLab does case-insensitive substring match
 *   • deleteTemplate removes by id and is a no-op for unknown ids
 *   • clearAllTemplates wipes the store
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

import {
  parseLabResultsCsv,
  previewLabResultsCsv,
  getCanonicalFields,
} from '../../src/utils/labResultsParser.js'

import {
  saveTemplate,
  listTemplates,
  findTemplateForLab,
  deleteTemplate,
  clearAllTemplates,
  __test as templatesTest,
} from '../../src/utils/labCsvTemplates'

// Minimal CSV with an EMSL-flavored header row including one column
// the parser auto-detects ("Sample ID") and one it doesn't
// ("Bulk Reading") that the user wants mapped to result.
const SAMPLE_CSV = [
  'Laboratory: EMSL Analytical, Inc.',
  '',
  'Sample ID,Analyte,Bulk Reading,Units',
  'AF-001,Penicillium,150,ct/m3',
  'AF-002,Aspergillus,32,ct/m3',
].join('\n')

describe('parseLabResultsCsv — overrides', () => {
  it('honors an override that maps a column the parser missed', () => {
    const r = parseLabResultsCsv(SAMPLE_CSV, {
      overrides: { 'Bulk Reading': 'result' },
    })
    expect(r.rows.length).toBe(2)
    expect(r.rows[0].result).toBe('150')
    expect(r.rows[1].result).toBe('32')
    expect(r.unmappedColumns).not.toContain('Bulk Reading')
  })

  it('an empty-string override explicitly unmaps an auto-detected column', () => {
    // "Analyte" auto-detects to analyte; force-unmap it.
    const r = parseLabResultsCsv(SAMPLE_CSV, {
      overrides: { Analyte: '' },
    })
    expect(r.rows[0].analyte).toBe('')
    expect(r.rows[0].extra).toMatchObject({ Analyte: 'Penicillium' })
    expect(r.unmappedColumns).toContain('Analyte')
  })

  it('without overrides, behavior matches the original auto-detect', () => {
    const r = parseLabResultsCsv(SAMPLE_CSV)
    expect(r.rows[0].sampleId).toBe('AF-001')
    expect(r.rows[0].analyte).toBe('Penicillium')
    // "Bulk Reading" doesn't match any pattern → unmapped
    expect(r.unmappedColumns).toContain('Bulk Reading')
  })
})

describe('previewLabResultsCsv', () => {
  it('returns headers + auto mapping + sample rows', () => {
    const p = previewLabResultsCsv(SAMPLE_CSV)
    expect(p.headers).toEqual(['Sample ID', 'Analyte', 'Bulk Reading', 'Units'])
    expect(p.autoMapping['Sample ID']).toBe('sampleId')
    expect(p.autoMapping['Analyte']).toBe('analyte')
    expect(p.autoMapping['Bulk Reading']).toBeNull()
    expect(p.autoMapping['Units']).toBe('units')
    expect(p.sampleRows.length).toBe(2)
    expect(p.sampleRows[0][0]).toBe('AF-001')
    expect(p.laboratory).toMatch(/EMSL/i)
  })

  it('honors the maxRows parameter', () => {
    // Use real canonical-matching headers so findHeaderRow accepts
    // the first line as the header row (heuristic needs ≥2 mapped
    // columns).
    const big = ['Sample ID,Analyte,Result', ...Array.from({ length: 20 }, (_, i) => `S-${i},Test,42`)].join('\n')
    const p = previewLabResultsCsv(big, 3)
    expect(p.sampleRows.length).toBe(3)
  })

  it('returns the empty preview for non-string / empty input', () => {
    const e1 = previewLabResultsCsv('')
    expect(e1.headers).toEqual([])
    const e2 = previewLabResultsCsv(null as unknown as string)
    expect(e2.headers).toEqual([])
  })

  it('returns the empty preview when no header-like row is detected', () => {
    const p = previewLabResultsCsv('no headers here\n1\n2\n3')
    expect(p.headers).toEqual([])
  })
})

describe('getCanonicalFields', () => {
  it('exposes the canonical field list for the wizard dropdown', () => {
    const fields = getCanonicalFields()
    expect(fields).toContain('sampleId')
    expect(fields).toContain('analyte')
    expect(fields).toContain('result')
    expect(fields).toContain('units')
  })
  it('returns a copy so callers can\'t mutate the source-of-truth', () => {
    const a = getCanonicalFields()
    const b = getCanonicalFields()
    a.push('garbage')
    expect(b).not.toContain('garbage')
  })
})

// ─── Template store ───────────────────────────────────────────────

beforeEach(() => {
  // Reset localStorage state between tests.
  templatesTest.writeStore({ templates: [] })
})

describe('labCsvTemplates store', () => {
  it('listTemplates is empty by default', () => {
    expect(listTemplates()).toEqual([])
  })

  it('saveTemplate persists name + laboratory + mapping', () => {
    const t = saveTemplate({
      name: 'EMSL Standard',
      laboratory: 'EMSL Analytical, Inc.',
      mapping: { 'Bulk Reading': 'result' },
    })
    expect(t.id).toBeTruthy()
    expect(t.name).toBe('EMSL Standard')
    expect(t.laboratory).toBe('EMSL Analytical, Inc.')
    expect(t.mapping).toEqual({ 'Bulk Reading': 'result' })
    expect(t.createdAt).toBeTruthy()
    expect(t.updatedAt).toBeTruthy()
    expect(listTemplates()).toHaveLength(1)
  })

  it('saveTemplate without name throws', () => {
    expect(() => saveTemplate({ name: '   ', mapping: {} })).toThrow()
  })

  it('saveTemplate by id updates the existing row in place', () => {
    const a = saveTemplate({ name: 'EMSL', mapping: { A: 'analyte' } })
    const b = saveTemplate({ id: a.id, name: 'EMSL', mapping: { A: 'result' } })
    expect(b.id).toBe(a.id)
    expect(b.mapping).toEqual({ A: 'result' })
    expect(listTemplates()).toHaveLength(1)
  })

  it('saveTemplate by duplicate name (case-insensitive) updates in place', () => {
    const a = saveTemplate({ name: 'EMSL', mapping: {} })
    const b = saveTemplate({ name: 'emsl', mapping: { X: 'units' } })
    expect(b.id).toBe(a.id)
    expect(listTemplates()).toHaveLength(1)
  })

  it('listTemplates returns newest-first by updatedAt', () => {
    const a = saveTemplate({ name: 'Older', mapping: {} })
    // Force a later updatedAt
    templatesTest.writeStore({
      templates: [
        { ...a, updatedAt: '2026-01-01T00:00:00Z' },
      ],
    })
    saveTemplate({ name: 'Newer', mapping: {} })
    const ordered = listTemplates()
    expect(ordered[0].name).toBe('Newer')
    expect(ordered[1].name).toBe('Older')
  })

  it('findTemplateForLab does case-insensitive substring match', () => {
    saveTemplate({
      name: 'EMSL Standard',
      laboratory: 'EMSL Analytical, Inc.',
      mapping: { A: 'analyte' },
    })
    expect(findTemplateForLab('EMSL ANALYTICAL')?.name).toBe('EMSL Standard')
    expect(findTemplateForLab('emsl')?.name).toBe('EMSL Standard')
    expect(findTemplateForLab('Eurofins')).toBeNull()
  })

  it('findTemplateForLab returns the most-recently-updated when multiple match', () => {
    saveTemplate({ name: 'EMSL v1', laboratory: 'EMSL Analytical', mapping: {} })
    // Tweak the first to a much older updatedAt
    const store = templatesTest.readStore()
    store.templates[0].updatedAt = '2024-01-01T00:00:00Z'
    templatesTest.writeStore(store)
    saveTemplate({ name: 'EMSL v2', laboratory: 'EMSL Analytical', mapping: {} })
    expect(findTemplateForLab('EMSL')?.name).toBe('EMSL v2')
  })

  it('deleteTemplate removes by id and is a no-op for unknown ids', () => {
    const t = saveTemplate({ name: 'X', mapping: {} })
    expect(deleteTemplate(t.id)).toBe(true)
    expect(listTemplates()).toHaveLength(0)
    expect(deleteTemplate(t.id)).toBe(false)
    expect(deleteTemplate('')).toBe(false)
  })

  it('clearAllTemplates wipes the store', () => {
    saveTemplate({ name: 'A', mapping: {} })
    saveTemplate({ name: 'B', mapping: {} })
    clearAllTemplates()
    expect(listTemplates()).toEqual([])
  })
})

describe('integration: apply template → parse with overrides', () => {
  beforeEach(() => { templatesTest.writeStore({ templates: [] }) })

  it('round-trips: save a template, find it, apply its mapping', () => {
    saveTemplate({
      name: 'EMSL standard',
      laboratory: 'EMSL Analytical, Inc.',
      mapping: { 'Bulk Reading': 'result' },
    })
    const preview = previewLabResultsCsv(SAMPLE_CSV)
    const tpl = findTemplateForLab(preview.laboratory || '')
    expect(tpl).toBeTruthy()
    const parsed = parseLabResultsCsv(SAMPLE_CSV, { overrides: tpl!.mapping })
    expect(parsed.rows[0].result).toBe('150')
  })
})
