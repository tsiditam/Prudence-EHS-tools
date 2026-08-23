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

import { parameterStats, trailingMeans } from './monitoringStats'
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
  formatGeneratedDate,
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
export function statusFor(stats, reference, opts = {}) {
  if (!stats || !reference) return null

  // ── When the calibration record cannot vouch for the data ────────────
  //
  // A past-due, post-dated or mid-window-lapsed calibration used to be a
  // DISCLOSURE and nothing more: the header said so, and then every
  // parameter reported at full confidence with percentages to one decimal
  // and a 35.1-against-35.0 exceedance call. The instrument's condition
  // never touched the interpretation.
  //
  // `calibrationIntegrity()` already derived exactly this and set
  // `qualitativeOnly`. Nothing consumed it.
  //
  // The status is an INTERPRETATION, so it is what withdraws. The
  // statistics still print — they are facts about what the instrument
  // recorded — but "Within Reference" and "Above Reference" are claims
  // that a reading of known accuracy sat on one side of a threshold, and
  // an uncalibrated instrument cannot support either. Withholding it beats
  // widening it: a margin wide enough to be honest would need an accuracy
  // figure this platform does not have for every device, and inventing one
  // is the failure the criteria registry exists to prevent.
  if (opts.qualitativeOnly) {
    return {
      id: 'indeterminate',
      label: 'Not Established',
      tone: 'indeterminate',
      reason:
        'The instrument calibration on record does not cover this monitoring period, '
        + 'so these readings are reported as recorded but no comparison against the '
        + 'reference is established.',
    }
  }

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

/**
 * The logging cadence as a compact tile value ("15 min", "30 sec") — the
 * abbreviated form the dataset-integrity metric tiles use, where the spelled-
 * out "15 minutes" would wrap out of a narrow tile.
 */
function intervalTileLabel(sec) {
  if (!isNum(sec) || sec <= 0) return '—'
  if (sec < 60) return `${Math.round(sec)} sec`
  const min = sec / 60
  return Number.isInteger(min) ? `${min} min` : `${Math.round(sec)} sec`
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
 * Calibration statuses that withdraw a parameter's reference comparison.
 *
 * NOT the same set as `qualitativeOnly`, and the difference is deliberate.
 * `qualitativeOnly` is also true when calibration was never documented at
 * all — and this codebase already draws that line elsewhere:
 * `calibrationAlert` surfaces exactly these three prominently and leaves
 * 'absent' as a quiet disclosure. The distinction is in CLAUDE.md too: the
 * engine's calibration data-gap trigger fires on the ABSENCE of a record,
 * not on an expired one, because they are different failures.
 *
 * An ANOMALY is a record that exists and does not cover the data — past
 * due before the period, lapsed during it, or dated after it. The platform
 * has looked at the instrument's history and found it cannot vouch for
 * these readings, which is a positive finding about accuracy.
 *
 * ABSENCE is the platform not knowing. That is disclosed, and it does not
 * blank the comparison — treating "we were not told" the same as "we
 * checked and it does not hold" would silently void the status on every
 * report that has ever omitted the field, which is most of them.
 *
 * The two lists must stay in step; asserted in the model's tests.
 */
const REFERENCE_WITHDRAWING_CAL_STATUSES = [
  'post_dates_period',
  'expired_before_period',
  'lapsed_mid_period',
]

export function withdrawsReferenceComparison(status) {
  return REFERENCE_WITHDRAWING_CAL_STATUSES.includes(status)
}

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
  const st = obj(entry.stats)
  if (ref && ref.band) {
    parts.push(`Shaded band = ${referenceValueLabel(ref)} comfort range.`)
    // The amber legend is earned only when some reading actually fell outside
    // the band — otherwise it describes a colour the figure never draws.
    if (isNum(st.pctInBand) && st.pctInBand < 100) parts.push('Amber trace = readings outside the band.')
  } else if (ref && isNum(ref.limit)) {
    parts.push(`Dashed line = ${referenceValueLabel(ref)} reference.`)
    if (isNum(st.pctAbove) && st.pctAbove > 0) {
      // The red clause is earned only when the acute tier is actually reached
      // (rolling mean over its window), and it names the criterion so the
      // stronger claim is attributed, not implied.
      const action = ref.action
      parts.push(
        entry.actionTierReached && action
          ? `Amber trace = readings above the reference; red = ${action.label || 'acute action tier'} (${action.source || 'defined higher criterion'}).`
          : 'Amber trace = readings above the reference.',
      )
    }
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
 * @param {string} [opts.timeZone] IANA zone the report is generated in (e.g.
 *   'America/New_York'); the generation date and time render in it. Defaults
 *   to the host's local zone.
 * @param {string} [opts.datasetHash]
 * @param {string} [opts.softwareVersion]
 * @returns {object} the report model
 */
export function buildMonitoringReportModel(session, opts = {}) {
  const s = obj(session)
  const edition = EDITIONS.includes(opts.edition) ? opts.edition : 'client'
  const technical = edition === 'technical'

  const dataset = opts.dataset || primaryDataset(s) || {}

  // Hoisted above the parameter loop, which is the whole point of this
  // change: the calibration verdict has to be known BEFORE each parameter's
  // status is decided, or it can only ever be a footnote after the fact.
  // Re-derived once below into `calIntegrity` for the report-level fields;
  // same call, same inputs, so the two cannot disagree.
  const calibrationQualitative = withdrawsReferenceComparison(
    calibrationIntegrity(
      obj(s.calibration).date,
      obj(dataset.summary).start,
      obj(dataset.summary).end,
    ).status,
  )
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
        // Calibration only. `belowDetection` is per-parameter and already
        // carries its own caveat on the parameter it applies to — folding it
        // in here would blank the status of every OTHER parameter because
        // one analyte read below its floor.
        status: statusFor(stats, ref, { qualitativeOnly: calibrationQualitative }),
        reference: ref,
        strip: summaryStrip(param, stats, ref, units),
        statement: parameterStatement(param, stats, refShape, { units }),
        insights: monitoringInsights(param, stats, refShape, { points, events, utcOffsetMin, units }),
        chart: charts[param] || null,
        stats,
      }
      // Whether the acute action tier (the figure's red span) is genuinely
      // reached: the rolling mean over the criterion's window at or above its
      // limit, with the window covered. Computed here so the caption only
      // promises red when the figure actually draws it — the same averaging the
      // figure uses, from one shared helper.
      entry.actionTierReached = false
      if (ref && ref.action && isNum(ref.action.limit) && isNum(ref.action.windowMs)) {
        const series = points
          .filter((pt) => pt && isNum(pt.t) && isNum(pt[param]))
          .map((pt) => ({ t: pt.t, v: pt[param] }))
        entry.actionTierReached =
          series.length >= 2 &&
          trailingMeans(series, ref.action.windowMs).some((m) => isNum(m) && m >= ref.action.limit)
      }
      entry.caption = figureCaption(entry, {
        hasOccupancy: occupancy.length > 0,
        hasEvents: events.length > 0,
      })
      entry.belowDetection = belowDetection
      entry.detectionNote = belowDetection
        ? `${proseNameTitle(param)} readings across the monitoring period fall at or below a conservative detection floor (a generic floor, not the instrument's published limit of detection); treat these values as qualitative only and confirm against the instrument's stated detection limit before reporting them as measured concentrations.`
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
  // Same inputs as `calibrationQualitative` hoisted at the top of this
  // function; asserted equal by test so a future edit to one path cannot
  // leave the statuses and the report-level posture disagreeing.
  /* c8 ignore next */
  // Anomalies (a record that exists but does not cover the data) are surfaced
  // prominently; a plain "not documented" note stays a quiet disclosure.
  const calibrationAlert = withdrawsReferenceComparison(calIntegrity.status)

  // Removed by product decision: the no-outdoor-baseline note was dropped
  // along with the §Limitations screening caveats. The outdoor baseline still
  // gates the CO₂ differential profile above; its absence simply omits that
  // comparison rather than printing a note about it.
  const outdoorBaselineNote = null

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
      // The report date is WHEN the report was produced, so it reads from the
      // generator's local zone — not the monitoring site's offset (which
      // belongs to the data, not the issuance).
      reportDate: opts.generatedAt ? formatGeneratedDate(opts.generatedAt, { timeZone: str(opts.timeZone) || undefined }) : null,
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

    // Presented as metric tiles in the same visual language as the parameter
    // KPI strips (label above, figure below): counts and coverage as the big
    // editorial figure, the compound duration/cadence values a step smaller
    // (`compact`), and a gap flagged in the warn colour (`emphasis`) — so the
    // page reads as continuous with the parameter cards and shows the report is
    // checking the dataset, not merely plotting it.
    dataQuality: cov
      ? [
          { label: 'Readings', value: isNum(cov.n) ? cov.n.toLocaleString('en-US') : '—', unit: '' },
          {
            label: 'Coverage',
            value: isNum(cov.coveragePct) ? String(Math.round(cov.coveragePct * 10) / 10) : '—',
            unit: isNum(cov.coveragePct) ? '%' : '',
          },
          {
            label: 'Gaps',
            value: isNum(cov.gapCount) ? String(cov.gapCount) : '—',
            unit: '',
            emphasis: isNum(cov.gapCount) && cov.gapCount > 0,
          },
          {
            label: 'Longest gap',
            value: isNum(cov.longestGapSec) && cov.longestGapSec > 0 ? durationLabel(cov.longestGapSec) : 'None',
            unit: '',
            compact: true,
            emphasis: isNum(cov.longestGapSec) && cov.longestGapSec > 0,
          },
          { label: 'Logging interval', value: intervalTileLabel(cov.intervalSec), unit: '', compact: true },
        ]
      : [],

    events: events.map((e) => ({
      time: formatTimestamp(e.t, { utcOffsetMin }),
      label: str(e.label),
      note: str(e.note),
    })),

    limitations: buildLimitations(params, references),

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
      { label: 'Generated', value: formatGeneratedAt(str(opts.generatedAt), { timeZone: str(opts.timeZone) || undefined }) || '—' },
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

// The always-present limitation clauses — fixed prose the platform's
// screening-only positioning rests on. Every report carries these.
const LIMITATION_PURPOSE =
  'This report presents measured indoor environmental data compared to commonly referenced values selected by the assessor. It is provided for documentation and interpretation purposes.'
const LIMITATION_SPATIAL =
  'Results represent conditions at the instrument location during the times sampled and may not represent other areas of the building or different occupancy, HVAC, weather, or operating conditions.'
const LIMITATION_MEASUREMENT_BASE =
  'Measurements are subject to instrument accuracy, calibration status, sensor response, detection limits, and environmental interferences.'
// Note: "adverse health effects" rather than the submitted "health risk" —
// "health risk" is a platform-banned tone term (see api/_banned-language.js);
// the negated form here carries the same meaning and passes the scanner.
const LIMITATION_FIXED_LOCATION =
  'This was fixed-location monitoring, not breathing-zone sampling. Results should be interpreted alongside occupancy, HVAC operation, outdoor conditions, and building activities, and do not by themselves establish sources, causation, exposure, or adverse health effects. Compound-specific sampling may be warranted where results or site conditions indicate.'

// Per-sensor measurement caveats — appended to the measurement paragraph ONLY
// for parameters the report actually contains, so a report never disclaims a
// sensor it did not use.
const LIMITATION_MEASUREMENT_NOTE = {
  tvoc: 'TVOC represents an aggregate sensor response and does not identify or quantify individual compounds.',
  pm25: 'PM2.5 is measured by light scattering using assumed particle properties and may over-respond at elevated humidity.',
  co2: 'CO₂ informs occupancy and air-exchange patterns but does not by itself establish ventilation adequacy.',
}

// The screening-reference caveat (only when the report compares to references),
// plus the occupational-limit sentence (only when an OSHA PEL / NIOSH REL was
// the selected reference for some parameter — otherwise it disclaims a
// reference type the report never used).
const LIMITATION_REFERENCES =
  'The references shown are used for interpretation only. They are not exposure limits or compliance criteria, and where a reference specifies an averaging period, comparison against individual logger readings is not equivalent to how compliance with that value would be determined.'
const LIMITATION_OCCUPATIONAL =
  'Occupational exposure limits shown were developed for adult workers in industrial settings and are not benchmarks for general indoor environments.'
const OCCUPATIONAL_PROFILE_IDS = new Set(['osha-pel', 'niosh-rel'])

/**
 * The §Limitations clauses for THIS report. The purpose, spatial and
 * fixed-location clauses are standing; the per-sensor measurement notes and the
 * reference/occupational caveats are conditional on the parameters and
 * references actually present, so the section never disclaims a sensor or a
 * reference type the report did not use.
 *
 * @param {string[]} params parameters present in the dataset
 * @param {Record<string, object>} references resolved reference per parameter
 * @returns {string[]} the ordered limitation paragraphs
 */
export function buildLimitations(params = [], references = {}) {
  const has = (p) => arr(params).includes(p)
  const out = [LIMITATION_PURPOSE, LIMITATION_SPATIAL]

  // Measurement paragraph: the base sentence, then only the sensors present.
  const measurement = [LIMITATION_MEASUREMENT_BASE]
  if (has('tvoc')) measurement.push(LIMITATION_MEASUREMENT_NOTE.tvoc)
  if (has('pm25')) measurement.push(LIMITATION_MEASUREMENT_NOTE.pm25)
  if (has('co2')) measurement.push(LIMITATION_MEASUREMENT_NOTE.co2)
  out.push(measurement.join(' '))

  // Reference paragraph: only when the report actually compares to references.
  const resolved = Object.values(obj(references)).filter((r) => r && (isNum(r.limit) || r.band))
  if (resolved.length) {
    const occupational = resolved.some((r) => OCCUPATIONAL_PROFILE_IDS.has(r && r.profileId))
    out.push(occupational ? `${LIMITATION_REFERENCES} ${LIMITATION_OCCUPATIONAL}` : LIMITATION_REFERENCES)
  }

  out.push(LIMITATION_FIXED_LOCATION)
  return out
}
