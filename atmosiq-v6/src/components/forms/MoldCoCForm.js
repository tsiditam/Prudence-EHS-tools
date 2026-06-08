/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow Mold Sampling — Chain of Custody PDF generator.
 *
 * Generates a 2-page, print-ready CoC form for mold samples (spore
 * traps, tape lifts, swabs, bulk, surface dust, direct exam media).
 * Assessor identity / firm / instrument calibration are pre-filled
 * from the user profile. Sample log rows are blank ruled rows for
 * hand-completion at the time of collection — wet-signature workflow
 * has higher evidentiary weight than digital fields, which aligns
 * with AtmosFlow's defensibility positioning.
 *
 * Library: jsPDF + jspdf-autotable. Both run in the browser; no
 * server round-trip needed.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  MARGIN, CONTENT_W, ACCENT_DARK, SLATE, SOFT, RULE,
  FONT_FAMILY, SZ_LABEL, SZ_BODY_SMALL,
  SAMPLE_ROW_H, SAMPLE_ROWS_PER_PAGE,
} from './formStyles'
import {
  drawHeaderBand, drawFooter, sectionHeader, fieldGrid,
  checkboxRow, ruledBlock, transferTable, labUseOnly,
  buildSubmittingPartyFields, buildClientFields,
  buildSamplingConditionFields, buildDestinationLabFields,
  autotableColumns, autotableColumnStyles,
} from './formSections'

const FORM_ID = 'AF-COC-M'
const TITLE = 'Mold Sampling'

const SAMPLE_COLUMNS = [
  { header: '#',          dataKey: 'idx',     width: 18 },
  { header: 'Sample ID',  dataKey: 'sid',     width: 56 },
  { header: 'Lab ID',     dataKey: 'lab',     width: 44 },
  { header: 'Location / Room',                dataKey: 'loc', width: 80 },
  { header: 'Sample type',                    dataKey: 'typ', width: 70 },
  { header: 'Media',      dataKey: 'med',     width: 60 },
  { header: 'Vol L / Area in²',               dataKey: 'vol', width: 50 },
  { header: 'Flow L/min', dataKey: 'flow',    width: 38 },
  { header: 'Dur. min',   dataKey: 'dur',     width: 38 },
  { header: 'Date / Time',                    dataKey: 'dt',  width: 60 },
  { header: 'Visible mold (Y/N)',             dataKey: 'vis', width: 40 },
  { header: 'Notes',      dataKey: 'note',    width: 88 },
]

// Pull headers off SAMPLE_COLUMNS so autotable receives the canonical
// shape. The body is 15 blank ruled rows — caller never passes data.
function emptySampleRows() {
  const rows = []
  for (let i = 1; i <= SAMPLE_ROWS_PER_PAGE; i++) {
    rows.push({ idx: String(i), sid: '', lab: '', loc: '', typ: '', med: '', vol: '', flow: '', dur: '', dt: '', vis: '', note: '' })
  }
  return rows
}

export function generateMoldCoCBlob({ profile } = {}) {
  // Letter portrait, points unit, identical to the existing
  // generate-sample-report-pdf script for layout consistency.
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  // ── Page 1 ──────────────────────────────────────────────────────
  let y = drawHeaderBand(doc, { title: TITLE, formId: FORM_ID })

  y = sectionHeader(doc, y, 'Client')
  y = fieldGrid(doc, y, buildClientFields(), { rowH: 26 })

  y = sectionHeader(doc, y, 'Submitting Party')
  y = fieldGrid(doc, y, buildSubmittingPartyFields(profile), { rowH: 26 })

  y = sectionHeader(doc, y, 'Sampling Conditions')
  y = fieldGrid(doc, y, buildSamplingConditionFields(), { rowH: 26 })

  y = sectionHeader(doc, y, 'Destination Lab')
  y = fieldGrid(doc, y, buildDestinationLabFields(), { rowH: 26 })

  y = sectionHeader(doc, y, 'Sample Log')

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    columns: autotableColumns(SAMPLE_COLUMNS),
    body: emptySampleRows(),
    columnStyles: autotableColumnStyles(SAMPLE_COLUMNS),
    styles: {
      font: FONT_FAMILY, fontSize: SZ_BODY_SMALL,
      cellPadding: 3,
      lineColor: RULE,
      lineWidth: 0.4,
      minCellHeight: SAMPLE_ROW_H,
      textColor: SLATE,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: ACCENT_DARK,
      fontSize: SZ_LABEL,
      fontStyle: 'bold',
      minCellHeight: 18,
      halign: 'left',
    },
    theme: 'grid',
  })

  // ── Page 2 ──────────────────────────────────────────────────────
  doc.addPage()
  y = drawHeaderBand(doc, { title: TITLE, formId: FORM_ID })

  y = sectionHeader(doc, y, 'Analyses Requested')
  y = checkboxRow(doc, y, [
    { label: 'Direct exam (light microscopy)', w: 0.5 },
    { label: 'Culturable', w: 0.5, hint: '(medium: __________)' },
    { label: 'PCR / qPCR', w: 0.5 },
    { label: 'ERMI / HERTSMI-2', w: 0.5 },
    { label: 'Specific-organism ID', w: 0.5, hint: '(specify: __________)' },
    { label: 'Other', w: 0.5, hint: '(specify: __________)' },
  ])

  y += 6
  y = sectionHeader(doc, y, 'Sample Handling')
  y = fieldGrid(doc, y, [
    { label: 'Total samples', value: '', w: 0.2 },
    { label: 'Storage condition', value: '', w: 0.3 },
    { label: 'Cooler temp °F', value: '', w: 0.2 },
    { label: 'Hold-time notes', value: '', w: 0.3 },
  ], { rowH: 26 })

  y = sectionHeader(doc, y, 'Special Instructions')
  y = ruledBlock(doc, y, 4)

  y += 4
  y = sectionHeader(doc, y, 'Chain of Custody Transfers')
  y = transferTable(doc, y) + 6

  y = sectionHeader(doc, y, 'Lab Use Only')
  y = labUseOnly(doc, y)

  // ── Footers on every page ───────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    drawFooter(doc, { formId: FORM_ID, pageNum: p, pageCount })
  }

  return doc.output('blob')
}

export const MOLD_COC_FILENAME_PREFIX = 'AtmosFlow-CoC-Mold'

// Re-export so callers don't need both modules.
export { SLATE, SOFT } from './formStyles'
