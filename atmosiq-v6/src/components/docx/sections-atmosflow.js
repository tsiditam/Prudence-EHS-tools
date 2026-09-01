/**
 * AtmosFlow DOCX — Indoor Air Quality Assessment Report (Figma design).
 *
 * The EDITABLE, WATERMARK-FREE Word deliverable, built to match the AtmosFlow
 * Figma design 1:1. The Figma paint styles, type ramp, spectrum cover bar,
 * teal section labels, teal-header zebra tables, severity pills, per-parameter
 * "What it is / Observed" prose, and the signature block are all reproduced in
 * OOXML — so the .docx reads as the same document the design describes, only
 * editable and with no diagonal watermark (the whole point of the Word twin).
 *
 * It is DATA-DRIVEN from the RENDER MODEL produced by `assembleRenderModel(...)`
 * in src/report/reportModel.js — the same model the PDF renderer draws — so
 * every value (facility, ranges, findings, recommendations, signature, chrome)
 * comes from the real assessment, never a hardcoded fixture. This file never
 * rewords the model's prose; the narrative is authored, screening-safe, and
 * placed verbatim.
 *
 * ── Type system ────────────────────────────────────────────────────────
 * The AtmosFlow report has its OWN reviewed type system (as the monitoring
 * report does). The design face is Open Sans, named ONCE in the `F` const and
 * referenced through that variable everywhere — never as a quoted family
 * literal (the DOCX font guard, tests/components/docx-fonts.test.js, scans this
 * directory and fails on a quoted font-family literal, comments included).
 *
 * ── Editorial suppressions ─────────────────────────────────────────────
 * This renderer reads the render-model, which does NOT carry engine
 * findingIds. Editorial-suppression handling therefore does not apply here and
 * is deliberately not attempted (it remains on the Consultant Report,
 * sections-v21client.js). No `editorialSuppressions` are read.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  VerticalAlign,
  HeightRule,
  Header,
  Footer,
  PageNumber,
  TabStopType,
  LevelFormat,
  ImageRun,
} from 'docx'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'

// ── TOKENS (mirror the Figma paint styles) ─────────────────────────────────
const F = 'Open Sans'
const INK = '1F2D3D' // headings
const BODY = '2E3B48' // body copy
const TEAL = '2E7B9B' // brand / section labels / table headers
const TEALPALE = 'E4F0F5' // emphasis (site mean) row
const ALT = 'EFF3F6' // zebra row
const HAIR = 'E8EDF1' // hairlines
const MUTED = '8A97A0'
const WHITE = 'FFFFFF'
const PILL = { grn: '4A8B4F', amb: 'C1762E', org: 'C05621', red: 'A93226' }
const SPECTRUM = ['06B6D4', '3B82F6', 'F97316', '8B5CF6', 'F59E0B', '10B981', '2E7B9B']

const CW = 9360 // content width in DXA (8.5in − 2in margins)

// Screening severity token → { label, colour } for outcome text and pills.
const SEV = {
  ok: { label: 'Acceptable', color: '2E7D32' },
  advisory: { label: 'Advisory', color: PILL.amb },
  elevated: { label: 'Elevated', color: PILL.org },
  priority: { label: 'Priority', color: PILL.red },
  // A parameter that was MEASURED but is not compared to anything — TVOC
  // since 2026-08, when the Mølhave tiers were removed. Neutral grey, and
  // deliberately not green: falling through to "Acceptable" would state a
  // verdict the platform has no basis for, which is the more dangerous of the
  // two ways to get an unjudgeable reading wrong.
  not_evaluated: { label: 'Not evaluated', color: '6B7380' },
}
const sev = (t) => SEV[t] || SEV.ok
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))

// Split "Lead-in: remainder" once, for the bold-lead paragraphs and the
// two-column QA/QC rows. Returns [leadWithColonSpace, rest] or null.
function splitLead(s) {
  const str = String(s ?? '')
  const i = str.indexOf(': ')
  if (i < 0 || i > 70) return null
  return [str.slice(0, i + 2), str.slice(i + 2)]
}
function splitLabelValue(s) {
  const str = String(s ?? '')
  const i = str.indexOf(': ')
  if (i < 0) return [str, '']
  return [str.slice(0, i), str.slice(i + 2)]
}

// ── PRIMITIVES (ported from the Figma generator) ────────────────────────────
const sp = (h) =>
  new Paragraph({ spacing: { after: h, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', font: F, size: 2 })] })

const p = (text, o = {}) =>
  new Paragraph({
    alignment: o.align || AlignmentType.LEFT,
    spacing: { before: o.before ?? 0, after: o.after ?? 130, line: o.line ?? 300 },
    children: [
      new TextRun({
        text: String(text ?? ''),
        font: F,
        size: o.size || 21,
        bold: !!o.bold,
        italics: !!o.italics,
        color: o.color || BODY,
        ...(o.ls ? { characterSpacing: o.ls } : {}),
      }),
    ],
  })

// Section heading — no rule, matching the design.
const h1 = (t, o = {}) =>
  new Paragraph({
    pageBreakBefore: !!o.pbb,
    spacing: { before: o.before ?? 0, after: o.after ?? 145, line: 250 },
    children: [new TextRun({ text: t, font: F, size: 36, bold: true, color: INK })],
  })

// Teal all-caps label with a hairline underneath.
const label = (t) => [
  new Paragraph({
    spacing: { before: 190, after: 130, line: 262 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 5 } },
    children: [new TextRun({ text: String(t).toUpperCase(), font: F, size: 20, bold: true, color: TEAL, characterSpacing: 12 })],
  }),
]

// Teal sub-heading.
const h2 = (t, o = {}) =>
  new Paragraph({
    pageBreakBefore: !!o.pbb,
    spacing: { before: 160, after: 50, line: 258 },
    children: [new TextRun({ text: t, font: F, size: 22, bold: true, color: TEAL })],
  })

// Justified body paragraph.
const body = (t, o = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: o.before ?? 0, after: o.after ?? 106, line: 286 },
    children: [new TextRun({ text: String(t ?? ''), font: F, size: 20, color: BODY })],
  })

// Bold lead-in + justified remainder ("Observed: …").
const lead = (b, rest, o = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: o.before ?? 0, after: o.after ?? 106, line: 286 },
    children: [
      new TextRun({ text: b, font: F, size: 20, bold: true, color: INK }),
      new TextRun({ text: rest, font: F, size: 20, color: BODY }),
    ],
  })

const bullet = (t, o = {}) =>
  new Paragraph({
    numbering: { reference: 'af-bullets', level: 0 },
    spacing: { after: o.after ?? 72, line: 282 },
    children: [new TextRun({ text: String(t ?? ''), font: F, size: 21, color: BODY })],
  })

const caption = (t) =>
  new Paragraph({
    spacing: { before: 78, after: 40, line: 255 },
    children: [new TextRun({ text: String(t ?? ''), font: F, size: 18, italics: true, color: MUTED })],
  })

const cell = (text, o = {}) =>
  new TableCell({
    width: { size: o.width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    margins: { top: 78, bottom: 78, left: 125, right: 125 },
    verticalAlign: VerticalAlign.CENTER,
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: o.noRule ? BorderStyle.NONE : BorderStyle.SINGLE, size: 2, color: HAIR },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    },
    children: (Array.isArray(text) ? text : [text]).map(
      (line) =>
        new Paragraph({
          alignment: o.align || AlignmentType.LEFT,
          spacing: { after: 0, line: 262 },
          children: [
            new TextRun({
              text: String(line ?? ''),
              font: F,
              size: o.head ? 19 : 20,
              bold: o.head || o.bold || false,
              color: o.head ? WHITE : o.color || BODY,
            }),
          ],
        }),
    ),
  })

const table = (headers, rows, widths, o = {}) =>
  new Table({
    columnWidths: widths,
    width: { size: CW, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) =>
          cell(h, { head: true, fill: TEAL, width: widths[i], noRule: true, align: (o.align && o.align[i]) || AlignmentType.LEFT }),
        ),
      }),
      ...rows.map((r, ri) => {
        const emph = o.emphRows && o.emphRows.includes(ri)
        const fill = emph ? TEALPALE : ri % 2 === 1 ? ALT : undefined
        return new TableRow({
          children: r.map((cVal, ci) => {
            const s = (o.cellSpec && o.cellSpec(ri, ci)) || {}
            return cell(cVal, {
              width: widths[ci],
              fill,
              align: (o.align && o.align[ci]) || AlignmentType.LEFT,
              bold: s.bold !== undefined ? s.bold : emph || ci === 0,
              color: s.color,
            })
          }),
        })
      }),
    ],
  })

// Full-width teal status banner — white centred bold caps.
function statusBanner(text) {
  const t = String(text || '').toUpperCase()
  if (!t) return null
  return new Table({
    columnWidths: [CW],
    width: { size: CW, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CW, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: TEAL },
            margins: { top: 165, bottom: 165, left: 160, right: 160 },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: t, font: F, size: 22, bold: true, color: WHITE, characterSpacing: 36 })],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// Full-width single-cell soft card holding one centred italic line.
function placeholderCard(text) {
  return new Table({
    columnWidths: [CW],
    width: { size: CW, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CW, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: ALT },
            margins: { top: 620, bottom: 620, left: 260, right: 260 },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(text || ''), font: F, size: 22, italics: true, color: MUTED })],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// An embedded image paragraph (logger chart / photo), sized to the content
// width. Silently skipped if the data URL is unreadable — a bad image must
// never abort the report.
function imageParagraph(dataUrl, width, height) {
  if (!isImageDataUrl(dataUrl)) return null
  try {
    return new Paragraph({
      spacing: { before: 40, after: 60 },
      children: [
        new ImageRun({ data: base64ToUint8Array(dataUrl), transformation: { width, height }, type: inferImageType(dataUrl) }),
      ],
    })
  } catch {
    return null
  }
}

// ── The cover ───────────────────────────────────────────────────────────────
function buildCover(meta) {
  const out = []

  // Spectrum accent bar across the very top.
  out.push(
    new Table({
      columnWidths: SPECTRUM.map(() => Math.floor(CW / 7)),
      width: { size: CW, type: WidthType.DXA },
      rows: [
        new TableRow({
          height: { value: 130, rule: HeightRule.EXACT },
          children: SPECTRUM.map(
            (col) =>
              new TableCell({
                width: { size: Math.floor(CW / 7), type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: col },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                borders: {
                  top: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                },
                children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: '', font: F, size: 2 })] })],
              }),
          ),
        }),
      ],
    }),
  )

  out.push(sp(1500))
  out.push(p('ATMOSFLOW', { size: 20, bold: true, color: TEAL, ls: 60, after: 90, line: 260 }))
  out.push(
    new Paragraph({
      spacing: { before: 60, after: 130, line: 300 },
      children: [new TextRun({ text: 'Indoor Air Quality Assessment', font: F, size: 52, bold: true, color: INK })],
    }),
  )
  // Short teal accent rule.
  out.push(
    new Paragraph({
      spacing: { after: 180 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 22, color: TEAL, space: 2 } },
      children: [new TextRun({ text: ' '.repeat(9), font: F, size: 8 })],
    }),
  )
  out.push(p(`by ${meta.firm || 'Prudence Safety & Environmental Consulting, LLC'}`, { size: 21, color: MUTED, after: 460 }))
  out.push(p(meta.reportTitle || 'Indoor Air Quality Assessment Report', { size: 30, bold: true, color: INK, after: 80 }))
  if (meta.coverSubtitle) out.push(p(meta.coverSubtitle, { size: 21, italics: true, color: MUTED, after: 420 }))

  const banner = statusBanner(meta.coverStatusChip || meta.headerLabel)
  if (banner) {
    out.push(banner)
    out.push(sp(480))
  }

  out.push(table(['Field', 'Value'], (meta.coverRows || []).map(([k, v]) => [k, fmt(v)]), [3319, 6041], { cellSpec: (r, ci) => ({ bold: ci === 0 }) }))
  out.push(sp(420))

  if (meta.coverDisclaimer) out.push(p(meta.coverDisclaimer, { size: 19, italics: true, color: MUTED, after: 80 }))
  if (meta.coverFooter) out.push(p(meta.coverFooter, { size: 19, italics: true, color: MUTED, after: 0 }))
  return out
}

// ── Full report body ─────────────────────────────────────────────────────────

/**
 * Render the AtmosFlow assessment report body from the RENDER MODEL (the output
 * of assembleRenderModel in src/report/reportModel.js). Returns the children
 * array for the single Document section, in the Figma design. Sections are
 * omitted when their model data is empty.
 *
 * @param {object} model  the render model (meta, execSummary, findingsAtGlance, …)
 * @returns {Array} paragraphs and tables for the section `children`
 */
export function atmosFlowReportChildren(model) {
  if (!model) return []
  const M = model
  const meta = M.meta || {}
  const c = []

  // ═══ Cover ═══ (no watermark, ever)
  c.push(...buildCover(meta))

  // ═══ Executive Summary ═══
  if (M.execSummary) {
    c.push(h1('Executive Summary', { pbb: true }))
    c.push(body(M.execSummary))
  }

  // Findings at a glance.
  if (M.findingsAtGlance && M.findingsAtGlance.length) {
    const rows = M.findingsAtGlance
    c.push(...label('Findings at a glance'))
    c.push(
      table(
        ['Parameter', 'Site range', 'Reference basis', 'Outcome'],
        rows.map((r) => [r.parameter, r.range, r.basis, sev(r.outcome).label]),
        [2660, 1380, 3160, 2160],
        { cellSpec: (r, ci) => (ci === 3 ? { bold: true, color: sev(rows[r].outcome).color } : { bold: ci === 0 }) },
      ),
    )
  }

  // Severity legend.
  if (M.showSeverityLegend) {
    c.push(...label('Severity legend'))
    c.push(
      new Table({
        columnWidths: [2340, 2340, 2340, 2340],
        width: { size: CW, type: WidthType.DXA },
        rows: [
          new TableRow({
            children: [
              ['ACCEPTABLE', PILL.grn],
              ['ADVISORY', PILL.amb],
              ['ELEVATED', PILL.org],
              ['PRIORITY', PILL.red],
            ].map(
              ([t, col]) =>
                new TableCell({
                  width: { size: 2340, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: col },
                  margins: { top: 105, bottom: 105, left: 90, right: 90 },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 12, color: WHITE },
                    bottom: { style: BorderStyle.SINGLE, size: 12, color: WHITE },
                    left: { style: BorderStyle.SINGLE, size: 12, color: WHITE },
                    right: { style: BorderStyle.SINGLE, size: 12, color: WHITE },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: t, font: F, size: 18, bold: true, color: WHITE, characterSpacing: 10 })],
                    }),
                  ],
                }),
            ),
          }),
        ],
      }),
    )
    if (M.severityLegendNote) c.push(caption(M.severityLegendNote))
  }

  // Overall statement.
  if (M.overallStatement) {
    c.push(...label('Overall statement'))
    c.push(body(M.overallStatement, { after: 0 }))
  }

  // ═══ 1. Scope & Site Description ═══
  if (M.scope && (M.scope.paras || M.scope.text)) {
    c.push(h1('1. Scope & Site Description', { pbb: true }))
    ;(M.scope.paras || [M.scope.text]).filter(Boolean).forEach((para) => c.push(body(para)))
  }

  // ═══ 2. Methodology & Instrumentation ═══
  if (M.methodology) {
    c.push(h1('2. Methodology & Instrumentation', { before: 330 }))
    if (M.methodology.bullets && M.methodology.bullets.length) {
      c.push(h2('Direct-reading instrumentation'))
      M.methodology.bullets.forEach((b) => c.push(bullet(b)))
    }
    if (M.methodology.referenceFramework) {
      c.push(h2('Reference framework'))
      c.push(body(M.methodology.referenceFramework, { after: 0 }))
    }
  }

  // ═══ 3. Measurement Results ═══
  if (M.results) {
    const CEN = AlignmentType.CENTER
    c.push(h1('3. Measurement Results', { pbb: true }))
    if (M.results.intro) c.push(body(M.results.intro))
    if (M.results.rows && M.results.rows.length) {
      const rows = M.results.rows
      const emphRows = rows.map((r, i) => (r.__bold ? i : -1)).filter((i) => i >= 0)
      c.push(
        table(
          ['Zone', 'Use', ['CO₂', 'ppm'], ['CO', 'ppm'], ['T', '°F'], ['RH', '%'], ['PM2.5', 'µg/m³'], ['TVOC', 'µg/m³'], 'Outcome'],
          rows.map((z) => [fmt(z.id), fmt(z.use), fmt(z.co2), fmt(z.co), fmt(z.t), fmt(z.rh), fmt(z.pm), fmt(z.tvoc), sev(z.sev).label]),
          [1333, 789, 871, 789, 735, 680, 1034, 1034, 2095],
          {
            align: [null, null, CEN, CEN, CEN, CEN, CEN, CEN, null],
            emphRows,
            cellSpec: (r, ci) => (ci === 8 ? { bold: true, color: sev(rows[r].sev).color } : {}),
          },
        ),
      )
      if (M.results.note) c.push(caption(M.results.note))
    }
    if (M.results.parameters && M.results.parameters.length) {
      c.push(...label('Per-parameter interpretation'))
      if (M.results.perParamIntro) c.push(body(M.results.perParamIntro))
      M.results.parameters.forEach((param, pi) => {
        c.push(h2(param.title, pi === 0 ? {} : { pbb: false }))
        ;(param.body || []).forEach((line, li, arr) => {
          const isLast = li === arr.length - 1
          const parts = splitLead(line)
          if (parts) c.push(lead(parts[0], parts[1], isLast ? { after: 0 } : {}))
          else c.push(body(line, isLast ? { after: 0 } : {}))
        })
      })
    }
  }

  // 3.1 Environmental Evidence Graphs (logger PNGs only; vector charts omitted
  // — DOCX has no drawing surface). M.co2Bars is intentionally skipped.
  if (M.loggerImages && Array.isArray(M.loggerImages.images) && M.loggerImages.images.length) {
    c.push(h1('3.1 Environmental Evidence Graphs (Logger Studio)', { pbb: true }))
    if (M.loggerImages.disclaimer) c.push(caption(M.loggerImages.disclaimer))
    if (M.loggerImages.dataSource) c.push(caption(M.loggerImages.dataSource))
    M.loggerImages.images.forEach((g) => {
      if (g.title) c.push(h2(g.title))
      const img = imageParagraph(g.imageDataUrl, 620, 256)
      if (img) c.push(img)
      if (g.caption) c.push(caption(g.caption))
    })
  }

  // ═══ 4. Findings & Interpretation ═══
  if (M.findings) {
    c.push(h1('4. Findings & Interpretation', { pbb: true }))
    if (M.findings.intro) c.push(body(M.findings.intro))
    if (M.findings.rows && M.findings.rows.length) {
      const rows = M.findings.rows
      c.push(
        table(
          ['Zone', 'Severity', 'Conf.', 'Finding'],
          rows.map((r) => [fmt(r.z), sev(r.sev).label, fmt(r.conf), fmt(r.f)]),
          [1605, 1442, 1088, 5225],
          { cellSpec: (r, ci) => (ci === 1 ? { bold: true, color: sev(rows[r].sev).color } : { bold: ci === 0 }) },
        ),
      )
    }
    // Conceptual site model — primary finding.
    if (M.conceptualModel && M.conceptualModel.rows && M.conceptualModel.rows.length) {
      const rows = M.conceptualModel.rows
      const confIdx = rows.findIndex((row) => String(row[0]).toLowerCase() === 'confidence')
      c.push(...label('Conceptual site model — primary finding'))
      if (M.conceptualModel.intro) c.push(body(M.conceptualModel.intro))
      c.push(
        table(
          ['Element', M.conceptualModel.heading || 'Primary finding'],
          rows.map(([k, v]) => [fmt(k), fmt(v)]),
          [2503, 6857],
          { cellSpec: (r, ci) => (r === confIdx && ci === 1 ? { bold: true, color: TEAL } : { bold: ci === 0 }) },
        ),
      )
    }
    // Working hypotheses.
    if (M.workingHypotheses && M.workingHypotheses.items && M.workingHypotheses.items.length) {
      c.push(...label('Working hypotheses (pending verification)'))
      if (M.workingHypotheses.intro) c.push(body(M.workingHypotheses.intro))
      M.workingHypotheses.items.forEach((it, i, arr) => c.push(bullet(it, i === arr.length - 1 ? { after: 0 } : {})))
    }
  }

  // ═══ 5. Recommended Actions ═══
  const rec = M.recommendations
  if (rec && ((rec.immediate || []).length || (rec.shortTerm || []).length || (rec.mediumTerm || []).length)) {
    c.push(h1('5. Recommended Actions', { pbb: true }))
    if (rec.intro) c.push(body(rec.intro))
    if ((rec.immediate || []).length) {
      c.push(...label('Immediate (0–7 days)'))
      rec.immediate.forEach((it) => c.push(bullet(it)))
    }
    if ((rec.shortTerm || []).length) {
      c.push(...label('Short term (7–30 days)'))
      rec.shortTerm.forEach((it) => c.push(bullet(it)))
    }
    if ((rec.mediumTerm || []).length) {
      c.push(...label(rec.mediumTermLabel || 'Medium term (30–90 days)'))
      rec.mediumTerm.forEach((it, i, arr) => c.push(bullet(it, i === arr.length - 1 ? { after: 0 } : {})))
    }
  }

  // ═══ 6. QA/QC ═══
  if (M.qaQc && M.qaQc.length) {
    c.push(h1('6. Quality Assurance / Quality Control', { pbb: true }))
    c.push(
      table(['Item', 'Record'], M.qaQc.map((q) => splitLabelValue(q)), [2721, 6639], { cellSpec: (r, ci) => ({ bold: ci === 0 }) }),
    )
  }

  // ═══ 7. Limitations ═══
  if (M.limitations && M.limitations.length) {
    c.push(h1('7. Limitations', { before: 340 }))
    M.limitations.forEach((l) => c.push(bullet(l)))
  }

  // ═══ 8. Professional Review & Signature ═══
  if (M.review) {
    const r = M.review
    c.push(h1('8. Professional Review & Signature', { before: 340 }))
    if (r.statement) c.push(body(r.statement))
    c.push(sp(500))
    c.push(
      new Paragraph({
        spacing: { after: 130 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: TEAL, space: 2 } },
        children: [new TextRun({ text: ' '.repeat(38), font: F, size: 8 })],
      }),
    )
    if (r.signatureName) c.push(p(r.signatureName, { size: 26, bold: true, color: INK, after: 60 }))
    if (r.signatureTitle) c.push(p(r.signatureTitle, { size: 20, color: MUTED, after: 30 }))
    if (r.signatureFirm) c.push(p(r.signatureFirm, { size: 20, color: MUTED, after: 250 }))
    if (r.signatureMeta) c.push(p(r.signatureMeta, { size: 18, italics: true, color: MUTED, after: 0 }))
  }

  // ═══ Appendix A — Standards & References ═══
  if (M.references && M.references.length) {
    c.push(h1('Appendix A — Standards & References', { pbb: true }))
    c.push(
      table(['Reference', 'Basis of use'], M.references.map(([ref, basis]) => [fmt(ref), fmt(basis)]), [3129, 6231], {
        cellSpec: (r, ci) => ({ bold: ci === 0 }),
      }),
    )
  }

  // ═══ Appendix B — About AtmosFlow ═══
  if (M.about && M.about.text) {
    c.push(h1(M.about.title || 'Appendix B — About AtmosFlow', { before: 400 }))
    c.push(body(M.about.text))
    c.push(p('Learn more at atmosflow.net.', { size: 21, bold: true, color: TEAL, after: 0 }))
  }

  // ═══ Appendix C — Site Photographs ═══
  if (M.photos) {
    c.push(h1('Appendix C — Site Photographs', { pbb: true }))
    const items = (M.photos.items || []).filter((it) => it && isImageDataUrl(it.imageDataUrl))
    if (items.length) {
      if (M.photos.intro) c.push(body(M.photos.intro))
      items.forEach((it, i) => {
        const img = imageParagraph(it.imageDataUrl, 620, 400)
        if (img) c.push(img)
        c.push(caption(`Photo ${i + 1}. ${it.title || ''}${it.sub ? ` — ${it.sub}` : ''}`))
      })
    } else {
      c.push(placeholderCard(M.photos.intro || 'No project photographs were uploaded.'))
    }
  }

  return c
}

/** Document-level defaults — Open Sans, scoped to the AtmosFlow report only. */
export const ATMOSFLOW_STYLES = { default: { document: { run: { font: F, size: 21, color: BODY } } } }

/** The teal bullet used throughout the AtmosFlow report. */
export const ATMOSFLOW_NUMBERING = {
  config: [
    {
      reference: 'af-bullets',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 380, hanging: 230 } }, run: { color: TEAL, bold: true, font: F } },
        },
      ],
    },
  ],
}

/**
 * The single document section — the Figma page geometry (Letter, its own
 * margins), the running header/footer, and the report body. The header's
 * right-hand label and the footer's left note are data-driven from the model
 * chrome so the running furniture states the report's real status.
 */
export function atmosFlowSections(model) {
  const meta = (model && model.meta) || {}
  const headerLabel = meta.headerLabel || 'Draft'
  const footerNote = meta.footerNote || meta.reportId || ''
  return [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1330, right: 1440, bottom: 1220, left: 1440 },
        },
        titlePage: true,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: CW }],
              spacing: { after: 260 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 5 } },
              children: [
                new TextRun({ text: 'AtmosFlow', font: F, size: 18, bold: true, color: TEAL }),
                new TextRun({ text: '  ·  Indoor Air Quality Assessment', font: F, size: 18, color: MUTED }),
                new TextRun({ text: '\t', font: F, size: 18 }),
                new TextRun({ text: headerLabel, font: F, size: 18, color: MUTED }),
              ],
            }),
          ],
        }),
        first: new Header({ children: [new Paragraph({ children: [] })] }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: CW }],
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: HAIR, space: 7 } },
              children: [
                new TextRun({ text: footerNote, font: F, size: 16, color: MUTED }),
                new TextRun({ text: '\t', font: F, size: 16 }),
                new TextRun({ text: 'Page ', font: F, size: 16, color: MUTED }),
                new TextRun({ children: [PageNumber.CURRENT], font: F, size: 16, color: MUTED }),
                new TextRun({ text: ' of ', font: F, size: 16, color: MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: F, size: 16, color: MUTED }),
              ],
            }),
          ],
        }),
        first: new Footer({ children: [new Paragraph({ children: [] })] }),
      },
      children: atmosFlowReportChildren(model),
    },
  ]
}

/**
 * Build the whole AtmosFlow assessment DOCX Document from a render model.
 * Kept here so the module owns its complete page geometry, numbering, and
 * chrome; DocxReport just assembles the model and calls this.
 */
export function buildAtmosFlowDoc(model, opts = {}) {
  const meta = (model && model.meta) || {}
  return new Document({
    creator: opts.creator || 'AtmosFlow — Prudence EHS',
    title: meta.docTitle || 'AtmosFlow — Indoor Air Quality Assessment',
    description: opts.description || 'Indoor Air Quality Assessment Report',
    styles: ATMOSFLOW_STYLES,
    numbering: ATMOSFLOW_NUMBERING,
    sections: atmosFlowSections(model),
  })
}

// Packer re-export keeps the module self-contained for any caller that wants a
// blob without importing docx separately.
export { Packer as AtmosFlowPacker }
