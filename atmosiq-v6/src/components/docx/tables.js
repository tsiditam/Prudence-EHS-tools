/**
 * AtmosFlow DOCX Report — Table Utilities
 * Reusable table builders for consistent formatting
 * Uses DXA (absolute twips) with table-level columnWidths for iOS compatibility.
 * iOS Quick Look ignores cell-level width attributes — only columnWidths works.
 */

import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, AlignmentType, ShadingType } from 'docx'
import { FONTS, COLORS } from './styles'

const noBorder = { style: BorderStyle.NONE, size: 0, color: COLORS.white }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: COLORS.bgMed }

const CONTENT_WIDTH_DXA = 9360

function pctToDxa(pct) {
  return Math.round((pct / 100) * CONTENT_WIDTH_DXA)
}

export function headerCell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.body, size: 18, bold: true, color: COLORS.muted })],
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0 },
    })],
    shading: { type: ShadingType.CLEAR, fill: COLORS.bgLight },
    width: opts.width ? { size: pctToDxa(opts.width), type: WidthType.DXA } : undefined,
    borders: { top: thinBorder, bottom: thinBorder, left: noBorder, right: noBorder },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  })
}

export function dataCell(text, opts = {}) {
  const runs = []
  if (typeof text === 'string' || typeof text === 'number') {
    runs.push(new TextRun({
      text: String(text),
      font: FONTS.body,
      size: opts.size || 20,
      bold: opts.bold || false,
      color: opts.color || COLORS.body,
    }))
  } else if (Array.isArray(text)) {
    runs.push(...text)
  }
  return new TableCell({
    children: [new Paragraph({
      children: runs,
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0 },
    })],
    width: opts.width ? { size: pctToDxa(opts.width), type: WidthType.DXA } : undefined,
    borders: { top: noBorder, bottom: thinBorder, left: noBorder, right: noBorder },
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
  })
}

function computeColumnWidths(headers, rows) {
  const colCount = headers ? headers.length : (rows[0]?.length || 2)
  const widths = []
  if (headers) {
    for (let i = 0; i < colCount; i++) {
      widths.push(headers[i]?.width ? pctToDxa(headers[i].width) : Math.round(CONTENT_WIDTH_DXA / colCount))
    }
  } else if (rows.length > 0) {
    for (let i = 0; i < colCount; i++) {
      const cell = rows[0][i]
      widths.push(cell?.width ? pctToDxa(cell.width) : Math.round(CONTENT_WIDTH_DXA / colCount))
    }
  }
  if (widths.length === 0) {
    widths.push(Math.round(CONTENT_WIDTH_DXA / 2), Math.round(CONTENT_WIDTH_DXA / 2))
  }
  return widths
}

export function buildTable(headers, rows, opts = {}) {
  const colWidths = headers ? headers.map(h => h.width || 0) : []
  const columnWidthsDxa = computeColumnWidths(headers, rows)
  const tableRows = []
  if (headers && headers.length > 0) {
    tableRows.push(new TableRow({
      children: headers.map((h, i) => headerCell(h.text || h, { align: h.align, width: h.width })),
      tableHeader: true,
    }))
  }
  for (const row of rows) {
    tableRows.push(new TableRow({
      children: row.map((cell, i) => {
        if (cell instanceof TableCell) return cell
        const w = colWidths[i] || cell.width
        return dataCell(cell.text !== undefined ? cell.text : cell, { ...cell, width: w || cell.width })
      }),
    }))
  }
  const tableOpts = {
    rows: tableRows,
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
  }
  if (columnWidthsDxa.length > 0) tableOpts.columnWidths = columnWidthsDxa
  if (opts.borderless) tableOpts.borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }
  return new Table(tableOpts)
}

export function kvTable(pairs) {
  const rows = pairs.map(([label, value]) => [
    { text: label, color: COLORS.muted, size: 20, width: 35 },
    { text: value || '—', bold: true, size: 20, width: 65 },
  ])
  return buildTable(null, rows)
}

export function borderlessLayoutTable(cells) {
  const cellWidth = Math.floor(100 / cells.length)
  const columnWidthsDxa = cells.map(() => pctToDxa(cellWidth))
  return new Table({
    rows: [new TableRow({
      children: cells.map(c => new TableCell({
        children: Array.isArray(c) ? c : [c],
        borders: noBorders,
        width: { size: pctToDxa(cellWidth), type: WidthType.DXA },
      })),
    })],
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: columnWidthsDxa,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
  })
}
