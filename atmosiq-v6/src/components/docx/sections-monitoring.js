/**
 * AtmosFlow DOCX — Indoor Environmental Monitoring Report.
 *
 * The thin half of the report pipeline. Everything about WHAT the report says
 * — section order, which sections appear, the numbers, the wording — is
 * decided in `src/utils/monitoringReportModel.js` and arrives here as plain
 * data. This module only turns that model into `docx` nodes.
 *
 * Keeping the split means report CONTENT is covered by fast unit tests over
 * the model, and this layer can be reviewed by eye for layout alone.
 *
 * Reuses the existing report chrome (fonts, colors, tables, headings) so the
 * monitoring report reads as a sibling of the consultant report rather than a
 * different product.
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx'
import { COLORS } from './styles'
import { buildTable, kvTable } from './tables'
import { base64ToUint8Array, inferImageType, isImageDataUrl } from './images'

const p = (text, opts = {}) =>
  new Paragraph({
    children: [
      new TextRun({
        text: String(text ?? ''),
        italics: !!opts.italics,
        bold: !!opts.bold,
        color: opts.color,
        size: opts.size,
      }),
    ],
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
    alignment: opts.align,
  })

const h2 = (text) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } })

const h3 = (text) =>
  new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } })

const MUTED = COLORS?.muted || '595959'

// The embedded chart matches the capture aspect used elsewhere in the report.
const IMG_W = 600
const IMG_H = Math.round(600 * (284 / 664))

/** Cover block: title, subtitle, site, and the who/when/what grid. */
export function buildCoverSection(model) {
  const c = (model && model.cover) || {}
  const out = [
    new Paragraph({ text: model.title, heading: HeadingLevel.TITLE, spacing: { after: 60 } }),
    p(model.subtitle, { color: MUTED, size: 24, after: 200 }),
  ]
  if (c.site) out.push(p(c.site, { bold: true, size: 26, after: 160 }))

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
export function buildObjectiveSection(model) {
  if (!model || !model.objective) return null
  return { title: 'Monitoring objective', children: [h2('Monitoring objective'), p(model.objective)] }
}

/** §02 Location and instrument, as the two tables an IH report expects. */
export function buildLocationInstrumentSection(model) {
  const loc = (model && model.location) || []
  const inst = (model && model.instrument) || []
  if (!loc.length && !inst.length) return null

  const out = [h2('Location & instrument')]
  if (loc.length) {
    out.push(h3('Monitoring location'))
    out.push(kvTable(loc.map((r) => [r.label, r.value])))
  }
  if (inst.length) {
    out.push(h3('Instrument configuration'))
    out.push(kvTable(inst.map((r) => [r.label, r.value])))
  }
  // An undocumented calibration is stated, never left to inference.
  if (model && model.calibrationNote) {
    out.push(p(model.calibrationNote, { italics: true, color: MUTED, size: 18, before: 80 }))
  }
  return { title: 'Location & instrument', children: out }
}

/** §03 Key dataset highlights. */
export function buildHighlightsSection(model) {
  const items = (model && model.highlights) || []
  if (!items.length) return null
  return {
    title: 'Key dataset highlights',
    children: [
      h2('Key dataset highlights'),
      ...items.map((i) => new Paragraph({ text: i.text, bullet: { level: 0 }, spacing: { after: 80 } })),
    ],
  }
}

/**
 * §04 Screening reference values — one consolidated table, so each figure
 * caption can point back here instead of repeating the citation.
 */
export function buildReferenceSection(model) {
  const rows = (model && model.referenceRows) || []
  if (!rows.length) return null

  const out = [
    h2('Screening reference values'),
    p('Each parameter is compared to the screening reference selected for this monitoring session.', { color: MUTED, size: 18 }),
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
 * One parameter: status, summary strip, chart, the deterministic statement,
 * and the Monitoring Insights block.
 */
export function buildParameterSection(entry) {
  if (!entry) return null
  const out = [h2(entry.label)]

  // `midLabel` keeps acronyms intact ("PM2.5", not "pm2.5"); lowercasing the
  // display label here would mangle them.
  out.push(
    p(
      `The following section summarizes measured ${entry.midLabel || entry.label} over the monitoring period and compares the observations to the selected screening reference.`,
      { color: MUTED, size: 18 },
    ),
  )

  if (entry.status) out.push(p(`Status: ${entry.status.label}`, { bold: true, after: 100 }))

  const strip = entry.strip || []
  if (strip.length) {
    out.push(buildTable(strip.map((t) => t.label), [strip.map((t) => t.value)]))
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
      const refNote = entry.reference && (entry.reference.band || entry.reference.limit != null)
        ? ' Reference shown as listed in Screening reference values.'
        : ''
      out.push(
        p(`Figure ${entry.figureNumber}. ${entry.label} over the monitoring period.${refNote}`, {
          color: MUTED,
          size: 18,
          after: 120,
        }),
      )
    } catch {
      /* an unreadable chart must not abort the report */
    }
  }

  if (entry.statement) out.push(p(entry.statement, { after: 100 }))

  const insights = entry.insights || []
  if (insights.length) {
    out.push(p('Monitoring insights', { bold: true, size: 18, before: 80, after: 60 }))
    insights.forEach((i) =>
      out.push(new Paragraph({ text: i.text, bullet: { level: 0 }, spacing: { after: 60 } })),
    )
  }

  return { title: entry.label, children: out }
}

/** Dataset integrity — coverage, gaps, cadence. */
export function buildDataQualitySection(model) {
  const rows = (model && model.dataQuality) || []
  if (!rows.length) return null
  return {
    title: 'Dataset integrity',
    children: [h2('Dataset integrity'), kvTable(rows.map((r) => [r.label, r.value]))],
  }
}

/** Limitations and disclaimer — fixed prose, never generated from data. */
export function buildLimitationsSection(model) {
  const items = (model && model.limitations) || []
  if (!items.length) return null
  return {
    title: 'Limitations',
    children: [h2('Limitations'), ...items.map((t) => p(t, { size: 18, after: 100 }))],
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
export function buildMetadataSection(model) {
  const rows = (model && model.metadata) || []
  if (!rows.length) return null
  return {
    title: 'Report metadata',
    children: [h2('Report metadata'), kvTable(rows.map((r) => [r.label, r.value]))],
  }
}

/**
 * Every section of the report, in order, with the ones that have no data
 * omitted. Appendices are returned separately so the caller can letter them.
 *
 * @returns {{body: object[], appendices: object[]}}
 */
export function buildMonitoringSections(model) {
  if (!model) return { body: [], appendices: [] }

  const body = [
    buildCoverSection(model),
    buildObjectiveSection(model),
    buildLocationInstrumentSection(model),
    buildHighlightsSection(model),
    buildReferenceSection(model),
    ...(model.parameters || []).map(buildParameterSection),
    buildDataQualitySection(model),
    buildLimitationsSection(model),
    buildMetadataSection(model),
  ].filter(Boolean)

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
    out.push(h2(`Appendix ${String.fromCharCode(65 + i)} — ${s.title}`))
    out.push(...s.children)
  })
  return out
}
