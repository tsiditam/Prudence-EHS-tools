/**
 * AtmosFlow DOCX — Indoor Air Quality Monitoring Report.
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
 *   • NO MASTHEAD. The report opens on its own title. Firm identity is
 *     carried by the running header, where it repeats on every page without
 *     competing with the title for the top of page one. An optional badge
 *     (SAMPLE, DRAFT) sits above the eyebrow.
 *   • NUMBERED SECTIONS (01, 02, 03 …). The numerals are not decoration —
 *     they tell a reader the document follows a methodology, and they let a
 *     figure caption or a cover letter cite "§05" unambiguously. The numeral
 *     sits in a tinted box, as in the reviewed design.
 *   • A single restrained teal accent, used only for the section numerals,
 *     the callout and insights rules, and the highlight ticks. Never on body
 *     text.
 *   • META GRIDS — small uppercase label above a bold value, several across —
 *     wherever the content is a set of short facts rather than a table. The
 *     cover block, dataset integrity and the report footer all use it.
 *   • A PARAMETER CARD: header, summary strip, figure, statement and insights
 *     bounded by one hairline rule, so each parameter reads as one object
 *     rather than five loose blocks.
 *   • The SUMMARY STRIP renders as large figures under small uppercase
 *     labels, with the unit set smaller and quieter than the number.
 *   • A STATUS CHIP: tinted fill, coloured label, following the severity of
 *     the status itself.
 *   • A MONITORING INSIGHTS panel: tinted block with an accent left rule, so
 *     the deterministic observations read as a distinct element.
 *
 * ── Working within Word ────────────────────────────────────────────────
 * Word has no CSS, so a "pill" is a shaded single-cell table, a "card" is a
 * bordered one, and a "grid" is a borderless table with two paragraphs per
 * cell. The structure survives, which is what matters in print.
 *
 * Nesting is kept to a single level throughout: the parameter card holds its
 * header and strip as nested tables, but its prose blocks use paragraph
 * indents rather than another table. Deeply nested tables are where Word and
 * iOS Quick Look start to disagree about widths, and this document is read on
 * both.
 */

import {
  Paragraph,
  TextRun,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx'
import { COLORS } from './styles'
import { CONTENT_WIDTH_DXA } from './page-setup'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'
import { CHART_SIZE } from '../../utils/monitoringChart'

/**
 * The report's palette. Neutrals come from the shared report tokens so the
 * document sits beside the consultant report; the accent is the restrained
 * teal from the reviewed design (deep enough to print cleanly, quiet enough
 * not to read as marketing).
 */
// A handful of these are `export`ed (additive, safe) so a sibling report that
// reuses this design system — e.g. the AtmosFlow assessment report in
// sections-atmosflow.js — can build bespoke bits (a body meta grid, a labelled
// run) in the same visual language rather than re-deriving the tokens.
export const ACCENT = '0E7490'
const ACCENT_2 = '0891B2'
const ACCENT_TINT = 'F4FAFB'
export const INK = COLORS.text
export const BODY = '3A424E' // lighter than COLORS.body: body text recedes, headings lead
export const MUTED = '6B7480'
const FAINT = '9AA3AE'
const HAIR = 'EEF1F4' // softer rules — fewer borders competing for attention
const HAIR_2 = 'E2E6EB'
const WASH = 'F7F9FA' // the subtle grey a card sits on

/**
 * Type system — Logger Report v1.1 (spec Part 3b). ONE primary family,
 * Open Sans, across the whole report; JetBrains Mono only for the
 * "data utility" role (serials, ISO timestamps, reference values, section
 * numbers, SHA-256 hashes — anything requiring character alignment). Both
 * are SIL OFL 1.1. The interim Aptos / Newsreader / DM Mono stack (and the
 * earlier Cambria / Franklin Gothic / Consolas one) are retired here.
 *
 * Named in one place so the export reads every font choice from a token,
 * not a scattered literal. Neither family ships with Word, so the .docx
 * must EMBED them (fontTable.xml) or be delivered as PDF — that packaging
 * step is tracked separately; this module only assigns the faces.
 */
export const FONT_SANS = 'Open Sans'
const FONT_SANS_SEMI = 'Open Sans SemiBold' // weight 600 — a distinct family name in OOXML
const FONT_SANS_LIGHT = 'Open Sans Light'   // weight 300 — the editorial big-number hero face
const FONT_MONO = 'JetBrains Mono'

/**
 * Tracking (letter-spacing) in twips (1/20 pt). The spec expresses tracking
 * in points; ×20 → twips. (Figma is the real source for the unit; absent it,
 * points is the defensible reading of values like +1.2 / −0.5.)
 */
// Tracking on the small uppercase labels was dialled back (was +1.3 pt): with
// so many of them — PREPARED BY, MEAN, LOGGING INTERVAL — the wide spacing had
// become a motif rather than hierarchy. `labelLong` takes a longer label (e.g.
// LOGGING INTERVAL) tighter still, since tracking accumulates with length.
const TRACK = { title: -10, part: 20, heading: 4, label: 16, labelLong: 10, data: 0 } // −0.5 / +1.0 / +0.2 / +0.8 (+0.5 long) pt

/**
 * Type scale in half-points (docx `size` = pt × 2), set to the Part 3b table.
 * Open Sans has a large x-height and sets visually larger than the retired
 * serif at the same nominal size, so body is 10 pt (not 10.5) with 1.45 line.
 */
export const TYPE = {
  title: 60, //  30 pt — report title (cover)        · 700, track −0.5
  part: 19, //   9.5 pt — part header                 · 700, track +1.2, upper
  h2: 25, //    12.5 pt — section heading             · 600 SemiBold, track +0.2
  body: 20, //    10 pt — running text                · 400, line 1.45
  small: 19, //  9.5 pt — intros, table body, card values
  fine: 17, //   8.5 pt — caption / footnote          · 400 italic
  data: 17, //   8.5 pt — data utility (JetBrains Mono)· 400
  label: 13, //  6.5 pt — label / eyebrow             · 700, track +1.3, upper
  eyebrow: 13, // 6.5 pt — alias of label
  figure: 36, //  18 pt — stat value (editorial hero) · Light 300
  paramName: 26, // 13 pt — parameter card header
  coverFact: 21, // 10.5 pt — the cover's meta values
}

/** Body line height (tightened from 1.45 for a denser report) → docx units. */
const BODY_LINE = Math.round(1.22 * 240)

/**
 * Document-level defaults for the monitoring report — Open Sans, so any run
 * that does not name a face inherits the report's primary family rather than
 * the shared consultant-report default (Aptos). Scoped to this report only.
 */
export const MONITORING_DOCX_STYLES = {
  default: {
    document: {
      run: { font: FONT_SANS, size: TYPE.body, color: BODY },
      paragraph: { spacing: { after: 50, line: BODY_LINE } },
    },
  },
}

// Vertical rhythm. Named rather than sprinkled, because "premium reports have
// more whitespace than you think they need" is only true if the amounts are
// consistent — irregular gaps read as mistakes, not generosity.
const GAP = { tight: 50, base: 100, loose: 150, section: 280 }

/**
 * Status tones — a four-step visual scale in FIVE colours.
 *
 * The design brief asked for green / yellow / orange / red. Amber at two
 * intensities does the work of yellow and orange, which keeps the whole
 * document inside one restrained palette: cyan, grey, green, amber, red. A
 * sixth hue would be the first step back toward a chart that looks busy.
 *
 * The LABEL a tone carries is decided in the model, not here — these are only
 * the colours the reader takes in before reading the word.
 */
const TONES = {
  ok: { text: '0E7A55', fill: 'EDFAF3', dot: '0E9F6E' },
  notice: { text: '8A6206', fill: 'FEF9EC', dot: 'D9A21B' },
  warn: { text: '8A5106', fill: 'FDF3E8', dot: 'C2740B' },
  review: { text: 'A62121', fill: 'FDEFEF', dot: 'DC2626' },
  // Deliberately grey, and deliberately NOT on the ok→review scale. When the
  // calibration record cannot vouch for the data there is no position on that
  // scale to occupy: the readings are neither within a reference nor above
  // one, because no comparison they support has been established. Colouring
  // it green would read as a pass and red as a failure; both are claims the
  // data cannot carry.
  indeterminate: { text: '52606D', fill: 'F1F4F6', dot: '8A98A5' },
}

export const p = (text, opts = {}) =>
  new Paragraph({
    children: [
      new TextRun({
        text: String(text ?? ''),
        italics: !!opts.italics,
        bold: !!opts.bold,
        color: opts.color,
        size: opts.size ?? TYPE.body,
        font: FONT_SANS,
      }),
    ],
    spacing: { after: opts.after ?? 90, before: opts.before ?? 0, line: opts.line ?? BODY_LINE },
    alignment: opts.align,
    indent: opts.indent,
    // Pagination: keepNext binds this paragraph to the block that follows it
    // (a heading to its section, an intro to its card); keepLines stops the
    // paragraph itself splitting across a page.
    keepNext: opts.keepNext || undefined,
    keepLines: opts.keepLines || undefined,
  })

const noBorder = { style: 'none', size: 0, color: 'FFFFFF' }
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
const hair = (color = HAIR) => ({ style: 'single', size: 1, color })

/** A borderless table used purely for layout, sized in absolute twips. */
function layoutTable(rows, widths, opts = {}) {
  return new Table({
    rows,
    width: { size: opts.width || CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widths,
    borders: opts.borders || {
      ...noBorders,
      insideHorizontal: noBorder,
      insideVertical: noBorder,
    },
  })
}

/**
 * A numbered section heading — "01  Monitoring objective", the numeral in a
 * tinted box, with a hairline rule beneath.
 * Pass `num = null` for an unnumbered heading (appendices, the footer).
 */
export function sectionHeading(num, title, status) {
  const children = []
  if (num != null) {
    children.push(
      // Section number — a "data utility" figure, so JetBrains Mono.
      new TextRun({
        text: ` ${String(num).padStart(2, '0')} `,
        bold: true,
        size: TYPE.data,
        color: ACCENT,
        font: FONT_MONO,
        shading: { type: ShadingType.CLEAR, fill: ACCENT_TINT },
      }),
      new TextRun({ text: '   ', size: TYPE.h2, font: FONT_SANS }),
    )
  }
  if (status) {
    const tone = TONES[status.tone] || TONES.warn
    children.push(new TextRun({ text: '● ', bold: true, size: TYPE.h2, color: tone.dot, font: FONT_SANS }))
  }
  // Section heading — Open Sans SemiBold (600), not Bold (spec Part 3b).
  children.push(new TextRun({ text: title, size: TYPE.h2, color: INK, font: FONT_SANS_SEMI, characterSpacing: TRACK.heading }))
  return new Paragraph({
    children,
    spacing: { before: GAP.section, after: 140 },
    border: { bottom: hair() },
    // A heading never sits alone at the foot of a page — it stays with the
    // block it introduces.
    keepNext: true,
  })
}

/** Small uppercase key — the label / eyebrow role (700, light tracking). */
const keyRun = (text) => {
  const str = String(text || '').toUpperCase()
  // Long labels get less letter-spacing: tracking is per-gap, so it reads as
  // heavier the more characters a label has.
  const track = str.length > 10 ? TRACK.labelLong : TRACK.label
  return new TextRun({
    text: str,
    bold: true,
    size: TYPE.label,
    color: FAINT,
    font: FONT_SANS,
    characterSpacing: track,
  })
}

/**
 * A meta grid: small uppercase label above a bold value, `cols` across.
 * Used by the cover block, dataset integrity, and the report footer — every
 * place the content is a handful of short facts rather than a real table.
 */
export function metaGrid(pairs, cols = 3) {
  const items = (pairs || []).filter((x) => x && x.label)
  if (!items.length) return null
  const width = Math.floor(CONTENT_WIDTH_DXA / cols)
  const rows = []
  for (let i = 0; i < items.length; i += cols) {
    const slice = items.slice(i, i + cols)
    // The last row is padded so Word does not stretch a lone cell across the
    // full width and break the grid's alignment with the rows above it.
    while (slice.length < cols) slice.push(null)
    rows.push(
      new TableRow({
        children: slice.map(
          (item) =>
            new TableCell({
              children: item
                ? [
                    new Paragraph({ children: [keyRun(item.label)], spacing: { after: 30 } }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: String(item.value ?? '—'),
                          bold: true,
                          size: TYPE.small,
                          color: INK,
                          font: FONT_SANS,
                        }),
                      ],
                      spacing: { after: 0 },
                    }),
                  ]
                : [p('', { after: 0 })],
              width: { size: width, type: WidthType.DXA },
              borders: noBorders,
              margins: { top: 60, bottom: 140, left: 0, right: 200 },
            }),
        ),
      }),
    )
  }
  return layoutTable(rows, Array.from({ length: cols }, () => width))
}

/**
 * A tinted panel with an accent left rule. The callout (§01) and the
 * Monitoring Insights block are the same object with different contents, so
 * they are built from one helper and cannot drift apart.
 *
 * `inset` pulls the panel in from both edges, which is how the insights block
 * sits INSIDE the parameter card rather than straddling its border. The left
 * inset is an empty spacer COLUMN rather than a table indent: `w:tblInd` is
 * honoured by Word but silently dropped by several other readers, and a
 * panel whose accent rule lands on top of the card's border reads as a
 * rendering fault. A spacer column measures the same everywhere.
 */
function accentPanel(children, inset = 0) {
  const panelWidth = CONTENT_WIDTH_DXA - inset * 2
  const cells = []
  if (inset > 0) {
    cells.push(
      new TableCell({
        children: [p('', { after: 0, size: 2 })],
        width: { size: inset, type: WidthType.DXA },
        borders: noBorders,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    )
  }
  cells.push(
    new TableCell({
      children,
      shading: { type: ShadingType.CLEAR, fill: ACCENT_TINT },
      borders: {
        top: hair(HAIR_2),
        bottom: hair(HAIR_2),
        right: hair(HAIR_2),
        left: { style: 'single', size: 12, color: ACCENT },
      },
      margins: { top: 150, bottom: 150, left: 180, right: 180 },
      width: { size: panelWidth, type: WidthType.DXA },
    }),
  )
  const widths = inset > 0 ? [inset, panelWidth] : [panelWidth]
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ children: cells })],
  })
}

/** §01's objective, set as a callout rather than a loose paragraph. */
export function calloutPanel(text) {
  if (!text) return null
  return accentPanel([p(text, { size: TYPE.small, after: 0 })])
}

/**
 * Split a generated observation into the phrase a reader scans for and the
 * rest of the sentence.
 *
 * Purely presentational — the sentence is unchanged, only its first clause is
 * set in a heavier weight. Splitting on the first comma or preposition keeps
 * the lead short without ever rewording what the model produced, which is the
 * line this file must not cross.
 */
export function splitObservation(text) {
  const s = String(text || '').trim()
  if (!s) return { lead: '', rest: '' }
  const m = s.match(/^(.{8,44}?)(\s+(?:on|for|during|within|averaged|were|was)\b|,\s)/)
  if (!m) return { lead: s, rest: '' }
  return { lead: m[1].trim(), rest: s.slice(m[1].length).trim() }
}

/** The Monitoring Insights panel — tinted block with an accent left rule. */
export function insightsPanel(items, inset = 0) {
  if (!items || !items.length) return null
  return accentPanel([
    new Paragraph({
      children: [
        new TextRun({ text: 'KEY OBSERVATIONS', bold: true, size: TYPE.label, color: ACCENT, font: FONT_SANS }),
      ],
      spacing: { after: 170 },
    }),
    // Each observation is a labelled fact rather than a bullet of prose: the
    // lead phrase is what a reader scans for, and setting it apart lets them
    // find "how long above the reference" without reading the sentence first.
    ...items.flatMap((i, idx) => {
      const split = splitObservation(i.text)
      const last = idx === items.length - 1
      return [
        new Paragraph({
          children: [
            new TextRun({ text: '▪  ', bold: true, size: TYPE.label, color: ACCENT_2, font: FONT_SANS }),
            new TextRun({ text: split.lead, bold: true, size: TYPE.small, color: INK, font: FONT_SANS }),
            ...(split.rest
              ? [new TextRun({ text: ` ${split.rest}`, size: TYPE.small, color: BODY, font: FONT_SANS })]
              : []),
          ],
          indent: { left: 260, hanging: 260 },
          spacing: { after: last ? 0 : 150 },
        }),
      ]
    }),
  ], inset)
}

/**
 * The status chip — a shaded run whose colour follows the status tone.
 *
 * A run rather than a shaded single-cell table: the tint then hugs the label
 * the way a pill does, and the header row stops carrying the empty paragraph
 * Word inserts after every nested table, which was adding a visible band of
 * dead space under each parameter name.
 */
export function statusChip(status, align = AlignmentType.RIGHT) {
  if (!status) return null
  const tone = TONES[status.tone] || TONES.warn
  return new Paragraph({
    children: [
      // The dot carries the tone at full strength; the tinted pill behind the
      // label would be too pale on its own to read across a room.
      new TextRun({ text: '  ● ', bold: true, size: TYPE.eyebrow, color: tone.dot, font: FONT_SANS,
        shading: { type: ShadingType.CLEAR, fill: tone.fill } }),
      new TextRun({ text: `${status.label}  `, bold: true, size: TYPE.eyebrow, color: tone.text, font: FONT_SANS,
        shading: { type: ShadingType.CLEAR, fill: tone.fill } }),
    ],
    alignment: align,
    spacing: { after: 0 },
  })
}

/**
 * The cover's at-a-glance panel: every parameter and where it sat, one line
 * each, colour first.
 *
 * This is the single highest-value element on the page. A client who reads
 * nothing else should still close the document knowing what it found, and a
 * column of coloured dots delivers that in about a second — which is roughly
 * how long a busy reader gives a cover page.
 */
export function overviewCard(items) {
  const rows = (items || []).filter((x) => x && x.status)
  if (!rows.length) return null

  const nameW = Math.round(CONTENT_WIDTH_DXA * 0.52)
  const statusW = CONTENT_WIDTH_DXA - nameW

  const header = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({
            text: 'OVERALL MONITORING SUMMARY', bold: true, size: TYPE.label, color: ACCENT, font: FONT_SANS,
          })],
          spacing: { after: 0 },
        })],
        columnSpan: 2,
        shading: { type: ShadingType.CLEAR, fill: WASH },
        borders: { ...noBorders, bottom: hair(HAIR_2) },
        margins: { top: 130, bottom: 110, left: 240, right: 240 },
      }),
    ],
  })

  const body = rows.map((r, i) => {
    const tone = TONES[r.status.tone] || TONES.warn
    const last = i === rows.length - 1
    const cell = (children, extra = {}) => new TableCell({
      children,
      borders: { ...noBorders, bottom: last ? noBorder : hair() },
      margins: { top: 130, bottom: 130, left: 240, right: 240, ...extra },
    })
    return new TableRow({
      children: [
        cell([new Paragraph({
          children: [
            new TextRun({ text: '● ', bold: true, size: TYPE.body, color: tone.dot, font: FONT_SANS }),
            new TextRun({ text: r.label, size: TYPE.body, color: INK, font: FONT_SANS }),
          ],
          spacing: { after: 0 },
        })]),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: r.status.label, bold: true, size: TYPE.small, color: tone.text, font: FONT_SANS,
            })],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
          })],
          borders: { ...noBorders, bottom: last ? noBorder : hair() },
          margins: { top: 130, bottom: 130, left: 240, right: 240 },
        }),
      ],
    })
  })

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [nameW, statusW],
    borders: {
      top: hair(HAIR_2), bottom: hair(HAIR_2), left: hair(HAIR_2), right: hair(HAIR_2),
      insideHorizontal: noBorder, insideVertical: noBorder,
    },
    rows: [header, ...body],
  })
}

/**
 * The card header: the parameter's short name and sampling metadata on the
 * left, its status chip on the right.
 */
function parameterHead(entry) {
  const left = [
    new Paragraph({
      children: [
        new TextRun({ text: entry.shortLabel || entry.label, bold: true, size: TYPE.paramName, color: INK, font: FONT_SANS }),
        ...(entry.headMeta
          ? [
              new TextRun({ text: '   ', size: TYPE.small, font: FONT_SANS }),
              new TextRun({ text: entry.headMeta, size: TYPE.fine, color: MUTED, font: FONT_SANS }),
            ]
          : []),
      ],
      spacing: { after: 0 },
    }),
  ]
  const chip = statusChip(entry.status)
  const widths = [Math.round(CONTENT_WIDTH_DXA * 0.62), Math.round(CONTENT_WIDTH_DXA * 0.38)]
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            children: left,
            width: { size: widths[0], type: WidthType.DXA },
            borders: { ...noBorders, bottom: hair() },
            margins: { top: 140, bottom: 140, left: 200, right: 80 },
            verticalAlign: 'center',
          }),
          new TableCell({
            children: [chip || p('', { after: 0 })],
            width: { size: widths[1], type: WidthType.DXA },
            borders: { ...noBorders, bottom: hair() },
            margins: { top: 140, bottom: 140, left: 80, right: 200 },
            verticalAlign: 'center',
          }),
        ],
      }),
    ],
  })
}

/**
 * The summary strip: large figures under small uppercase labels, the unit set
 * smaller and quieter than the number it belongs to.
 *
 * `emphasis` tiles (time above / % above a reference) take the warn colour so
 * the exposure figures carry from across the page.
 */
export function summaryStripTable(tiles, opts = {}) {
  if (!tiles || !tiles.length) return null
  const width = Math.floor(CONTENT_WIDTH_DXA / tiles.length)
  // Inside a parameter card the strip carries a bottom hairline to divide it
  // from the figure below; standalone (dataset integrity) that rule would
  // double up against the card's own border, so it is dropped.
  const cellBottom = opts.bottomBorder === false ? noBorder : hair()
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: tiles.map(() => width),
    rows: [
      new TableRow({
        // The KPI card is never split across a page — if it does not fit in
        // the space left, the whole strip moves to the next page.
        cantSplit: true,
        children: tiles.map(
          (t, i) =>
            new TableCell({
              children: [
                new Paragraph({ children: [keyRun(t.label)], spacing: { after: 70 } }),
                new Paragraph({
                  children: [
                    // Editorial hero number: big and LIGHT (Open Sans Light).
                    // Emphasis (a reading over reference) is carried by colour,
                    // not weight, so the strip stays calm and modern. Compact
                    // tiles keep the regular face at the smaller size.
                    new TextRun({
                      text: String(t.value),
                      bold: false,
                      size: t.compact ? TYPE.paramName : TYPE.figure,
                      color: t.emphasis ? TONES.warn.text : INK,
                      font: t.compact ? FONT_SANS : FONT_SANS_LIGHT,
                    }),
                    ...(t.unit
                      ? [
                          new TextRun({ text: ' ', size: TYPE.fine, font: FONT_SANS }),
                          new TextRun({ text: t.unit, size: TYPE.fine, color: MUTED, font: FONT_SANS }),
                        ]
                      : []),
                  ],
                  spacing: { after: 0 },
                }),
              ],
              width: { size: width, type: WidthType.DXA },
              borders: {
                ...noBorders,
                bottom: cellBottom,
                // Hairline dividers between tiles, none on the outer edges —
                // the card's own border closes those sides.
                right: i === tiles.length - 1 ? noBorder : hair(),
              },
              // Generous padding is what makes a table row read as a card.
              margins: { top: 140, bottom: 140, left: i === 0 ? 240 : 170, right: 170 },
            }),
        ),
      }),
    ],
  })
}

/**
 * The parameter card — header, strip, figure, statement and insights inside
 * one hairline rule.
 *
 * The prose blocks use paragraph indents rather than another nested table:
 * one level of nesting is reliable in both Word and iOS Quick Look, two is
 * where their width calculations start to diverge.
 */
function parameterCard(children) {
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH_DXA],
    rows: [
      new TableRow({
        // The whole card is one indivisible object: heading → strip → figure →
        // caption → interpretation → observations stay together on one page.
        // If the card does not fit in the space left, Word moves the entire
        // card to the next page rather than splitting it mid-parameter. (A card
        // taller than a full page degrades gracefully — Word still splits what
        // cannot fit anywhere.)
        cantSplit: true,
        children: [
          new TableCell({
            children,
            borders: { top: hair(HAIR_2), bottom: hair(HAIR_2), left: hair(HAIR_2), right: hair(HAIR_2) },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        ],
      }),
    ],
  })
}

/**
 * A data table in the report's own style: no header fill, an uppercase muted
 * header over a rule, and hairline row separators.
 *
 * Deliberately not `tables.js#buildTable`, which shades its header to match
 * the consultant report. This document has its own reviewed visual system,
 * and the two should be free to differ without either having to bend.
 */
export function dataTable(headers, rows, widths, opts = {}) {
  const cols = headers.length
  const colWidths =
    widths && widths.length === cols
      ? widths.map((w) => Math.round((w / 100) * CONTENT_WIDTH_DXA))
      : Array.from({ length: cols }, () => Math.floor(CONTENT_WIDTH_DXA / cols))

  // Two treatments from one builder:
  //  • card (default) — the report's KPI-card language: a subtle grey header
  //    band, hairline row separators, generous padding, a hairline frame, cells
  //    vertically centred. This is what a client-facing table (Screening
  //    reference values) uses so it reads as a designed element, not a Word
  //    table.
  //  • zebra — alternating wash, no separators or frame, for a wide technical
  //    table (raw statistics) where banding tracks a row across many columns
  //    better than a hairline does.
  const zebra = opts.zebra === true

  // A grey header band rather than the accent tint: quieter, and it reads as
  // structure rather than decoration. The label takes the same tracked
  // uppercase treatment as the KPI-card keys.
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h, i) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: String(h || '').toUpperCase(), bold: true, size: TYPE.label, color: MUTED, font: FONT_SANS, characterSpacing: TRACK.label,
            })],
            spacing: { after: 0 },
          })],
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: WASH },
          borders: zebra ? noBorders : { ...noBorders, bottom: hair(HAIR_2) },
          margins: { top: 140, bottom: 140, left: i === 0 ? 200 : 150, right: 150 },
          verticalAlign: 'center',
        }),
    ),
  })

  const bodyRows = rows.map(
    (row, r) => {
      const last = r === rows.length - 1
      return new TableRow({
        cantSplit: true,
        children: row.map((cell, i) => {
          const spec = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : { text: cell }
          return new TableCell({
            children: [
              new Paragraph({
                children: [
                  // `mono` marks a data-utility cell (serial, timestamp,
                  // reference value, hash) — JetBrains Mono for alignment.
                  new TextRun({
                    text: String(spec.text ?? '—'),
                    bold: !!spec.bold,
                    size: spec.mono ? TYPE.data : TYPE.small,
                    color: spec.muted ? MUTED : INK,
                    font: spec.mono ? FONT_MONO : FONT_SANS,
                  }),
                ],
                spacing: { after: 0 },
              }),
            ],
            width: { size: colWidths[i], type: WidthType.DXA },
            shading: zebra && r % 2 === 1 ? { type: ShadingType.CLEAR, fill: WASH } : undefined,
            // Card treatment: a hairline under each row but the last (the frame
            // closes that one). Zebra treatment: no separators, banding does
            // the work.
            borders: zebra ? noBorders : { ...noBorders, bottom: last ? noBorder : hair() },
            margins: { top: zebra ? 150 : 170, bottom: zebra ? 150 : 170, left: i === 0 ? 200 : 150, right: 150 },
            verticalAlign: 'center',
          })
        }),
      })
    },
  )

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: colWidths,
    borders: zebra
      ? { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder }
      : { top: hair(HAIR_2), bottom: hair(HAIR_2), left: hair(HAIR_2), right: hair(HAIR_2), insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [headerRow, ...bodyRows],
  })
}

/**
 * A definition card — an uppercase title over label/value pairs, the value
 * hard against the card's inner right edge.
 *
 * The pairs are a nested two-column table rather than a tab stop. A right tab
 * stop expresses the same intent in fewer objects, but tab handling is one of
 * the places Word, Pages and the iOS previewer disagree; a table column is
 * the same everywhere, and this list is read as a spec sheet where a value
 * that has drifted out of its column looks like an error in the data.
 */
function definitionCard(title, rows, width) {
  const inner = width - 400
  const labelW = Math.round(inner * 0.44)
  const valueW = inner - labelW

  const children = [
    new Paragraph({
      children: [
        new TextRun({ text: String(title).toUpperCase(), bold: true, size: TYPE.label, color: MUTED, font: FONT_SANS }),
      ],
      spacing: { after: 140 },
    }),
    new Table({
      width: { size: inner, type: WidthType.DXA },
      columnWidths: [labelW, valueW],
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: rows.map(
        (r) =>
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: r.label, size: TYPE.fine, color: MUTED, font: FONT_SANS })],
                    spacing: { after: 0 },
                  }),
                ],
                width: { size: labelW, type: WidthType.DXA },
                borders: noBorders,
                margins: { top: 50, bottom: 50, left: 0, right: 60 },
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: String(r.value ?? '—'), bold: true, size: TYPE.fine, color: INK, font: FONT_SANS }),
                    ],
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 0 },
                  }),
                ],
                width: { size: valueW, type: WidthType.DXA },
                borders: noBorders,
                margins: { top: 50, bottom: 50, left: 60, right: 0 },
              }),
            ],
          }),
      ),
    }),
  ]

  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    borders: { top: hair(HAIR_2), bottom: hair(HAIR_2), left: hair(HAIR_2), right: hair(HAIR_2) },
    // Bottom margin is small because Word requires a paragraph after a nested
    // table, and that empty paragraph already supplies most of the gap.
    margins: { top: 170, bottom: 40, left: 200, right: 200 },
  })
}

/** A highlight row: an accent tick, then the fact. */
function tickRow(text, keepNext = false) {
  return new Paragraph({
    children: [
      new TextRun({ text: '✓', bold: true, size: TYPE.small, color: ACCENT_2, font: FONT_SANS }),
      new TextRun({ text: '\t', font: FONT_SANS }),
      new TextRun({ text, size: TYPE.body, color: BODY, font: FONT_SANS }),
    ],
    // Hanging indent so a wrapped line aligns under the text, not the tick.
    indent: { left: 340, hanging: 340 },
    tabStops: [{ type: 'left', position: 340 }],
    spacing: { after: 110 },
    // keepNext chains each row to the next (and, via the heading's own
    // keepNext, to the heading) so §03 never breaks across a page — if the
    // block does not fit, the whole of it moves to the next page.
    keepNext: keepNext || undefined,
    keepLines: true,
  })
}

// The figure, sized to the card's inner width. Height follows the chart's own
// aspect so a change to the canvas never silently stretches the image.
const IMG_W = 570
const IMG_H = Math.round((IMG_W * CHART_SIZE.height) / CHART_SIZE.width)
const CARD_PAD = { left: 200, right: 200 }

/**
 * A short accent rule — the report's one brand mark on the cover. A borderless
 * empty paragraph whose bottom border is shortened by a right indent, so the
 * accent bar is a FIXED small width rather than the full text column, and it is
 * a paragraph (no leading table at the top of the document body). `w` is the
 * bar's width in twips, `weight` its thickness in eighths of a point.
 */
function accentRule(w = 1300, weight = 16, color = ACCENT) {
  return new Paragraph({
    children: [new TextRun({ text: '', size: 2, font: FONT_SANS })],
    border: { bottom: { style: 'single', size: weight, color, space: 1 } },
    indent: { right: Math.max(0, CONTENT_WIDTH_DXA - w) },
    spacing: { after: 90, line: 20 },
  })
}

/**
 * Cover: brand rule, accent eyebrow, title, monitoring period, site line,
 * meta grid.
 *
 * The report opens on its own title rather than on a brand block. Firm
 * identity is carried by the running header, where it repeats on every page
 * without competing with the title for the top of page one. The title reads as
 * a two-part hierarchy — the domain (INDOOR AIR QUALITY) as an eyebrow over the
 * deliverable (Monitoring Report) as the hero line — rather than one long
 * repetitive string.
 */
export function buildCoverSection(model) {
  const c = (model && model.cover) || {}
  const out = []

  // A badge (SAMPLE, DRAFT) marks a copy ON the document rather than only in
  // its file name, so one that escapes its context still says what it is.
  if (model && model.badge) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({
            text: ` ${String(model.badge).toUpperCase()} `,
            bold: true,
            size: TYPE.label,
            color: TONES.warn.text,
            font: FONT_SANS,
            shading: { type: ShadingType.CLEAR, fill: TONES.warn.fill },
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 160 },
      }),
    )
  }

  // The hero line is the deliverable alone — "Monitoring Report" — with the
  // domain lifted into the eyebrow above it, so the cover is not the same words
  // twice. Derived from the title (strip a leading "Indoor Air Quality ") so it
  // stays in step if the title is ever changed, with a plain fallback.
  const heroTitle = String(model.title || 'Monitoring Report').replace(/^\s*indoor air quality\s+/i, '') || 'Monitoring Report'
  // The monitoring period, promoted to a prominent secondary line under the
  // title (it also remains in the meta grid below for reference).
  const coverPeriod =
    c.period || (c.periodStart && c.periodEnd ? `${c.periodStart} – ${c.periodEnd}` : null)

  out.push(
    // The report's one brand mark: a short accent rule above the eyebrow.
    accentRule(),
    new Paragraph({
      children: [
        new TextRun({
          text: 'INDOOR AIR QUALITY',
          bold: true,
          size: TYPE.eyebrow,
          color: ACCENT,
          font: FONT_SANS,
          characterSpacing: TRACK.label,
        }),
      ],
      spacing: { before: 90, after: 90 },
    }),
    // Built from explicit runs rather than HeadingLevel.TITLE: Word's built-in
    // Title style overrides the document theme with its own face and colour
    // (Calibri Light, blue), which is why the title did not match the rest of
    // the report.
    new Paragraph({
      children: [new TextRun({ text: heroTitle, bold: true, size: TYPE.title, color: INK, font: FONT_SANS, characterSpacing: TRACK.title })],
      spacing: { after: c.site || c.address || coverPeriod || model.subtitle ? 90 : GAP.base },
    }),
  )

  // Property / location leads the secondary block: the site a reader is
  // holding the report about matters more to them than the date alone, so it
  // sits directly under the title, above the period, and carries more weight.
  if (c.site || c.address) {
    const runs = []
    if (c.site) runs.push(new TextRun({ text: c.site, bold: true, size: 28, color: INK, font: FONT_SANS }))
    if (c.address) {
      runs.push(new TextRun({
        text: c.address, size: TYPE.body, color: MUTED, font: FONT_SANS, break: c.site ? 1 : 0,
      }))
    }
    out.push(new Paragraph({ children: runs, spacing: { after: coverPeriod || model.subtitle ? 50 : GAP.base } }))
  }

  // The monitoring period, a step quieter than the property above it.
  if (coverPeriod) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: coverPeriod, size: TYPE.h2, color: ACCENT, font: FONT_SANS_SEMI })],
        spacing: { after: GAP.base },
      }),
    )
  }

  // Subtitle is optional — a null subtitle renders nothing (no empty gap).
  if (model.subtitle) out.push(p(model.subtitle, { color: MUTED, size: TYPE.h2, after: GAP.base }))

  const facts = [
    { label: 'Prepared for', value: c.preparedFor },
    { label: 'Prepared by', value: c.preparedBy },
    { label: 'Report date', value: c.reportDate },
    {
      label: 'Monitoring period',
      value: c.period || (c.periodStart && c.periodEnd ? `${c.periodStart} – ${c.periodEnd}` : null),
    },
    { label: 'Duration', value: c.duration },
    { label: 'Parameters', value: (c.parameters || []).join(' · ') },
  ].filter((x) => x.value)

  if (facts.length) {
    out.push(new Paragraph({ children: [], border: { bottom: hair() }, spacing: { after: GAP.base } }))
    out.push(metaGrid(facts, 3))
  }

  // The cover's "OVERALL MONITORING SUMMARY" at-a-glance panel was removed by
  // product decision — the parameter sections carry each status, so the cover
  // stays clean. `model.overview` and `overviewCard()` are retained (still
  // unit-tested and available) but no longer rendered here.

  return { title: model.title, children: out }
}

/** §01 Monitoring objective — why monitoring was performed. */
export function buildObjectiveSection(model, num) {
  if (!model || !model.objective) return null
  return {
    title: 'Monitoring objective',
    children: [sectionHeading(num, 'Monitoring objective'), calloutPanel(model.objective), p('', { after: 60 })],
  }
}

/** §02 Location and instrument, as the two cards the reviewed design uses. */
export function buildLocationInstrumentSection(model, num) {
  const loc = (model && model.location) || []
  const inst = (model && model.instrument) || []
  // Only bail when there is no model at all. A session with an instrument
  // but no location still renders — and now says the location is missing
  // rather than quietly showing one card where the design expects two.
  if (!model || (!loc.length && !inst.length)) return null

  const out = [sectionHeading(num, 'Location & instrument')]

  const cards = []
  const half = Math.floor(CONTENT_WIDTH_DXA / 2)
  // Side by side when both are present; full width when only one is, so a
  // lone card never sits in a half-empty row.
  const width = loc.length && inst.length ? half - 60 : CONTENT_WIDTH_DXA
  // A location that was never captured is STATED, not omitted. The fields
  // are filtered on non-empty upstream, so an uncaptured location used to
  // drop the card silently — leaving a section headed "Location &
  // instrument" that contained no location, and a report whose every number
  // a reader could not situate. This platform's own rule elsewhere is that
  // an unidentified source is a finding rather than an omission; a
  // monitoring position is the same kind of fact.
  cards.push(
    loc.length
      ? definitionCard('Monitoring location', loc, width)
      : definitionCard(
        'Monitoring location',
        [{
          label: 'Not recorded',
          value: 'No building, floor, room or sensor position was captured for this session. '
            + 'Readings below cannot be attributed to a specific space.',
        }],
        width,
      ),
  )
  if (inst.length) cards.push(definitionCard('Instrument configuration', inst, width))

  const widths = cards.length === 2 ? [half, half] : [CONTENT_WIDTH_DXA]
  out.push(
    layoutTable([new TableRow({ children: cards })], widths, {
      borders: { ...noBorders, insideHorizontal: noBorder, insideVertical: noBorder },
    }),
  )

  // An undocumented — or anomalous — calibration is stated, never left to
  // inference. A record that does not cover the monitoring window (future/
  // post-dated, or lapsed mid-session) is a defensibility-critical flag, so it
  // is set prominently; a plain "not documented" note stays a quiet disclosure.
  if (model && model.calibrationNote) {
    out.push(
      model.calibrationAlert
        ? p(model.calibrationNote, { bold: true, color: TONES.review.text, size: TYPE.fine, before: 140 })
        : p(model.calibrationNote, { italics: true, color: MUTED, size: TYPE.fine, before: 140 }),
    )
  }
  return { title: 'Location & instrument', children: out }
}

/** §03 Key dataset highlights — accent ticks, not bullets. */
export function buildHighlightsSection(model, num) {
  const items = (model && model.highlights) || []
  if (!items.length) return null
  return {
    title: 'Key dataset highlights',
    // Every row but the last keeps with the next, so the heading and all ticks
    // travel together to whichever page holds them.
    children: [
      sectionHeading(num, 'Key dataset highlights'),
      ...items.map((i, idx) => tickRow(i.text, idx < items.length - 1)),
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
    sectionHeading(num, 'Reference values'),
    p('Each parameter is compared to the reference selected for this monitoring session.', {
      color: MUTED,
      size: TYPE.small,
      after: 110,
    }),
    dataTable(
      ['Parameter', 'Reference', 'Value', 'Source'],
      rows.map((r) => [
        { text: r.label || r.param, bold: true },
        { text: r.profile },
        { text: r.value, mono: true },
        { text: r.source || '—', muted: true },
      ]),
      [18, 22, 20, 40],
    ),
  ]

  // Framing that must travel with the reference wherever it is cited.
  const notes = [...new Set(rows.map((r) => r.note).filter(Boolean))]
  notes.forEach((n) => out.push(p(n, { italics: true, color: MUTED, size: TYPE.fine, before: 100 })))

  return { title: 'Reference values', children: out }
}

/**
 * One parameter: numbered heading, an intro, then the card holding the
 * header, summary strip, figure, statement and Monitoring Insights.
 */
export function buildParameterSection(entry, num) {
  if (!entry) return null
  const title = entry.titleLabel || entry.label
  // The section heading carries the STATUS dot rather than a decorative
  // glyph. An abstract lozenge is the same shape whatever it sits beside, so
  // it aids scanning only in the sense that it is visible; a coloured dot
  // lets a reader flip through the report and see which parameters need a
  // second look without reading a word. The card header below carries no dot,
  // because its status chip is already on that line.
  const out = [sectionHeading(num, title, entry.status)]

  // `midLabel` keeps acronyms intact ("PM2.5", not "pm2.5").
  out.push(
    p(
      `The following section summarizes measured ${entry.midLabel || entry.label} over the monitoring period and compares the observations to the selected reference.`,
      // keepNext binds the intro (and, through the heading's own keepNext, the
      // heading) to the parameter card that follows, so the two never strand at
      // the foot of a page above a card that starts on the next one.
      { color: MUTED, size: TYPE.small, after: GAP.base, keepNext: true, keepLines: true },
    ),
  )

  const card = [parameterHead(entry)]

  const strip = summaryStripTable(entry.strip)
  if (strip) card.push(strip)

  if (isImageDataUrl(entry.chart)) {
    try {
      card.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: base64ToUint8Array(entry.chart),
              transformation: { width: IMG_W, height: IMG_H },
              type: inferImageType(entry.chart),
            }),
          ],
          indent: CARD_PAD,
          spacing: { before: GAP.loose, after: 140 },
        }),
      )
      card.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Figure ${entry.figureNumber}.`, bold: true, size: TYPE.fine, color: BODY, font: FONT_SANS }),
            new TextRun({
              text: ` ${stripFigurePrefix(entry.caption, entry.figureNumber)}`,
              size: TYPE.fine,
              color: MUTED,
              font: FONT_SANS,
            }),
          ],
          indent: CARD_PAD,
          border: { top: hair() },
          spacing: { before: 90, after: GAP.loose },
        }),
      )
    } catch {
      /* an unreadable chart must not abort the report */
    }
  }

  if (entry.statement) {
    card.push(
      new Paragraph({
        children: [
          new TextRun({ text: entry.statement, bold: true, size: TYPE.small, color: INK, font: FONT_SANS }),
          ...(entry.statementNote
            ? [new TextRun({ text: ` ${entry.statementNote}`, size: TYPE.small, color: BODY, font: FONT_SANS })]
            : []),
        ],
        indent: CARD_PAD,
        spacing: { before: isImageDataUrl(entry.chart) ? 0 : GAP.loose, after: GAP.loose },
        keepLines: true,
      }),
    )
  }

  // A whole series at/below the screening detection floor is non-quantitative;
  // the caveat rides with the parameter so a reader can't take the printed
  // figures as measured concentrations.
  if (entry.detectionNote) {
    card.push(
      new Paragraph({
        children: [
          new TextRun({ text: entry.detectionNote, bold: true, size: TYPE.small, color: TONES.review.text, font: FONT_SANS }),
        ],
        indent: CARD_PAD,
        spacing: { before: GAP.tight, after: GAP.loose },
      }),
    )
  }

  const panel = insightsPanel(entry.insights, CARD_PAD.left)
  if (panel) {
    card.push(panel)
    card.push(p('', { after: GAP.tight, size: 8 }))
  }

  out.push(parameterCard(card))
  out.push(p('', { after: GAP.section, size: 8 }))
  return { title, children: out }
}

/** Strip the "Figure N." prefix so the renderer can set it in its own run. */
function stripFigurePrefix(caption, num) {
  const text = String(caption || '')
  const prefix = `Figure ${num}.`
  return text.startsWith(prefix) ? text.slice(prefix.length).trim() : text
}

/**
 * Dataset integrity — readings, coverage, gaps, longest gap, cadence.
 *
 * Presented as metric tiles in the same KPI-strip language as the parameter
 * cards, bounded by the same hairline card, so the page reads as continuous
 * with the parameter sections: the report is checking the dataset, not just
 * plotting it.
 */
export function buildDataQualitySection(model, num) {
  const tiles = (model && model.dataQuality) || []
  if (!tiles.length) return null
  const strip = summaryStripTable(tiles, { bottomBorder: false })
  if (!strip) return null
  return {
    title: 'Dataset integrity',
    children: [
      sectionHeading(num, 'Dataset integrity'),
      // Word needs a paragraph after the nested strip table inside the card;
      // the tiny trailing paragraph supplies it (and the card's inner gap).
      parameterCard([strip, p('', { after: 0, size: 2 })]),
    ],
  }
}

/**
 * Limitations and disclaimer — the standing fixed prose, plus any
 * data-conditional limitation the model surfaced (a missing outdoor baseline).
 * The fixed set is never altered; conditional notes are appended so a reader
 * sees, in one place, both the standing scope and what this session could not
 * evaluate.
 */
export function buildLimitationsSection(model, num) {
  const items = (model && model.limitations) || []
  const conditional = [model && model.outdoorBaselineNote].filter(Boolean)
  if (!items.length && !conditional.length) return null
  return {
    title: 'Limitations',
    children: [
      sectionHeading(num, 'Limitations'),
      ...items.map((t) => p(t, { size: TYPE.fine, color: BODY, after: 80 })),
      ...conditional.map((t) => p(t, { size: TYPE.fine, color: BODY, after: 80 })),
    ],
  }
}

/** Appendix A — the annotated monitoring events, kept out of the body. */
export function buildEventsAppendix(model) {
  const rows = (model && model.events) || []
  if (!rows.length) return null
  return {
    title: 'Monitoring events',
    children: [
      p('Events annotated by the assessor during the monitoring period. Corresponding markers (▲) are shown on the parameter figures.', {
        color: MUTED,
        size: TYPE.small,
        after: 110,
      }),
      dataTable(
        ['Timestamp', 'Event', 'Notes'],
        rows.map((r) => [{ text: r.time || '—', mono: true }, { text: r.label || '—', bold: true }, { text: r.note || '—', muted: true }]),
        [22, 24, 54],
      ),
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
      p('Descriptive statistics for each monitored parameter.', { color: MUTED, size: TYPE.small, after: 110 }),
      dataTable(
        ['Parameter', 'Unit', 'Mean', 'Median', 'Min', 'Max', 'Std dev', '95th', 'n', 'Coverage'],
        rows.map((r) => [
          { text: r.label, bold: true },
          { text: r.unit, muted: true },
          { text: r.mean, mono: true },
          { text: r.median, mono: true },
          { text: r.min, mono: true },
          { text: r.max, mono: true },
          { text: r.stdDev, mono: true },
          { text: r.p95, mono: true },
          { text: r.count, mono: true },
          { text: r.coverage, mono: true },
        ]),
        [17, 8, 9, 9, 8, 9, 9, 8, 9, 14],
        // Ten columns: banding tracks a row across the width better than a
        // hairline, so this technical table keeps the zebra treatment.
        { zebra: true },
      ),
    ],
  }
}

/**
 * The report footer — the traceability block.
 *
 * Rendered unnumbered, below the appendices: it is the colophon of the
 * document, not a section of its argument.
 *
 * It carries no standing notice of its own. The screening-only language is
 * stated once, in §Limitations, where it is itemized in full — repeating a
 * condensed version here said the same thing twice in one document, which
 * weakens rather than reinforces it.
 */
export function buildMetadataSection(model) {
  const rows = (model && model.metadata) || []
  if (!rows.length) return null

  const children = [new Paragraph({ children: [], border: { bottom: hair(HAIR_2) }, spacing: { before: 420, after: 200 } })]
  const grid = metaGrid(rows, 2)
  if (grid) children.push(grid)
  return { title: 'Report metadata', children, footer: true }
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
    ...(model.parameters || []).map((entry) => (n) =>
      buildParameterSection({ ...entry, statementNote: model.statementNote }, n),
    ),
    (n) => buildDataQualitySection(model, n),
    (n) => buildLimitationsSection(model, n),
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

  // The footer carries no number and is emitted after the appendices.
  const footer = buildMetadataSection(model)
  if (footer) body.push(footer)

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
  body.filter((s) => !s.footer).forEach((s) => out.push(...s.children))
  appendices.forEach((s, i) => {
    out.push(sectionHeading(null, `Appendix ${String.fromCharCode(65 + i)} — ${s.title}`))
    out.push(...s.children)
  })
  // The colophon closes the document, after the appendices.
  body.filter((s) => s.footer).forEach((s) => out.push(...s.children))
  return out
}
