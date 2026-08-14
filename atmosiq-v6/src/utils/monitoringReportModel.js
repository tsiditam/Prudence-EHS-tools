/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringReportModel — the Indoor Air Quality Monitoring Report as pure
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
  proseNameShort,
  proseNameTitle,
  unitOf,
  formatValue,
  formatDuration,
  formatTimestamp,
  formatDateOnly,
  formatDateRange,
  formatGeneratedAt,
} from './monitoringInsights'
import { CAL_VALIDITY_DAYS } from './instrumentRegistry'
import { resolveReferences, referenceTableRows, referenceValueLabel } from './referenceProfiles'
import { outdoorDataset, primaryDataset } from './monitoringSession'
import { belowScreeningFloor } from './sensorThresholds'

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

  // TONE is a four-step visual scale; the LABEL stays the locked three-term
  // vocabulary. A reader takes the colour in before the words, so the extra
  // gradation is worth having — but the words are what the report is held to,
  // and "Elevated" or "Investigation Recommended" would be an interpretation
  // of what a measurement means rather than a statement of where it sat.
  if (isNum(reference.limit) && isNum(stats.pctAbove)) {
    if (stats.pctAbove === 0) return { id: 'within', label: 'Within Reference', tone: 'ok' }
    if (stats.pctAbove <= 5) return { id: 'above', label: 'Above Reference', tone: 'notice' }
    if (stats.pctAbove <= 15) return { id: 'above', label: 'Above Reference', tone: 'warn' }
    return { id: 'review', label: 'Review Suggested', tone: 'review' }
  }

  if (reference.band && isNum(stats.pctInBand)) {
    if (stats.pctInBand >= 97) return { id: 'within', label: 'Within Reference', tone: 'ok' }
    if (stats.pctInBand >= 93) return { id: 'outside', label: 'Outside Reference', tone: 'notice' }
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
  // Figure and unit are separate so the renderer can set the unit smaller and
  // quieter than the number, as in the reviewed design. Joining them into one
  // string here would take that decision away from the layout.
  const val = (v) => (isNum(v) ? { value: formatValue(v, param), unit: u } : { value: '—', unit: '' })
  const pctOf = (v) => (isNum(v) ? { value: String(Math.round(v * 10) / 10), unit: '%' } : { value: '—', unit: '' })

  if (reference && reference.band) {
    return [
      { key: 'mean', label: 'Mean', ...val(stats.mean) },
      { key: 'max', label: 'Maximum', ...val(stats.max) },
      { key: 'min', label: 'Minimum', ...val(stats.min) },
      { key: 'pctInBand', label: '% In Band', ...pctOf(stats.pctInBand) },
      // A duration is a compound value ("19 h 30 m"), not a number, so it is
      // flagged for the renderer to set a step smaller — at the figure size a
      // measurement uses, it wraps out of its tile.
      { key: 'timeOutside', label: 'Time Outside', value: formatDuration(stats.timeOutsideSec) || '—', unit: '', compact: true, emphasis: stats.timeOutsideSec > 0 },
    ]
  }

  return [
    { key: 'mean', label: 'Mean', ...val(stats.mean) },
    { key: 'max', label: 'Maximum', ...val(stats.max) },
    { key: 'p95', label: '95th pct', ...val(stats.p95) },
    { key: 'pctAbove', label: '% Above', ...pctOf(stats.pctAbove), emphasis: stats.pctAbove > 0 },
    { key: 'timeAbove', label: 'Time Above', value: formatDuration(stats.timeAboveSec) || '—', unit: '', compact: true, emphasis: stats.timeAboveSec > 0 },
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
 * The logging cadence as an instrument spec rather than a duration:
 * "1-min logging", not "1 m". It sits beside the unit in the parameter
 * header, where a reader is asking how often the instrument sampled.
 */
export function loggingLabel(sec) {
  if (!isNum(sec) || sec <= 0) return null
  if (sec < 60) return `${Math.round(sec)}-sec logging`
  const min = sec / 60
  if (Number.isInteger(min)) return `${min}-min logging`
  return `${Math.round(sec)}-sec logging`
}

/** The same cadence written out, for the instrument spec table. */
export function intervalLabel(sec) {
  if (!isNum(sec) || sec <= 0) return null
  if (sec < 60) {
    const s = Math.round(sec)
    return `${s} second${s === 1 ? '' : 's'}`
  }
  const min = sec / 60
  if (!Number.isInteger(min)) return `${Math.round(sec)} seconds`
  return `${min} minute${min === 1 ? '' : 's'}`
}

/**
 * Calibration stated with its currency, not just its date.
 *
 * A date alone leaves the reader to do the arithmetic, and the whole point of
 * the platform's calibration posture is that the deliverable says where it
 * stands. The window is the live gate's own constant — never a second copy of
 * that number, which is exactly how a gate and its report drift apart.
 *
 * Returns the date unchanged when either date is unreadable: an unverifiable
 * claim about currency is worse than no claim.
 */
export function calibrationLabel(dateStr, referenceIso) {
  const date = str(dateStr).trim()
  if (!date) return null
  const cal = Date.parse(date)
  const ref = referenceIso ? Date.parse(referenceIso) : NaN
  if (!isNum(cal) || !isNum(ref)) return date
  const days = Math.floor((ref - cal) / 86400000)
  // A calibration dated AFTER the reference is not "current" — it is an
  // anomaly (a future/typo date, or one that post-dates this report). Never
  // print it bare, which reads as verified; mark it for review instead. The
  // period-based check in calibrationIntegrity() carries the detail.
  if (days < 0) return `${date} · verify date`
  return `${date} · ${days <= CAL_VALIDITY_DAYS ? 'current' : 'past due'}`
}

const DAY_MS = 86400000

/**
 * Calibration integrity against the MONITORING PERIOD — the check the report
 * was missing. calibrationLabel() only ever compared the calibration date to
 * report-generation time, so an instrument calibrated AFTER the data was
 * collected (a future-dated or transposed date) printed as an ordinary date
 * with no flag. A calibration on record cannot establish accuracy for
 * readings taken before it, so this is defensibility-critical.
 *
 * Pure and screening-safe: it states where the calibration date sits relative
 * to the monitoring window and recommends a qualitative-only reading when the
 * record cannot vouch for the data. It never asserts the data is wrong — only
 * that the calibration record does not cover it.
 *
 * @param {string} calDateStr  session.calibration.date
 * @param {number} periodStartMs  dataset.summary.start (epoch ms)
 * @param {number} periodEndMs    dataset.summary.end (epoch ms)
 * @returns {{status:string, qualitativeOnly:boolean, note:(string|null)}}
 */
export function calibrationIntegrity(calDateStr, periodStartMs, periodEndMs) {
  const date = str(calDateStr).trim()
  if (!date) {
    return {
      status: 'absent',
      qualitativeOnly: true,
      note: 'Instrument calibration was not documented for this monitoring session. Measurements should be interpreted accordingly.',
    }
  }
  const cal = Date.parse(date)
  if (!isNum(cal) || !isNum(periodStartMs)) {
    // Nothing to compare against — do not manufacture a currency claim.
    return { status: 'unverifiable', qualitativeOnly: false, note: null }
  }
  const end = isNum(periodEndMs) ? periodEndMs : periodStartMs

  // The calibration on record was performed AFTER monitoring began. It cannot
  // establish instrument accuracy for data collected before it.
  if (cal > periodStartMs) {
    const afterEnd = cal > end
    return {
      status: 'post_dates_period',
      qualitativeOnly: true,
      note:
        `The recorded instrument calibration date (${date}) falls after the monitoring period ` +
        `${afterEnd ? 'ended' : 'began'}. A calibration on record cannot establish instrument ` +
        'accuracy for data collected before it — confirm the pre-monitoring calibration date. ' +
        'Until it is resolved, these measurements should be treated as qualitative only.',
    }
  }

  // The calibration had already exceeded its validity window before monitoring
  // began.
  const expiry = cal + CAL_VALIDITY_DAYS * DAY_MS
  if (expiry < periodStartMs) {
    return {
      status: 'expired_before_period',
      qualitativeOnly: true,
      note:
        `The recorded instrument calibration (${date}) had exceeded its ${CAL_VALIDITY_DAYS}-day ` +
        'validity window before the monitoring period began. Measurements should be treated as ' +
        'qualitative only pending a valid calibration record.',
    }
  }

  // The calibration lapsed part-way through the monitoring window.
  if (expiry < end) {
    return {
      status: 'lapsed_mid_period',
      qualitativeOnly: true,
      note:
        `The recorded instrument calibration (${date}) exceeded its ${CAL_VALIDITY_DAYS}-day ` +
        'validity window during the monitoring period. Readings collected after the lapse should ' +
        'be treated as qualitative only.',
    }
  }

  return { status: 'ok', qualitativeOnly: false, note: null }
}

/**
 * The caption under a figure.
 *
 * Every clause is conditional on the mark actually being drawn. A caption
 * that explains occupancy shading on a chart with no marked occupancy, or
 * event carets on a chart with no events, teaches the reader to distrust the
 * captions — so each clause is earned by the figure it describes.
 */
export function figureCaption(entry, opts = {}) {
  if (!entry) return ''
  const parts = [`Figure ${entry.figureNumber}. ${entry.shortLabel} over the monitoring period.`]

  const ref = entry.reference
  if (ref && ref.band) {
    parts.push(`Shaded band = ${referenceValueLabel(ref)} comfort range.`)
  } else if (ref && isNum(ref.limit)) {
    parts.push(`Dashed line = ${referenceValueLabel(ref)} screening reference.`)
  }

  const marks = []
  if (opts.hasOccupancy) marks.push('shaded columns = marked occupied hours')
  if (opts.hasEvents) marks.push('▲ = logged events (Appendix A)')
  if (marks.length) parts.push(`${marks.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()))

  return parts.join(' ')
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
  const sparklines = obj(opts.sparklines)

  const occupancy = arr(s.occupancySchedule)
  const covProbe = params.length ? statsByParam[params[0]] && statsByParam[params[0]].coverage : null
  const logging = loggingLabel(covProbe && covProbe.intervalSec)

  let figure = 0
  const parameters = params
    .filter((param) => statsByParam[param])
    .map((param) => {
      const stats = statsByParam[param]
      const ref = references[param] || null
      const refShape = ref ? { limit: ref.limit, band: ref.band } : null
      figure += 1
      const unit = unitOf(param, units)
      // A whole series at/below the analyte's conservative screening detection
      // floor is non-quantitative — flag it so the printed figures are not read
      // as measured concentrations (e.g. HCHO topping out below ~1 ppb).
      const belowDetection = belowScreeningFloor(param, stats.max, unit)
      const entry = {
        param,
        label: proseName(param),
        // The formal heading names the quantity in full and carries its
        // symbol; the short form is what fits on a chip or a caption.
        titleLabel: proseNameTitle(param),
        shortLabel: proseNameShort(param),
        // Mid-sentence form: common nouns lowercase, acronyms preserved. The
        // renderer must never lowercase the label itself — "PM2.5" would
        // become "pm2.5" in the section's opening line.
        midLabel: proseNameMid(param),
        unit,
        // What the parameter header says beneath the name: the unit and how
        // often the instrument sampled.
        headMeta: [unit, logging].filter(Boolean).join(' · '),
        figureNumber: figure,
        status: statusFor(stats, ref),
        reference: ref,
        strip: summaryStrip(param, stats, ref, units),
        statement: parameterStatement(param, stats, refShape, { units }),
        insights: monitoringInsights(param, stats, refShape, { points, events, utcOffsetMin, units }),
        chart: charts[param] || null,
        // The series' shape, for the summary strip: a mean tells you where the
        // readings sat, not whether they were steady or swinging around it.
        spark: sparklines[param] || null,
        stats,
      }
      entry.caption = figureCaption(entry, {
        hasOccupancy: occupancy.length > 0,
        hasEvents: events.length > 0,
      })
      entry.belowDetection = belowDetection
      entry.detectionNote = belowDetection
        ? `${proseNameTitle(param)} readings across the monitoring period fall at or below a conservative screening detection floor (a generic screening floor, not the instrument's published limit of detection); treat these values as qualitative only and confirm against the instrument's stated detection limit before reporting them as measured concentrations.`
        : null
      return entry
    })

  const highlights = datasetHighlights(
    parameters.map((x) => ({ param: x.param, stats: x.stats, reference: x.reference })),
    { units, utcOffsetMin },
  )

  const summary = obj(dataset.summary)
  const cov = parameters.length ? parameters[0].stats.coverage : null

  // The cover's at-a-glance panel: every monitored parameter and where it
  // sat, in one column. Built from the SAME status each parameter section
  // carries, so the cover cannot tell a different story from page six.
  const overview = parameters
    .filter((x) => x.status)
    .map((x) => ({ param: x.param, label: x.label, status: x.status }))

  // Calibration integrity against the monitoring period (not report-gen time).
  // Absence, a future/post-dated record, or a lapse during the window each
  // set a qualitative-only posture and a reader-facing note.
  const calIntegrity = calibrationIntegrity(obj(s.calibration).date, summary.start, summary.end)
  // Anomalies (a record that exists but does not cover the data) are surfaced
  // prominently; a plain "not documented" note stays a quiet disclosure.
  const calibrationAlert =
    calIntegrity.status === 'post_dates_period' ||
    calIntegrity.status === 'expired_before_period' ||
    calIntegrity.status === 'lapsed_mid_period'

  // No outdoor baseline was captured, yet a parameter whose interpretation
  // leans on an indoor/outdoor differential is present. The report states the
  // absence so a reader does not assume the differential was evaluated — the
  // CO₂ ventilation comparison and the PM2.5 indoor/outdoor ratio both need a
  // paired outdoor reference the session did not collect.
  const hasCo2 = params.includes('co2')
  const hasPm25 = params.includes('pm25')
  const outdoorBaselineNote =
    !outdoor && (hasCo2 || hasPm25)
      ? 'No outdoor (background) reference measurements were collected for this monitoring session. ' +
        `Without a paired outdoor baseline, ${[
          hasCo2 ? 'the CO₂ ventilation comparison (ASHRAE 62.1 / Persily 2021)' : null,
          hasPm25 ? 'the PM2.5 indoor/outdoor ratio' : null,
        ]
          .filter(Boolean)
          .join(' and ')} could not be calculated; these parameters are interpreted on an ` +
        'absolute-concentration basis only.'
      : null

  const model = {
    version: MONITORING_REPORT_VERSION,
    edition,
    title: 'Indoor Air Quality Monitoring Report',
    subtitle: null,
    // The site offset every formatted time in this model was rendered at, so
    // a downstream renderer (the figures) labels its axis the same way rather
    // than re-deriving it and disagreeing with the tables.
    utcOffsetMin,

    cover: {
      site: [str(obj(s.location).building), str(obj(s.location).room)].filter(Boolean).join(' — '),
      // The street address is carried separately so the renderer can set it
      // quieter than the site name rather than running the two together.
      address: str(obj(s.location).address),
      preparedFor: str(obj(s.client).preparedFor),
      preparedBy: [str(obj(s.assessor).name), str(obj(s.assessor).credentials)].filter(Boolean).join(', '),
      company: str(obj(s.assessor).company) || str(obj(s.assessor).firm),
      reportDate: opts.generatedAt ? formatDateOnly(Date.parse(opts.generatedAt), { utcOffsetMin }) : null,
      // The cover states the period as one compact range; the exact bounds
      // stay available as `periodStart` / `periodEnd` for any caller that
      // needs them to the minute.
      period: formatDateRange(summary.start, summary.end, { utcOffsetMin }),
      periodStart: isNum(summary.start) ? formatTimestamp(summary.start, { utcOffsetMin }) : null,
      periodEnd: isNum(summary.end) ? formatTimestamp(summary.end, { utcOffsetMin }) : null,
      duration: cov ? durationLabel(cov.durationSec) : '—',
      // The cover lists what was measured, in the compact form: a six-symbol
      // row rather than a wrapped line of full names.
      parameters: parameters.map((x) => x.shortLabel),
    },

    // An optional masthead badge — how a marketing sample or a draft is
    // marked ON the document rather than only in the file name, so a copy
    // that escapes its context still says what it is.
    badge: str(opts.badge) || null,

    // Every monitored parameter and its status, for the cover panel.
    overview,

    // The short facts the running header repeats on every page, so a sheet
    // pulled out of the binder still says what it belongs to.
    ribbon: [
      str(obj(s.client).preparedFor),
      [str(obj(s.location).building), str(obj(s.location).room)].filter(Boolean).join(' · '),
      formatDateRange(summary.start, summary.end, { utcOffsetMin }),
    ].filter(Boolean),

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
      ['Logging interval', cov && isNum(cov.intervalSec) ? intervalLabel(cov.intervalSec) : null],
      ['Timestamp source', obj(s.instrument).timestampSource],
      ['Firmware', obj(s.instrument).firmware],
      ['Calibration', calibrationLabel(obj(s.calibration).date, opts.generatedAt)],
      ['Calibration due', obj(s.calibration).dueDate],
    ].filter(([, v]) => str(v).trim()).map(([label, value]) => ({ label, value: str(value) })),

    // Calibration is never silently absent OR silently anomalous. When it was
    // documented and covers the monitoring window it appears in the instrument
    // table above with no note; when it was not documented, or the recorded
    // date does not cover the data (future/post-dated, or lapsed mid-window),
    // the report SAYS SO rather than leaving a reader to assume it was
    // verified. Surfacing the gap in the deliverable is the platform's standing
    // posture — advisory, visible, and never quietly dropped.
    calibrationNote: calIntegrity.note,
    // The integrity verdict ('ok' | 'absent' | 'post_dates_period' |
    // 'expired_before_period' | 'lapsed_mid_period' | 'unverifiable') and
    // whether it should be surfaced prominently vs. as a quiet disclosure.
    calibrationStatus: calIntegrity.status,
    calibrationAlert,
    // Report-level posture: true when the calibration record cannot vouch for
    // the data, OR any parameter's whole series sits below its screening
    // detection floor. Either makes at least part of the deliverable
    // qualitative rather than quantitative.
    qualitativeOnly: calIntegrity.qualitativeOnly || parameters.some((x) => x.belowDetection),
    // The per-parameter detection caveats, aggregated for any consumer that
    // wants them in one place (they also render with their parameter).
    dataQualityNotes: parameters.filter((x) => x.detectionNote).map((x) => x.detectionNote),
    // Stated when no outdoor baseline was captured but a differential-dependent
    // parameter (CO₂ / PM2.5) is present; null otherwise. Renders under the
    // standing limitations without altering that fixed set.
    outdoorBaselineNote,

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
          { label: 'Logging interval', value: isNum(cov.intervalSec) ? intervalLabel(cov.intervalSec) : '—' },
        ]
      : [],

    events: events.map((e) => ({
      time: formatTimestamp(e.t, { utcOffsetMin }),
      label: str(e.label),
      note: str(e.note),
    })),

    limitations: LIMITATIONS,

    // Removed by product decision: the per-parameter screening/interpretation
    // sentence duplicated the §Limitations boundary. That language now lives
    // once, in `limitations`, so the parameter sections stay uncluttered. The
    // renderer skips a null note.
    statementNote: null,

    metadata: [
      {
        label: 'Report version',
        value: `AtmosFlow Logger Report ${MONITORING_REPORT_VERSION} · ${technical ? 'Technical' : 'Client'} Edition`,
      },
      { label: 'Software', value: str(opts.softwareVersion) ? `AtmosFlow ${str(opts.softwareVersion)}` : '—' },
      { label: 'Generated', value: formatGeneratedAt(str(opts.generatedAt)) || '—' },
      {
        label: 'Dataset SHA-256',
        // The hash is only meaningful next to what it covers, so the reading
        // count travels with it: two datasets can share a prefix, not a count.
        value: str(opts.datasetHash)
          ? `${str(opts.datasetHash)}${isNum(summary.count) ? ` (${summary.count.toLocaleString('en-US')} readings)` : ''}`
          : '—',
      },
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
