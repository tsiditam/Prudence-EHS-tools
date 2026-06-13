/**
 * isSpreadsheetDoc — the shared filter that decides which project Documents
 * Logger Studio offers for "load from project". Must accept CSV/XLS/XLSX (by
 * filename or MIME) and reject everything else.
 */
import { describe, it, expect } from 'vitest'
import { isSpreadsheetDoc } from '../../src/components/projects/projectsTheme.js'

describe('isSpreadsheetDoc', () => {
  it('accepts csv / xls / xlsx by filename', () => {
    expect(isSpreadsheetDoc({ name: 'logger-export.csv', type: '' })).toBe(true)
    expect(isSpreadsheetDoc({ name: 'qtrak.xlsx', type: '' })).toBe(true)
    expect(isSpreadsheetDoc({ name: 'legacy.xls', type: '' })).toBe(true)
  })

  it('accepts by MIME type', () => {
    expect(isSpreadsheetDoc({ name: 'noext', type: 'text/csv' })).toBe(true)
    expect(isSpreadsheetDoc({ name: 'noext', type: 'application/vnd.ms-excel' })).toBe(true)
    expect(isSpreadsheetDoc({ name: 'noext', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe(true)
  })

  it('rejects non-spreadsheet documents', () => {
    expect(isSpreadsheetDoc({ name: 'report.pdf', type: 'application/pdf' })).toBe(false)
    expect(isSpreadsheetDoc({ name: 'photo.png', type: 'image/png' })).toBe(false)
    expect(isSpreadsheetDoc({ name: 'memo.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(false)
  })

  it('is safe on empty / missing fields', () => {
    expect(isSpreadsheetDoc({})).toBe(false)
    expect(isSpreadsheetDoc()).toBe(false)
  })
})
