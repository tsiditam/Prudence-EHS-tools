/**
 * AtmosFlow DOCX — Indoor Environmental Monitoring Report.
 *
 * The presentation half of the report pipeline. Everything about WHAT the
 * report says — section order, which sections appear, the numbers, the
 * wording — is decided in `src/utils/monitoringReportModel.js` and arrives
 * here as plain data. This module decides only how it looks.
 *
 * ── The visual system ──────────────────────────────────────────────────
 * Carried over from the reviewed design, and deliberately restrained: this
 * should read like an engineering or forensic report, not marketing collateral.
 *
 *   • NUMBERED SECTIONS (01, 02, 03 …). The numerals are not decoration —
 *     they tell a reader the document follows a methodology, and they let a
 *     figure caption or a cover letter cite "§05" unambiguously.
 *   • A single restrained teal accent, used only for the section numerals,
 *     rules, and the insights panel. Never on body text.
 *   • The SUMMARY STRIP renders as large figures under small uppercase
 *     labels, so mean / maximum / 95th / % above / time above are readable
 *     at a glance rather than buried in a data table.
 *   • A STATUS CHIP: tinted fill, colored label, following the severity of
 *     the status itself.
 *   • A MONITORING INSIGHTS panel: tinted block with an accent left rule, so
 *     the deterministic observations read as a distinct element.
 *
 * Word has no CSS, so a "pill" is a shaded single-cell table and a "chip" is
 * a shaded cell — the structure survives, which is what matters in print.
 */

import {
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx'
import { FONTS, COLORS } from './styles'
import { CONTENT_WIDTH_DXA } from './page-setup'
import { buildTable, kvTable } from './tables'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'

/**
 * The report's palette. Neutrals come from the shared report tokens so the
 * document sits beside the consultant report; the accent is the restrained
 * teal from the reviewed design (deep enough to print cleanly, quiet enough
 * not to read as marketing).
 */
const ACCENT = '0E7490'
const ACCENT_TINT = 'F0F9FB'
const INK = COLORS.text
const MUTED = COLORS.muted
const HAIR = COLORS.border

// Status tones. Semantic, and separate from the accent.
const TONES = {
  ok: { text: '0E7A55', fill: 'ECFAF3' },
  warn: { text: '8A5106', fill: 'FDF5EA' },
  review: { text: 'A62121', fill: 'FDEFEF' },
}

const p = (text, opts = {}) =>
  new Paragraph({
    children: [
      new TextRun({
        text: String(text ?? ''),
        italics: !!opts.italics,
        bold: !!opts.bold,
        color: opts.color,
        size: opts.size,
        font: FONTS.body,
      }),
    ],
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
    alignment: opts.align,
  })

const noBorder = { style: 'none', size: 0, color: 'FFFFFF' }
const hairBorder = { style: 'single', size: 1, color: HAIR }

/**
 * A numbered section heading — "01  Monitoring objective" with the numeral in
 * the accent and a hairline rule beneath, mirroring the reviewed design.
 * Pass `num = null` for an unnumbered heading (appendices).
 */
export function sectionHeading(num, title) {
  const children = []
  if (num != null) {
    children.push(
      new TextRun({ text: String(num).padStart(2, '0'), bold: true, size: 18, color: ACCENT, font: FONTS.body }),
      new TextRun({ text: '   ', size: 18, font: FONTS.body }),
    )
  }
  children.push(new TextRun({ text: title, bold: true, size: 26, color: INK, font: FONTS.body }))
  return new Paragraph({
    children,
    spacing: { before: 360, after: 140 },
    border: { bottom: { style: 'single', size: 1, color: HAIR } },
  })
}

const h3 = (text) =>
  new Paragraph({
    children: [new TextRun({ text, bold: true, size: 18, color: MUTED, font: FONTS.body })],
    spacing: { before: 200, after: 80 },
  })

/** The status chip — a shaded cell whose colour follows the status tone. */
export function statusChip(status) {
  if (!status) return null
  const tone = TONES[status.tone] || TONES.warn
  return new Table({
    width: { size: 2600, type: WidthType.DXA },
    columnWidths: [2600],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: status.label, bold: true, size: 18, color: tone.text, font: FONTS.body })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
            ],
            shading: { type: ShadingType.CLEAR, fill: tone.fill },
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
            margins: { top: 70, bottom: 70, left: 120, right: 120 },
          }),
        ],
      }),
    ],
  })
}

/**
 * The summary strip: large figures under small uppercase labels.
 * `emphasis` tiles (time above / % above a reference) take the warn colour so
 * the exposure figures carry from across the page.
 */
export function summaryStripTable(tiles) {
  if (!tiles || !tiles.length) return null
  const width = Math.floor(CONTENT_WIDTH_DXA / tiles.length)
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: tiles.map(() => width),
    rows: [
      new TableRow({
        children: tiles.map(
          (t) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: String(t.label).toUpperCase(), bold: true, size: 13, color: MUTED, font: FONTS.body }),
                  ],
                  spacing: { after: 40 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: String(t.value),
                      bold: true,
                      size: 28,
                      color: t.emphasis ? TONES.warn.text : INK,
                      font: FONTS.body,
                    }),
                  ],
                  spacing: { after: 0 },
                }),
              ],
              width: { size: width, type: WidthType.DXA },
              borders: { top: hairBorder, bottom: hairBorder, left: noBorder, right: noBorder },
              margins: { top: 110, bottom: 110, left: 110, right: 110 },
            }),
        ),
      }),
    ],
  })
}

/** The Monitoring Insights panel — tinted block with an accent left rule. */
export function insightsPanel(items) {
  if (!items || !items.length) return null
  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'MONITORING INSIGHTS', bold: true, size: 14, color: ACCENT, font: FONTS.body })],
      spacing: { after: 100 },
    }),
    ...items.map(
      (i) =>
        new Paragraph({
          children: [new TextRun({ text: i.text, size: 19, color: COLORS.body, font: FONTS.body })],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }),
    ),
  ]
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children,
            shading: { type: ShadingType.CLEAR, fill: ACCENT_TINT },
            borders: {
              top: noBorder,
              bottom: noBorder,
              right: noBorder,
              left: { style: 'single', size: 12, color: ACCENT },
            },
            margins: { top: 140, bottom: 140, left: 160, right: 160 },
          }),
        ],
      }),
    ],
  })
}

// The embedded chart matches the capture aspect used elsewhere in the report.
const IMG_W = 600
const IMG_H = Math.round(600 * (284 / 664))

/** Cover: masthead rule, accent eyebrow, title, subtitle, site, meta grid. */
export function buildCoverSection(model) {
  const c = (model && model.cover) || {}
  const out = [
    // Masthead — firm identity above a heavy rule, as on the reviewed design.
    new Paragraph({
      children: [
        new TextRun({ text: 'AtmosFlow', bold: true, size: 22, color: INK, font: FONTS.body }),
        new TextRun({ text: '   Prudence Safety & Environmental Consulting, LLC', size: 16, color: MUTED, font: FONTS.body }),
      ],
      spacing: { after: 80 },
      border: { bottom: { style: 'single', size: 8, color: INK } },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'INDOOR ENVIRONMENTAL MONITORING', bold: true, size: 15, color: ACCENT, font: FONTS.body }),
      ],
      spacing: { before: 320, after: 100 },
    }),
    // Built from explicit runs rather than HeadingLevel.TITLE: Word's built-in
    // Title style overrides the document theme with its own face and colour
    // (Calibri Light, blue), which is why the title did not match the rest of
    // the report.
    new Paragraph({
      children: [new TextRun({ text: model.title, bold: true, size: 52, color: INK, font: FONTS.body })],
      spacing: { after: 60 },
    }),
    p(model.subtitle, { color: MUTED, size: 24, after: 180 }),
  ]
  if (c.site) out.push(p(c.site, { bold: true, size: 26, after: 200 }))

  const rows = [
    ['Prepared for', c.preparedFor],
    ['Prepared by', c.preparedBy],
    ['Report date', c.reportDate],
    ['Monitoring period', c.periodStart && c.periodEnd ? `${c.periodStart} – ${c.periodEnd}` : null],
    ['Duration', c.duration],
    ['Parameters', (c.parameters || []).join(' · ')],
  ].filter(([, v]) => v)

  if (rows.length) out.push(kvTable(rows))
  return { title: model.title, children: out }
}

/** §01 Monitoring objective — why monitoring was performed. */
export function buildObjectiveSection(model, num) {
  if (!model || !model.objective) return null
  return {
    title: 'Monitoring objective',
    children: [sectionHeading(num, 'Monitoring objective'), p(model.objective)],
  }
}

/** §02 Location and instrument, as the two tables an IH report expects. */
export function buildLocationInstrumentSection(model, num) {
  const loc = (model && model.location) || []
  const inst = (model && model.instrument) || []
  if (!loc.length && !inst.length) return null

  const out = [sectionHeading(num, 'Location & instrument')]
  if (loc.length) {
    out.push(h3('MONITORING LOCATION'))
    out.push(kvTable(loc.map((r) => [r.label, r.value])))
  }
  if (inst.length) {
    out.push(h3('INSTRUMENT CONFIGURATION'))
    out.push(kvTable(inst.map((r) => [r.label, r.value])))
  }
  // An undocumented calibration is stated, never left to inference.
  if (model && model.calibrationNote) {
    out.push(p(model.calibrationNote, { italics: true, color: MUTED, size: 18, before: 100 }))
  }
  return { title: 'Location & instrument', children: out }
}

/** §03 Key dataset highlights. */
export function buildHighlightsSection(model, num) {
  const items = (model && model.highlights) || []
  if (!items.length) return null
  return {
    title: 'Key dataset highlights',
    children: [
      sectionHeading(num, 'Key dataset highlights'),
      ...items.map(
        (i) =>
          new Paragraph({
            children: [new TextRun({ text: i.text, size: 21, color: COLORS.body, font: FONTS.body })],
            bullet: { level: 0 },
            spacing: { after: 90 },
          }),
      ),
    ],
  }
}

/**
 * §04 Screening reference values — one consolidated table, so each figure
 * caption can point back here instead of repeating the citation.
 */
export function buildReferenceSection(model, num) {
  const rows = (model && model.referenceRows) || []
  if (!rows.length) return null

  const out = [
    sectionHeading(num, 'Screening reference values'),
    p('Each parameter is compared to the screening reference selected for this monitoring session.', {
      color: MUTED,
      size: 18,
    }),
    buildTable(
      ['Parameter', 'Reference profile', 'Screening value', 'Source'],
      rows.map((r) => [r.label || r.param, r.profile, r.value, r.source || '—']),
    ),
  ]

  // Framing that must travel with the reference wherever it is cited.
  const notes = [...new Set(rows.map((r) => r.note).filter(Boolean))]
  notes.forEach((n) => out.push(p(n, { italics: true, color: MUTED, size: 18, before: 80 })))

  return { title: 'Screening reference values', children: out }
}

/**
 * One parameter: numbered heading, status chip, summary strip, chart,
 * the deterministic statement, and the Monitoring Insights panel.
 */
export function buildParameterSection(entry, num) {
  if (!entry) return null
  const out = [sectionHeading(num, entry.label)]

  // `midLabel` keeps acronyms intact ("PM2.5", not "pm2.5").
  out.push(
    p(
      `The following section summarizes measured ${entry.midLabel || entry.label} over the monitoring period and compares the observations to the selected screening reference.`,
      { color: MUTED, size: 18 },
    ),
  )

  const chip = statusChip(entry.status)
  if (chip) {
    out.push(chip)
    out.push(p('', { after: 60 }))
  }

  const strip = summaryStripTable(entry.strip)
  if (strip) {
    out.push(strip)
    out.push(p('', { after: 60 }))
  }

  if (isImageDataUrl(entry.chart)) {
    try {
      out.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: base64ToUint8Array(entry.chart),
              transformation: { width: IMG_W, height: IMG_H },
              type: inferImageType(entry.chart),
            }),
          ],
          spacing: { before: 120, after: 60 },
        }),
      )
      const refNote =
        entry.reference && (entry.reference.band || entry.reference.limit != null)
          ? ' Reference shown as listed in Screening reference values.'
          : ''
      out.push(
        p(`Figure ${entry.figureNumber}. ${entry.label} over the monitoring period.${refNote}`, {
          color: MUTED,
          size: 18,
          after: 140,
        }),
      )
    } catch {
      /* an unreadable chart must not abort the report */
    }
  }

  if (entry.statement) out.push(p(entry.statement, { after: 140 }))

  const panel = insightsPanel(entry.insights)
  if (panel) {
    out.push(panel)
    out.push(p('', { after: 60 }))
  }

  return { title: entry.label, children: out }
}

/** Dataset integrity — coverage, gaps, cadence. */
export function buildDataQualitySection(model, num) {
  const rows = (model && model.dataQuality) || []
  if (!rows.length) return null
  return {
    title: 'Dataset integrity',
    children: [sectionHeading(num, 'Dataset integrity'), kvTable(rows.map((r) => [r.label, r.value]))],
  }
}

/** Limitations and disclaimer — fixed prose, never generated from data. */
export function buildLimitationsSection(model, num) {
  const items = (model && model.limitations) || []
  if (!items.length) return null
  return {
    title: 'Limitations',
    children: [sectionHeading(num, 'Limitations'), ...items.map((t) => p(t, { size: 18, after: 110 }))],
  }
}

/** Appendix A — the annotated monitoring events, kept out of the body. */
export function buildEventsAppendix(model) {
  const rows = (model && model.events) || []
  if (!rows.length) return null
  return {
    title: 'Monitoring events',
    children: [
      p('Events annotated by the assessor during the monitoring period.', { color: MUTED, size: 18 }),
      buildTable(['Timestamp', 'Event', 'Notes'], rows.map((r) => [r.time || '—', r.label || '—', r.note || '—'])),
    ],
  }
}

/** Appendix — full descriptive statistics (Technical edition only). */
export function buildRawStatisticsAppendix(model) {
  const rows = (model && model.rawStatistics) || []
  if (!rows.length) return null
  return {
    title: 'Raw statistics',
    children: [
      p('Descriptive statistics for each monitored parameter.', { color: MUTED, size: 18 }),
      buildTable(
        ['Parameter', 'Unit', 'Mean', 'Median', 'Min', 'Max', 'Std dev', '95th', 'n', 'Coverage'],
        rows.map((r) => [r.label, r.unit, r.mean, r.median, r.min, r.max, r.stdDev, r.p95, r.count, r.coverage]),
      ),
    ],
  }
}

/** Report metadata — the traceability block. */
export function buildMetadataSection(model, num) {
  const rows = (model && model.metadata) || []
  if (!rows.length) return null
  return {
    title: 'Report metadata',
    children: [sectionHeading(num, 'Report metadata'), kvTable(rows.map((r) => [r.label, r.value]))],
  }
}

/**
 * Every section of the report, in order, with the ones that have no data
 * omitted. Section numbers are assigned AFTER omission so the sequence is
 * always unbroken — a report that skipped from 03 to 05 would look like a
 * page had gone missing.
 *
 * @returns {{body: object[], appendices: object[]}}
 */
export function buildMonitoringSections(model) {
  if (!model) return { body: [], appendices: [] }

  const cover = buildCoverSection(model)

  // Builders are deferred so numbering can be applied only to the sections
  // that actually survive.
  const numbered = [
    (n) => buildObjectiveSection(model, n),
    (n) => buildLocationInstrumentSection(model, n),
    (n) => buildHighlightsSection(model, n),
    (n) => buildReferenceSection(model, n),
    ...(model.parameters || []).map((entry) => (n) => buildParameterSection(entry, n)),
    (n) => buildDataQualitySection(model, n),
    (n) => buildLimitationsSection(model, n),
    (n) => buildMetadataSection(model, n),
  ]

  const body = [cover]
  let num = 0
  numbered.forEach((make) => {
    // Probe with the next number; only consume it if the section exists.
    const section = make(num + 1)
    if (section) {
      num += 1
      // The assigned number rides on the descriptor so callers (and tests)
      // can read the sequence without parsing the rendered paragraph.
      body.push({ ...section, num })
    }
  })

  const appendices = [
    buildEventsAppendix(model),
    buildRawStatisticsAppendix(model), // null on the Client edition
  ].filter(Boolean)

  return { body, appendices }
}

/** Flatten sections into the paragraph list a Document section consumes. */
export function monitoringReportChildren(model) {
  const { body, appendices } = buildMonitoringSections(model)
  const out = []
  body.forEach((s) => out.push(...s.children))
  appendices.forEach((s, i) => {
    out.push(sectionHeading(null, `Appendix ${String.fromCharCode(65 + i)} — ${s.title}`))
    out.push(...s.children)
  })
  return out
}
