/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringReportModel — the Indoor Environmental Monitoring Report as pure
 * data, one step before it becomes a document.
 *
 * The report is built in two layers on purpose:
 *
 *   session + datasets ──► MODEL (this file, pure)  ──► DOCX / PDF (renderer)
 *
 * Everything that decides WHAT the report says lives here and is testable
 * without a document library: section order, which sections appear at all,
 * the status vocabulary, the statistics in each strip, the generated prose.
 * The renderer only decides how it looks. This mirrors the projector/adapter
 * split already used by the knowledge graph, and it means a change to report
 * content is caught by a fast unit test rather than by opening a .docx.
 *
 * ── Editions ───────────────────────────────────────────────────────────
 * Client and Technical are the SAME model with different sections included,
 * never a second pipeline — so the two can never disagree about a number.
 *
 * ── Status vocabulary ──────────────────────────────────────────────────
 * Within Reference · Above Reference · Outside Reference · Review Suggested
 *
 * Deliberately not "Elevated": that reads as an interpretation of what a
 * measurement means. These four say only where the measurement sat relative
 * to the reference the assessor selected — and "Review Suggested" asks for a
 * professional's eye rather than pronouncing on the result.
 * "Outside" (not "Above") is used for comfort bands, which can be breached
 * in either direction.
 */

import { parameterStats } from './monitoringStats'
import {
  parameterStatement,
  monitoringInsights,
  datasetHighlights,
  proseName,
  proseNameMid,
  unitOf,
  formatValue,
  formatDuration,
  formatTimestamp,
  formatDateOnly,
} from './monitoringInsights'
import { resolveReferences, referenceTableRows } from './referenceProfiles'
import { outdoorDataset, primaryDataset } from './monitoringSession'

/** Report format version, stamped into the metadata block. */
export const MONITORING_REPORT_VERSION = 'v1.0'

export const EDITIONS = ['client', 'technical']

const isNum = (v) => v != null && Number.isFinite(v)
const str = (v) => (typeof v === 'string' ? v : '')
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' ? v : {})

/**
 * Where a parameter's readings sat relative to its selected reference.
 * Returns null when no reference was resolved — the section then shows the
 * statistics with no status claim at all.
 */
export function statusFor(stats, reference) {
  if (!stats || !reference) return null

  if (isNum(reference.limit) && isNum(stats.pctAbove)) {
    if (stats.pctAbove === 0) return { id: 'within', label: 'Within Reference', tone: 'ok' }
    if (stats.pctAbove <= 15) return { id: 'above', label: 'Above Reference', tone: 'warn' }
    return { id: 'review', label: 'Review Suggested', tone: 'review' }
  }

  if (reference.band && isNum(stats.pctInBand)) {
    if (stats.pctInBand >= 97) return { id: 'within', label: 'Within Reference', tone: 'ok' }
    if (stats.pctInBand >= 90) return { id: 'outside', label: 'Outside Reference', tone: 'warn' }
    return { id: 'review', label: 'Review Suggested', tone: 'review' }
  }

  return null
}

/**
 * The five-tile summary strip. Tiles differ by reference shape because the
 * questions differ: a threshold asks "how far above, and for how long", a
 * comfort band asks "how much of the time inside, and how long outside".
 * A 95th percentile of a comfort band would be meaningless.
 */
export function summaryStrip(param, stats, reference, units) {
  if (!stats) return []
  const u = unitOf(param, units)
  const val = (v) => (isNum(v) ? `${formatValue(v, param)} ${u}`.trim() : '—')
  const pctOf = (v) => (isNum(v) ? `${Math.round(v * 10) / 10}%` : '—')

  if (reference && reference.band) {
    return [
      { key: 'mean', label: 'Mean', value: val(stats.mean) },
      { key: 'max', label: 'Maximum', value: val(stats.max) },
      { key: 'min', label: 'Minimum', value: val(stats.min) },
      { key: 'pctInBand', label: '% In Range', value: pctOf(stats.pctInBand) },
      { key: 'timeOutside', label: 'Time Outside', value: formatDuration(stats.timeOutsideSec) || '—', emphasis: stats.timeOutsideSec > 0 },
    ]
  }

  return [
    { key: 'mean', label: 'Mean', value: val(stats.mean) },
    { key: 'max', label: 'Maximum', value: val(stats.max) },
    { key: 'p95', label: '95th Percentile', value: val(stats.p95) },
    { key: 'pctAbove', label: '% Above Reference', value: pctOf(stats.pctAbove), emphasis: stats.pctAbove > 0 },
    { key: 'timeAbove', label: 'Time Above Reference', value: formatDuration(stats.timeAboveSec) || '—', emphasis: stats.timeAboveSec > 0 },
  ]
}

/** Full descriptive statistics — the Technical edition's Appendix. */
export function rawStatisticsRow(param, stats, units) {
  const u = unitOf(param, units)
  const n = (v) => (isNum(v) ? formatValue(v, param) : '—')
  return {
    param,
    label: proseName(param),
    unit: u,
    mean: n(stats.mean),
    median: n(stats.median),
    min: n(stats.min),
    max: n(stats.max),
    stdDev: n(stats.stdDev),
    p95: n(stats.p95),
    count: isNum(stats.n) ? String(stats.n) : '—',
    coverage: isNum(stats.coverage && stats.coverage.coveragePct)
      ? `${Math.round(stats.coverage.coveragePct * 10) / 10}%`
      : '—',
  }
}

function durationLabel(sec) {
  if (!isNum(sec)) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} h ${m} m` : `${m} m`
}

/**
 * Build the complete report model.
 *
 * @param {object} session a MonitoringSession
 * @param {object} opts
 * @param {object} [opts.dataset] the parsed dataset to report on; defaults to
 *   the session's primary indoor dataset
 * @param {string} [opts.edition='client']
 * @param {Record<string,string>} [opts.charts] param → chart image data URL
 * @param {string} [opts.generatedAt] ISO timestamp
 * @param {string} [opts.datasetHash]
 * @param {string} [opts.softwareVersion]
 * @returns {object} the report model
 */
export function buildMonitoringReportModel(session, opts = {}) {
  const s = obj(session)
  const edition = EDITIONS.includes(opts.edition) ? opts.edition : 'client'
  const technical = edition === 'technical'

  const dataset = opts.dataset || primaryDataset(s) || {}
  const points = arr(dataset.points)
  const units = obj(dataset.units)
  const params = arr(dataset.params)
  const utcOffsetMin = isNum(s.utcOffsetMin) ? s.utcOffsetMin : 0

  // The outdoor baseline, when captured, unlocks the CO₂ differential
  // reference — resolved here so the profile layer stays pure.
  const outdoor = outdoorDataset(s)
  const outdoorBaseline = outdoor && outdoor.summary && outdoor.summary.stats && outdoor.summary.stats.co2
    ? outdoor.summary.stats.co2.mean
    : null

  const references = resolveReferences(params, obj(s.referenceProfiles), {
    units,
    ts: dataset.summary && dataset.summary.start,
    outdoorBaseline,
    custom: obj(s.customRanges),
  })

  // One statistics pass per parameter, shared by every section below so the
  // strip, the prose, and the appendix can never disagree.
  const statsByParam = {}
  params.forEach((param) => {
    const ref = references[param]
    statsByParam[param] = parameterStats(points, param, {
      reference: ref ? { limit: ref.limit, band: ref.band } : undefined,
      occupancyWindows: arr(s.occupancySchedule),
      utcOffsetMin,
    })
  })

  const events = arr(s.events)
  const charts = obj(opts.charts)

  let figure = 0
  const parameters = params
    .filter((param) => statsByParam[param])
    .map((param) => {
      const stats = statsByParam[param]
      const ref = references[param] || null
      const refShape = ref ? { limit: ref.limit, band: ref.band } : null
      figure += 1
      return {
        param,
        label: proseName(param),
        // Mid-sentence form: common nouns lowercase, acronyms preserved. The
        // renderer must never lowercase the label itself — "PM2.5" would
        // become "pm2.5" in the section's opening line.
        midLabel: proseNameMid(param),
        unit: unitOf(param, units),
        figureNumber: figure,
        status: statusFor(stats, ref),
        reference: ref,
        strip: summaryStrip(param, stats, ref, units),
        statement: parameterStatement(param, stats, refShape, { units }),
        insights: monitoringInsights(param, stats, refShape, { points, events, utcOffsetMin, units }),
        chart: charts[param] || null,
        stats,
      }
    })

  const highlights = datasetHighlights(
    parameters.map((x) => ({ param: x.param, stats: x.stats, reference: x.reference })),
    { units, utcOffsetMin },
  )

  const summary = obj(dataset.summary)
  const cov = parameters.length ? parameters[0].stats.coverage : null

  const model = {
    version: MONITORING_REPORT_VERSION,
    edition,
    title: 'Indoor Environmental Monitoring Report',
    subtitle: 'Monitoring Summary',

    cover: {
      site: [str(obj(s.location).building), str(obj(s.location).room)].filter(Boolean).join(' — '),
      preparedFor: str(obj(s.client).preparedFor),
      preparedBy: [str(obj(s.assessor).name), str(obj(s.assessor).credentials)].filter(Boolean).join(', '),
      company: str(obj(s.assessor).company),
      reportDate: opts.generatedAt ? formatDateOnly(Date.parse(opts.generatedAt), { utcOffsetMin }) : null,
      periodStart: isNum(summary.start) ? formatTimestamp(summary.start, { utcOffsetMin }) : null,
      periodEnd: isNum(summary.end) ? formatTimestamp(summary.end, { utcOffsetMin }) : null,
      duration: cov ? durationLabel(cov.durationSec) : '—',
      parameters: parameters.map((x) => x.label),
    },

    objective: str(s.objective),

    location: [
      ['Building', obj(s.location).building],
      ['Floor', obj(s.location).floor],
      ['Room', obj(s.location).room],
      ['Zone', obj(s.location).zone],
      ['Sensor position', obj(s.location).sensorPosition],
      ['Elevation', obj(s.location).elevation],
    ].filter(([, v]) => str(v).trim()).map(([label, value]) => ({ label, value: str(value) })),

    instrument: [
      ['Instrument', [str(obj(s.instrument).make), str(obj(s.instrument).model)].filter(Boolean).join(' ')],
      ['Serial', obj(s.instrument).serial],
      ['Logging interval', cov && isNum(cov.intervalSec) ? durationLabel(cov.intervalSec) : null],
      ['Timestamp source', obj(s.instrument).timestampSource],
      ['Firmware', obj(s.instrument).firmware],
      ['Calibration', obj(s.calibration).date],
      ['Calibration due', obj(s.calibration).dueDate],
    ].filter(([, v]) => str(v).trim()).map(([label, value]) => ({ label, value: str(value) })),

    // Calibration is never silently absent. When it was documented it appears
    // in the instrument table above; when it was not, the report SAYS SO
    // rather than leaving a reader to assume it was verified. Surfacing the
    // gap in the deliverable is the platform's standing posture — advisory,
    // visible, and never quietly dropped.
    calibrationNote: str(obj(s.calibration).date).trim()
      ? null
      : 'Instrument calibration was not documented for this monitoring session. Measurements should be interpreted accordingly.',

    highlights,
    // The table is read by a client: rows show "Carbon dioxide", not "co2".
    referenceRows: referenceTableRows(references).map((r) => ({ ...r, label: proseName(r.param) })),
    parameters,

    dataQuality: cov
      ? [
          { label: 'Readings', value: isNum(cov.n) ? String(cov.n) : '—' },
          { label: 'Coverage', value: isNum(cov.coveragePct) ? `${Math.round(cov.coveragePct * 10) / 10}%` : '—' },
          { label: 'Gaps', value: isNum(cov.gapCount) ? String(cov.gapCount) : '—' },
          { label: 'Longest gap', value: isNum(cov.longestGapSec) ? durationLabel(cov.longestGapSec) : 'None' },
          { label: 'Logging interval', value: isNum(cov.intervalSec) ? durationLabel(cov.intervalSec) : '—' },
        ]
      : [],

    events: events.map((e) => ({
      time: formatTimestamp(e.t, { utcOffsetMin }),
      label: str(e.label),
      note: str(e.note),
    })),

    limitations: LIMITATIONS,

    metadata: [
      { label: 'Report version', value: `AtmosFlow Logger Report ${MONITORING_REPORT_VERSION}` },
      { label: 'Edition', value: technical ? 'Technical' : 'Client' },
      { label: 'Generated', value: str(opts.generatedAt) || '—' },
      { label: 'Software', value: str(opts.softwareVersion) || '—' },
      { label: 'Dataset SHA-256', value: str(opts.datasetHash) || '—' },
      { label: 'Readings', value: isNum(summary.count) ? String(summary.count) : '—' },
    ],

    // Technical-only appendices. Present as an empty array on the Client
    // edition so consumers never branch on undefined.
    rawStatistics: technical
      ? parameters.map((x) => rawStatisticsRow(x.param, x.stats, units))
      : [],
    qualityFlags: technical ? arr(dataset.quality && dataset.quality.flags) : [],
  }

  return model
}

/**
 * Standing limitations. Fixed prose, not generated: this is the language the
 * platform's screening-only positioning rests on, so it must not vary with
 * the data.
 */
export const LIMITATIONS = [
  'This report presents measured indoor environmental data compared to commonly referenced screening values selected by the assessor. It is provided for screening and documentation purposes.',
  'This report does not constitute a compliance or regulatory determination, a health assessment, or a professional opinion on causation, and it is not a substitute for evaluation by a qualified indoor air quality professional.',
  'Carbon dioxide is presented as an indicator of ventilation adequacy per occupant, not as a health-based exposure limit.',
  'Measurements represent the conditions present at the monitored location during the stated monitoring period only, and may not represent conditions at other locations or times.',
]
