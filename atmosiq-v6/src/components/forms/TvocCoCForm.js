/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow TVOC Sampling — Chain of Custody PDF generator.
 *
 * Generates a 2-page, print-ready CoC form for TVOC samples (Summa
 * canisters, sorbent tubes — Tenax / Carbopack, passive badges,
 * direct-read instruments). Same pre-fill + handwriting workflow as
 * the Mold CoC; analysis options match common laboratory methods
 * (EPA TO-15, TO-17, aldehydes, GC/MS speciation).
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  MARGIN, ACCENT_DARK, SLATE, RULE,
  FONT_FAMILY, SZ_LABEL, SZ_BODY_SMALL,
  SAMPLE_ROW_H, SAMPLE_ROWS_PER_PAGE,
} from './formStyles'
import {
  drawHeaderBand, drawFooter, sectionHeader, fieldGrid,
  checkboxRow, ruledBlock, transferTable, labUseOnly,
  buildSubmittingPartyFields, buildClientFields,
  buildSamplingConditionFields, buildDestinationLabFields,
} from './formSections'

const FORM_ID = 'AF-COC-V'
const TITLE = 'TVOC Sampling'

const SAMPLE_COLUMNS = [
  { header: '#',          dataKey: 'idx',  width: 18 },
  { header: 'Sample ID',  dataKey: 'sid',  width: 50 },
  { header: 'Lab ID',     dataKey: 'lab',  width: 40 },
  { header: 'Location / Room',             dataKey: 'loc', width: 72 },
  { header: 'Sample type', dataKey: 'typ', width: 70 },
  { header: 'Media ID',   dataKey: 'med',  width: 50 },
  { header: 'Flow mL/min',                 dataKey: 'flow', width: 36 },
  { header: 'Dur. min',   dataKey: 'dur',  width: 32 },
  { header: 'Total vol L',                 dataKey: 'vol', width: 38 },
  { header: 'Temp °F',    dataKey: 'tmp',  width: 30 },
  { header: 'RH %',       dataKey: 'rh',   width: 28 },
  { header: 'Bkg ppb',    dataKey: 'bkg',  width: 32 },
  { header: 'Date / Time',                 dataKey: 'dt',  width: 56 },
  { header: 'Notes',      dataKey: 'note', width: 58 },
]

function emptySampleRows() {
  const rows = []
  for (let i = 1; i <= SAMPLE_ROWS_PER_PAGE; i++) {
    rows.push({
      idx: String(i), sid: '', lab: '', loc: '', typ: '', med: '',
      flow: '', dur: '', vol: '', tmp: '', rh: '', bkg: '', dt: '', note: '',
    })
  }
  return rows
}

function autotableColumns() {
  return SAMPLE_COLUMNS.map((c) => ({ header: c.header, dataKey: c.dataKey }))
}

function autotableColumnStyles() {
  const styles = {}
  for (const c of SAMPLE_COLUMNS) {
    styles[c.dataKey] = { cellWidth: c.width }
  }
  return styles
}

export function generateTvocCoCBlob({ profile } = {}) {
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
    columns: autotableColumns(),
    body: emptySampleRows(),
    columnStyles: autotableColumnStyles(),
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
    { label: 'EPA TO-15 (Summa canister)', w: 0.5 },
    { label: 'EPA TO-17 (sorbent tube)', w: 0.5 },
    { label: 'Aldehydes (HCHO etc.)', w: 0.5, hint: '(NIOSH 2016 / 3500)' },
    { label: 'Speciation by GC/MS', w: 0.5 },
    { label: 'Target compound list', w: 0.5, hint: '(specify: __________)' },
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

export const TVOC_COC_FILENAME_PREFIX = 'AtmosFlow-CoC-TVOC'
