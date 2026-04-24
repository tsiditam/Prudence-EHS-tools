/**
 * AtmosFlow DOCX Report — Table Utilities
 * Reusable table builders for consistent formatting
 */

import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, AlignmentType, ShadingType } from 'docx'
import { FONTS, COLORS } from './styles'

const noBorder = { style: BorderStyle.NONE, size: 0, color: COLORS.white }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: COLORS.bgMed }

export function headerCell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.body, size: 18, bold: true, color: COLORS.muted })],
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { after: 0 },
    })],
    shading: { type: ShadingType.CLEAR, fill: COLORS.bgLight },
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
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
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    borders: { top: noBorder, bottom: thinBorder, left: noBorder, right: noBorder },
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
  })
}

export function buildTable(headers, rows, opts = {}) {
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
        return dataCell(cell.text !== undefined ? cell.text : cell, cell)
      }),
    }))
  }
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: opts.borderless ? {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder,
    } : undefined,
  })
}

export function kvTable(pairs) {
  const rows = pairs.map(([label, value]) => [
    { text: label, color: COLORS.muted, size: 20 },
    { text: value || '—', bold: true, size: 20 },
  ])
  return buildTable(null, rows)
}

export function borderlessLayoutTable(cells) {
  return new Table({
    rows: [new TableRow({
      children: cells.map(c => new TableCell({
        children: Array.isArray(c) ? c : [c],
        borders: noBorders,
        width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
      })),
    })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
  })
}
