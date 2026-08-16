/**
 * AtmosFlow DOCX — Indoor Air Quality Assessment Report.
 *
 * The EDITABLE, WATERMARK-FREE Word twin of the AtmosFlow PDF report. The
 * pdfkit renderer (lib/report/render-pdf.js) is the design source of truth;
 * this module replicates its visual system in OOXML — the teal palette, the
 * segmented cover bar, the numbered headings, the teal-header zebra tables,
 * the severity chips, the per-parameter interpretation, and the signature
 * block — so the .docx reads as the same document, only editable and with no
 * diagonal watermark (the whole point of the Word deliverable).
 *
 * It consumes the RENDER MODEL produced by `assembleRenderModel(...)` in
 * src/report/reportModel.js (the same model the PDF renderer draws), NOT the
 * engine ClientReport. This file never rewords the model's prose — the
 * narrative is authored, screening-safe, and placed verbatim.
 *
 * ── Type system ────────────────────────────────────────────────────────
 * The AtmosFlow report has its OWN reviewed type system (as the monitoring
 * report does). The PDF uses Helvetica; the Word-native closest match is
 * Arial, named ONCE in the `FONT` const and referenced through that variable
 * everywhere — never as a quoted family literal (the DOCX font guard,
 * tests/components/docx-fonts.test.js, scans this directory and fails on a
 * a quoted font-family literal).
 *
 * ── Editorial suppressions ─────────────────────────────────────────────
 * This renderer reads the PDF render-model, which does NOT carry engine
 * findingIds. Editorial-suppression handling therefore does not apply here
 * and is deliberately not attempted (it remains on the Consultant Report,
 * sections-v21client.js). No `editorialSuppressions` are read.
 */

import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  BorderStyle,
  AlignmentType,
  HeightRule,
  ImageRun,
} from 'docx'
import { CONTENT_WIDTH_DXA } from './page-setup'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'

// ── Palette (hex without '#', OOXML form) — confirmed against render-pdf.js ──
const INK = '0F172A'
const SLATE = '1E293B'
const SOFT = '475569'
const FAINT = '64748B'
const RULE = 'CBD5E1'
const ZEBRA = 'F1F5F9'
const CARD = 'F8FAFC'
const WHITE = 'FFFFFF'
const ACCENT = '0E7490'
const ACCENT_DK = '155E75'
const ACCENT_TINT = 'E0F2F7'

// Cover segmented bar — the SERIES colors, in the PDF's order.
const SERIES = ['0E9FB8', 'CA8A04', 'EA7A2B', '2563EB', '7C3AED', '059669']

// Screening severity → { label, color }. Keyed by the model's sev tokens.
const SEV = {
  ok: { label: 'Acceptable', color: '15803D' },
  advisory: { label: 'Advisory', color: 'B45309' },
  elevated: { label: 'Elevated', color: 'C2410C' },
  priority: { label: 'Priority', color: 'B91C1C' },
}

/**
 * The report's single clean sans. Arial is Word-native and the closest match
 * to the PDF's Helvetica. Named ONCE, referenced as `font: FONT` everywhere —
 * a quoted family literal would fail the DOCX font guard.
 */
const FONT = 'Arial'

// Type scale in half-points (docx size = pt × 2).
const SIZE = {
  coverTitle: 56, //   28 pt
  h1: 34, //           17 pt
  reportTitle: 26, //  13 pt
  h2: 21, //           10.5 pt
  h3: 21, //           10.5 pt
  body: 20, //         10 pt
  small: 17, //        8.5 pt
  table: 17, //        8.5 pt
  tableSm: 16, //      8 pt
  fine: 17, //         8.5 pt
  eyebrow: 18, //      9 pt
  sig: 21, //          10.5 pt
}

const BODY_LINE = Math.round(1.28 * 240)

/**
 * Document defaults for the AtmosFlow report — Arial, so any run that names
 * no face inherits the report's family. Scoped to this report only.
 */
export const ATMOSFLOW_DOCX_STYLES = {
  default: {
    document: {
      run: { font: FONT, size: SIZE.body, color: INK },
      paragraph: { spacing: { after: 90, line: BODY_LINE } },
    },
  },
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
const hair = (color = RULE, size = 4) => ({ style: BorderStyle.SINGLE, size, color, space: 1 })

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))
const pct = (w) => Math.round((w / 100) * CONTENT_WIDTH_DXA)

// ── Text primitives ────────────────────────────────────────────────────────

/** A justified body paragraph — ~10pt INK. */
function p(text, opts = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text: String(text ?? ''),
        size: opts.size ?? SIZE.body,
        color: opts.color ?? INK,
        bold: !!opts.bold,
        italics: !!opts.italics,
        font: FONT,
      }),
    ],
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 140, before: opts.before ?? 0, line: opts.line ?? BODY_LINE },
    keepNext: opts.keepNext || undefined,
    keepLines: opts.keepLines || undefined,
    pageBreakBefore: opts.pageBreakBefore || undefined,
  })
}

/** A "Bold-lead: rest" paragraph — the model's "What it is …:" / "Observed:" prose. */
function leadParagraph(text, opts = {}) {
  const s = String(text ?? '')
  const idx = s.indexOf(':')
  if (idx < 0 || idx > 60) return p(s, opts)
  const lead = s.slice(0, idx + 1)
  const rest = s.slice(idx + 1)
  return new Paragraph({
    children: [
      new TextRun({ text: lead, bold: true, size: SIZE.body, color: INK, font: FONT }),
      new TextRun({ text: rest, size: SIZE.body, color: INK, font: FONT }),
    ],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 140, line: BODY_LINE },
  })
}

/** h1 — numbered, large SLATE bold; optional page break to mirror the PDF. */
function h1(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: SIZE.h1, color: SLATE, font: FONT })],
    spacing: { before: opts.pageBreakBefore ? 0 : 260, after: 140 },
    keepNext: true,
    pageBreakBefore: opts.pageBreakBefore || undefined,
  })
}

/** h2 — teal UPPERCASE, letter-spaced, with a thin rule beneath. */
function h2(text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: String(text).toUpperCase(),
        bold: true,
        size: SIZE.h2,
        color: ACCENT,
        font: FONT,
        characterSpacing: 16,
      }),
    ],
    spacing: { before: 200, after: 120 },
    border: { bottom: hair(RULE) },
    keepNext: true,
  })
}

/** h3 — teal (dark) sentence-case bold. */
function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: SIZE.h3, color: ACCENT_DK, font: FONT })],
    spacing: { before: 120, after: 70 },
    keepNext: true,
  })
}

/** A bulleted list — "•  item", hanging indent. */
function bullets(items) {
  return (items || []).filter(Boolean).map(
    (it) =>
      new Paragraph({
        children: [new TextRun({ text: `•  ${String(it)}`, size: SIZE.body, color: INK, font: FONT })],
        indent: { left: 240, hanging: 240 },
        spacing: { after: 80, line: BODY_LINE },
      }),
  )
}

/** A quiet FAINT note line (table caption / data source). */
function metaLine(text) {
  return p(text, { size: SIZE.fine, color: FAINT, align: AlignmentType.LEFT, after: 120 })
}

// ── Table primitive ──────────────────────────────────────────────────────────
//
// Replicates the PDF table: teal header row (white bold labels, multi-line via
// '\n'), ~8.5pt body, zebra alternating rows, a colored+bold outcome cell, and
// a bold Site-mean row filled with ACCENT_TINT.

function normCell(spec) {
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    return { text: spec.t == null ? '' : String(spec.t), color: spec.color || INK, bold: !!spec.bold }
  }
  return { text: spec == null ? '' : String(spec), color: INK, bold: false }
}

function headerCellParagraph(label, align) {
  const lines = String(label).split('\n')
  return new Paragraph({
    alignment: align,
    spacing: { after: 0 },
    children: lines.flatMap((ln, i) => [
      ...(i > 0 ? [new TextRun({ text: '', break: 1, font: FONT })] : []),
      new TextRun({ text: ln, bold: true, size: SIZE.tableSm, color: WHITE, font: FONT }),
    ]),
  })
}

/**
 * @param columns  [{ label, width (percent), align, render(row) }]
 * @param rows     data rows; a row with `__bold` renders bold on ACCENT_TINT
 * @param opts     { fontSize }
 */
function docTable(columns, rows, opts = {}) {
  const fs = opts.fontSize || SIZE.table
  const colWidths = columns.map((c) => pct(c.width))
  const alignOf = (a) => (a === 'right' ? AlignmentType.RIGHT : a === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT)

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(
      (c, i) =>
        new TableCell({
          children: [headerCellParagraph(c.label, alignOf(c.align))],
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: ACCENT },
          borders: noBorders,
          margins: { top: 70, bottom: 70, left: 90, right: 90 },
          verticalAlign: 'center',
        }),
    ),
  })

  const bodyRows = rows.map((r, ri) => {
    const boldRow = !!r.__bold
    const fill = boldRow ? ACCENT_TINT : ri % 2 === 1 ? ZEBRA : undefined
    return new TableRow({
      cantSplit: true,
      children: columns.map((c, i) => {
        const cell = normCell(c.render ? c.render(r) : r[c.key])
        return new TableCell({
          children: [
            new Paragraph({
              alignment: alignOf(c.align),
              spacing: { after: 0, line: Math.round(1.15 * 240) },
              children: [
                new TextRun({
                  text: cell.text,
                  bold: cell.bold || boldRow,
                  size: fs,
                  color: cell.color,
                  font: FONT,
                }),
              ],
            }),
          ],
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
          borders: { ...noBorders, bottom: hair(RULE, 2) },
          margins: { top: 60, bottom: 60, left: 90, right: 90 },
          verticalAlign: 'center',
        })
      }),
    })
  })

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [headerRow, ...bodyRows],
  })
}

/** Spacer paragraph — Word requires a paragraph after a table. */
const afterTable = (after = 160) => new Paragraph({ children: [new TextRun({ text: '', font: FONT })], spacing: { after } })

// ── Severity legend chips ────────────────────────────────────────────────────

function chipCell(sev, isLast) {
  const s = SEV[sev]
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: s.label.toUpperCase(), bold: true, size: SIZE.small, color: WHITE, font: FONT, characterSpacing: 8 })],
      }),
    ],
    shading: { type: ShadingType.CLEAR, fill: s.color },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: isLast ? noBorder : { style: BorderStyle.SINGLE, size: 12, color: WHITE },
      right: noBorder,
    },
    margins: { top: 80, bottom: 80, left: 60, right: 60 },
    verticalAlign: 'center',
  })
}

function severityChips() {
  const keys = ['ok', 'advisory', 'elevated', 'priority']
  const w = Math.floor(CONTENT_WIDTH_DXA / 4)
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [w, w, w, CONTENT_WIDTH_DXA - 3 * w],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ children: keys.map((k, i) => chipCell(k, i === keys.length - 1)) })],
  })
}

// ── Cover ────────────────────────────────────────────────────────────────────

/** The thin full-width segmented color bar across the very top of the cover. */
function segmentedBar() {
  const n = SERIES.length
  const w = Math.floor(CONTENT_WIDTH_DXA / n)
  const widths = SERIES.map((_, i) => (i === n - 1 ? CONTENT_WIDTH_DXA - w * (n - 1) : w))
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widths,
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        height: { value: 80, rule: HeightRule.EXACT },
        children: SERIES.map(
          (color, i) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '', size: 2, font: FONT })], spacing: { after: 0, line: 40 } })],
              width: { size: widths[i], type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, fill: color },
              borders: noBorders,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
            }),
        ),
      }),
    ],
  })
}

/** The full-width teal status banner — white centered bold uppercase. */
function statusBanner(text) {
  const label = String(text || '').toUpperCase()
  if (!label) return null
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
                children: [new TextRun({ text: label, bold: true, size: SIZE.h2, color: WHITE, font: FONT, characterSpacing: 12 })],
              }),
            ],
            shading: { type: ShadingType.CLEAR, fill: ACCENT },
            borders: noBorders,
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            verticalAlign: 'center',
          }),
        ],
      }),
    ],
  })
}

/** The cover meta table — teal header "Field/Value", zebra rows from coverRows. */
function coverMetaTable(rows) {
  const cols = [pct(34), CONTENT_WIDTH_DXA - pct(34)]
  const header = new TableRow({
    tableHeader: true,
    children: ['Field', 'Value'].map(
      (h, i) =>
        new TableCell({
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: h, bold: true, size: SIZE.tableSm, color: WHITE, font: FONT })] })],
          width: { size: cols[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: ACCENT },
          borders: noBorders,
          margins: { top: 70, bottom: 70, left: 110, right: 110 },
        }),
    ),
  })
  const body = (rows || []).map((pair, ri) => {
    const [label, value] = pair
    const fill = ri % 2 === 1 ? ZEBRA : undefined
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: String(label).toUpperCase(), bold: true, size: SIZE.small, color: FAINT, font: FONT, characterSpacing: 6 })] })],
          width: { size: cols[0], type: WidthType.DXA },
          shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
          borders: { ...noBorders, bottom: hair(RULE, 2) },
          margins: { top: 80, bottom: 80, left: 110, right: 110 },
          verticalAlign: 'center',
        }),
        new TableCell({
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: fmt(value), bold: true, size: SIZE.small, color: INK, font: FONT })] })],
          width: { size: cols[1], type: WidthType.DXA },
          shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
          borders: { ...noBorders, bottom: hair(RULE, 2) },
          margins: { top: 80, bottom: 80, left: 110, right: 110 },
          verticalAlign: 'center',
        }),
      ],
    })
  })
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: cols,
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [header, ...body],
  })
}

/** A short teal hairline rule (paragraph border). */
function tealRule() {
  return new Paragraph({
    children: [new TextRun({ text: '', size: 2, font: FONT })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
    spacing: { before: 40, after: 140, line: 20 },
  })
}

/**
 * The cover. Segmented bar → ATMOSFLOW eyebrow → big title → teal rule → by
 * firm → report title + subtitle → teal status banner → meta table → two
 * italic disclaimer lines. NO watermark, ever.
 */
function buildCover(meta) {
  const out = [segmentedBar()]
  out.push(
    new Paragraph({
      children: [new TextRun({ text: 'ATMOSFLOW', bold: true, size: SIZE.eyebrow, color: ACCENT, font: FONT, characterSpacing: 40 })],
      spacing: { before: 200, after: 90 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Indoor Air Quality Assessment', bold: true, size: SIZE.coverTitle, color: SLATE, font: FONT })],
      spacing: { after: 60 },
    }),
    tealRule(),
    p(`by ${meta.firm || 'Prudence Safety & Environmental Consulting, LLC'}`, { color: SOFT, align: AlignmentType.LEFT, after: 200 }),
    new Paragraph({
      children: [new TextRun({ text: meta.reportTitle || 'Screening-Level IAQ Assessment Report', bold: true, size: SIZE.reportTitle, color: SLATE, font: FONT })],
      spacing: { after: 40 },
    }),
  )
  if (meta.coverSubtitle) out.push(p(meta.coverSubtitle, { italics: true, color: SOFT, align: AlignmentType.LEFT, after: 200 }))

  const banner = statusBanner(meta.coverStatusChip || meta.headerLabel)
  if (banner) {
    out.push(banner)
    out.push(afterTable(180))
  }

  out.push(coverMetaTable(meta.coverRows || []))
  out.push(afterTable(160))

  if (meta.coverDisclaimer) out.push(p(meta.coverDisclaimer, { italics: true, color: FAINT, size: SIZE.fine, align: AlignmentType.CENTER, after: 80 }))
  if (meta.coverFooter) out.push(p(meta.coverFooter, { italics: true, color: FAINT, size: SIZE.fine, align: AlignmentType.CENTER, after: 80 }))
  return out
}

// ── Environmental evidence graphs (logger images only) ───────────────────────
//
// Only embeds Logger Studio PNGs already carried on the model. The PDF's
// point-drawn line/dual charts, the CO2 bar chart, and the floor-plan
// schematic are omitted gracefully in DOCX (no vector drawing surface).

const IMG_W = 484
const IMG_H = 300

function buildLoggerImages(logger) {
  if (!logger || !Array.isArray(logger.images) || !logger.images.length) return []
  const out = [h1('3.1 Environmental Evidence Graphs (Logger Studio)', { pageBreakBefore: true })]
  if (logger.disclaimer) out.push(p(logger.disclaimer, { italics: true, color: FAINT, size: SIZE.small, align: AlignmentType.LEFT }))
  if (logger.dataSource) out.push(metaLine(logger.dataSource))
  for (const g of logger.images) {
    if (g.title) out.push(h3(g.title))
    if (isImageDataUrl(g.imageDataUrl)) {
      try {
        out.push(
          new Paragraph({
            children: [new ImageRun({ data: base64ToUint8Array(g.imageDataUrl), transformation: { width: IMG_W, height: IMG_H }, type: inferImageType(g.imageDataUrl) })],
            spacing: { before: 40, after: 80 },
          }),
        )
      } catch {
        /* an unreadable chart must not abort the report */
      }
    }
    if (g.params) out.push(metaLine(g.params))
    if (g.caption) out.push(p(g.caption, { italics: true, color: FAINT, size: SIZE.fine, align: AlignmentType.LEFT }))
  }
  return out
}

// ── Signature block ──────────────────────────────────────────────────────────

function signatureBlock(review) {
  const out = []
  if (review.statement) out.push(p(review.statement))
  out.push(new Paragraph({ children: [new TextRun({ text: '', font: FONT })], spacing: { before: 300, after: 0 } }))
  // The signature rule — a short bottom-bordered paragraph.
  out.push(
    new Paragraph({
      children: [new TextRun({ text: '', size: 2, font: FONT })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: SLATE, space: 1 } },
      indent: { right: Math.max(0, CONTENT_WIDTH_DXA - pct(45)) },
      spacing: { after: 90, line: 20 },
    }),
  )
  if (review.signatureName) out.push(new Paragraph({ children: [new TextRun({ text: review.signatureName, bold: true, size: SIZE.sig, color: INK, font: FONT })], spacing: { after: 20 } }))
  if (review.signatureTitle) out.push(new Paragraph({ children: [new TextRun({ text: review.signatureTitle, size: SIZE.small, color: SOFT, font: FONT })], spacing: { after: 20 } }))
  if (review.signatureFirm) out.push(new Paragraph({ children: [new TextRun({ text: review.signatureFirm, size: SIZE.small, color: SOFT, font: FONT })], spacing: { after: 20 } }))
  if (review.signatureMeta) out.push(new Paragraph({ children: [new TextRun({ text: review.signatureMeta, size: SIZE.small, color: FAINT, font: FONT })], spacing: { after: 40 } }))
  return out
}

// ── Site photographs (2-up grid) ─────────────────────────────────────────────

function photoCell(item, index, width) {
  const children = []
  if (item && isImageDataUrl(item.imageDataUrl)) {
    try {
      children.push(
        new Paragraph({
          children: [new ImageRun({ data: base64ToUint8Array(item.imageDataUrl), transformation: { width: 232, height: 150 }, type: inferImageType(item.imageDataUrl) })],
          spacing: { after: 40 },
        }),
      )
    } catch {
      children.push(p('[image unavailable]', { size: SIZE.fine, color: FAINT, align: AlignmentType.LEFT, after: 40 }))
    }
  } else {
    children.push(p('[no image]', { size: SIZE.fine, color: FAINT, align: AlignmentType.LEFT, after: 40 }))
  }
  children.push(new Paragraph({ children: [new TextRun({ text: `Photo ${index}. ${item ? item.title || '' : ''}`, bold: true, size: SIZE.fine, color: SLATE, font: FONT })], spacing: { after: 0 } }))
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 60, bottom: 120, left: 0, right: 120 },
    verticalAlign: 'top',
  })
}

function photoGrid(items) {
  const half = Math.floor(CONTENT_WIDTH_DXA / 2)
  const rows = []
  for (let i = 0; i < items.length; i += 2) {
    const cells = [photoCell(items[i], i + 1, half)]
    if (i + 1 < items.length) cells.push(photoCell(items[i + 1], i + 2, CONTENT_WIDTH_DXA - half))
    else cells.push(new TableCell({ children: [p('', { after: 0 })], width: { size: CONTENT_WIDTH_DXA - half, type: WidthType.DXA }, borders: noBorders }))
    rows.push(new TableRow({ children: cells }))
  }
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH_DXA - half],
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows,
  })
}

// ── Full report ──────────────────────────────────────────────────────────────

/**
 * Render the AtmosFlow assessment report from the RENDER MODEL (the output of
 * assembleRenderModel in src/report/reportModel.js). Returns the children
 * array for a single Document section, in the AtmosFlow-PDF design. Sections
 * are omitted when their model data is empty, matching render-pdf.js
 * `buildContent`.
 *
 * @param {object} model  the render model (meta, execSummary, findingsAtGlance, …)
 * @returns {Array} paragraphs and tables for the section `children`
 */
export function atmosFlowReportChildren(model) {
  if (!model) return []
  const M = model
  const meta = M.meta || {}
  const out = []

  // Cover (page 1). No watermark is ever drawn.
  out.push(...buildCover(meta))

  // Executive Summary.
  if (M.execSummary) {
    out.push(h1('Executive Summary', { pageBreakBefore: true }))
    out.push(p(M.execSummary))
  }

  // Findings at a Glance.
  if (M.findingsAtGlance && M.findingsAtGlance.length) {
    out.push(h2('Findings at a Glance'))
    out.push(
      docTable(
        [
          { label: 'Parameter', width: 26, render: (r) => ({ t: r.parameter, bold: true }) },
          { label: 'Site range', width: 20, render: (r) => r.range },
          { label: 'Reference basis', width: 34, render: (r) => r.basis },
          { label: 'Screening outcome', width: 20, render: (r) => ({ t: (SEV[r.outcome] || SEV.ok).label, color: (SEV[r.outcome] || SEV.ok).color, bold: true }) },
        ],
        M.findingsAtGlance,
      ),
    )
    out.push(afterTable())
  }

  // Severity Legend.
  if (M.showSeverityLegend) {
    out.push(h2('Severity Legend'))
    out.push(severityChips())
    out.push(afterTable(120))
    if (M.severityLegendNote) out.push(p(M.severityLegendNote, { size: SIZE.small, color: FAINT, align: AlignmentType.LEFT }))
  }

  // Overall Screening Statement.
  if (M.overallStatement) {
    out.push(h2('Overall Screening Statement'))
    out.push(p(M.overallStatement))
  }

  // 1. Scope & Site Description.
  if (M.scope && (M.scope.paras || M.scope.text)) {
    out.push(h1('1. Scope & Site Description', { pageBreakBefore: true }))
    ;(M.scope.paras || [M.scope.text]).filter(Boolean).forEach((para) => out.push(p(para)))
  }

  // 2. Methodology & Instrumentation.
  if (M.methodology) {
    out.push(h2('2. Methodology & Instrumentation'))
    if (M.methodology.bullets && M.methodology.bullets.length) {
      out.push(h3('Direct-reading instrumentation'))
      out.push(...bullets(M.methodology.bullets))
    }
    if (M.methodology.referenceFramework) {
      out.push(h3('Reference framework'))
      out.push(p(M.methodology.referenceFramework))
    }
  }

  // 3. Measurement Results.
  if (M.results) {
    out.push(h1('3. Measurement Results', { pageBreakBefore: true }))
    if (M.results.intro) out.push(p(M.results.intro))
    if (M.results.rows && M.results.rows.length) {
      out.push(
        docTable(
          [
            { label: 'Zone', width: 12, key: 'id' },
            { label: 'Use', width: 22, render: (z) => z.use || '' },
            { label: 'CO₂\nppm', width: 10, align: 'right', render: (z) => fmt(z.co2) },
            { label: 'CO\nppm', width: 9, align: 'right', render: (z) => fmt(z.co) },
            { label: 'T\n°F', width: 8, align: 'right', render: (z) => fmt(z.t) },
            { label: 'RH\n%', width: 7, align: 'right', render: (z) => fmt(z.rh) },
            { label: 'PM2.5\nµg/m³', width: 10, align: 'right', render: (z) => fmt(z.pm) },
            { label: 'TVOC\nµg/m³', width: 10, align: 'right', render: (z) => fmt(z.tvoc) },
            { label: 'Outcome', width: 12, render: (z) => ({ t: (SEV[z.sev] || SEV.ok).label, color: (SEV[z.sev] || SEV.ok).color, bold: true }) },
          ],
          M.results.rows,
          { fontSize: SIZE.tableSm },
        ),
      )
      out.push(afterTable(100))
    }
    if (M.results.note) out.push(metaLine(M.results.note))
    if (M.results.parameters && M.results.parameters.length) {
      out.push(h2('Per-Parameter Interpretation'))
      if (M.results.perParamIntro) out.push(p(M.results.perParamIntro))
      M.results.parameters.forEach((param) => {
        out.push(h3(param.title))
        ;(param.body || []).forEach((b) => out.push(leadParagraph(b)))
      })
    }
  }

  // 3.1 Environmental Evidence Graphs (logger PNGs only; charts omitted).
  out.push(...buildLoggerImages(M.loggerImages))
  // M.co2Bars (peak-CO2 bar chart) is intentionally omitted — no vector chart in DOCX.

  // 4. Findings & Interpretation.
  if (M.findings) {
    out.push(h1('4. Findings & Interpretation', { pageBreakBefore: true }))
    if (M.findings.intro) out.push(p(M.findings.intro))
    if (M.findings.rows && M.findings.rows.length) {
      out.push(
        docTable(
          [
            { label: 'Zone', width: 14, key: 'z' },
            { label: 'Severity', width: 14, render: (r) => ({ t: (SEV[r.sev] || SEV.ok).label, color: (SEV[r.sev] || SEV.ok).color, bold: true }) },
            { label: 'Conf.', width: 12, key: 'conf' },
            { label: 'Screening finding', width: 60, key: 'f' },
          ],
          M.findings.rows,
        ),
      )
      out.push(afterTable())
    }
    if (M.conceptualModel && M.conceptualModel.rows && M.conceptualModel.rows.length) {
      out.push(h2('Conceptual Site Model — Primary Finding'))
      if (M.conceptualModel.intro) out.push(p(M.conceptualModel.intro))
      out.push(
        docTable(
          [
            { label: 'Element', width: 22, render: (r) => ({ t: r[0], bold: true, color: ACCENT_DK }) },
            { label: M.conceptualModel.heading || 'Primary finding', width: 78, render: (r) => r[1] },
          ],
          M.conceptualModel.rows,
        ),
      )
      out.push(afterTable())
    }
    if (M.workingHypotheses && M.workingHypotheses.items && M.workingHypotheses.items.length) {
      out.push(h2('Working Hypotheses (Pending Verification)'))
      if (M.workingHypotheses.intro) out.push(p(M.workingHypotheses.intro))
      out.push(...bullets(M.workingHypotheses.items))
    }
  }

  // 5. Recommended Actions.
  const rec = M.recommendations
  if (rec && ((rec.immediate || []).length || (rec.shortTerm || []).length || (rec.mediumTerm || []).length)) {
    out.push(h1('5. Recommended Actions', { pageBreakBefore: true }))
    if (rec.intro) out.push(p(rec.intro))
    if ((rec.immediate || []).length) {
      out.push(h2('Immediate (0–7 days)'))
      out.push(...bullets(rec.immediate))
    }
    if ((rec.shortTerm || []).length) {
      out.push(h2('Short term (7–30 days)'))
      out.push(...bullets(rec.shortTerm))
    }
    if ((rec.mediumTerm || []).length) {
      out.push(h2(rec.mediumTermLabel || 'Medium term (30–90 days)'))
      out.push(...bullets(rec.mediumTerm))
    }
  }

  // 6. QA/QC · 7. Limitations · 8. Professional Review & Signature.
  const hasQa = M.qaQc && M.qaQc.length
  const hasLim = M.limitations && M.limitations.length
  if (hasQa || hasLim || M.review) {
    if (hasQa) {
      out.push(h1('6. Quality Assurance / Quality Control', { pageBreakBefore: true }))
      out.push(...bullets(M.qaQc))
    }
    if (hasLim) {
      out.push(h2('7. Limitations'))
      M.limitations.forEach((l) => out.push(p(l)))
    }
    if (M.review) {
      out.push(h2('8. Professional Review & Signature'))
      out.push(...signatureBlock(M.review))
    }
  }

  // Appendix A — Standards & References.
  if (M.references && M.references.length) {
    out.push(h1('Appendix A — Standards & References', { pageBreakBefore: true }))
    out.push(
      docTable(
        [
          { label: 'Reference', width: 30, render: (r) => ({ t: r[0], bold: true }) },
          { label: 'Basis of use', width: 70, render: (r) => r[1] },
        ],
        M.references,
      ),
    )
    out.push(afterTable())
  }

  // Appendix B — About AtmosFlow.
  if (M.about && M.about.text) {
    out.push(h2(M.about.title || 'Appendix B — About AtmosFlow'))
    out.push(p(M.about.text))
  }

  // Appendix C — Site Photographs.
  if (M.photos) {
    out.push(h1('Appendix C — Site Photographs', { pageBreakBefore: true }))
    if (M.photos.intro) out.push(p(M.photos.intro))
    if (M.photos.items && M.photos.items.length) {
      out.push(photoGrid(M.photos.items))
      out.push(afterTable())
    } else {
      out.push(p('No project photographs were uploaded.', { color: FAINT, align: AlignmentType.LEFT }))
    }
  }

  return out
}
