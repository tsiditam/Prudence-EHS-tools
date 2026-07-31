/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringInsights — deterministic prose for the Indoor Environmental
 * Monitoring Report: the per-parameter statement, the per-parameter
 * "Monitoring Insights" bullets, and the report-level "Key dataset highlights".
 *
 * NOT AI. Every sentence here is assembled from a value computed by
 * `monitoringStats`, by a fixed rule, with no model in the loop. The same
 * dataset always produces the same words.
 *
 * ── The line this module does not cross ────────────────────────────────
 * Output states WHAT WAS MEASURED and nothing further:
 *
 *   • No adjectives of judgement — nothing is "poor", "concerning",
 *     "excellent", "inadequate", "acceptable", or "elevated".
 *   • No causation. Where a reading coincides with a logged event the text
 *     says the two CO-OCCURRED in time; it never says one produced the other.
 *   • No health, exposure, or compliance conclusion — those require the
 *     credentialed professional who signs the report.
 *
 * `tests/lib/monitoringInsights.test.ts` runs every generated string through
 * the shared banned-language scanners (`api/_banned-language.js`) so this
 * boundary is machine-enforced, not just documented.
 *
 * Formatting is timezone-independent for the same reason the statistics are:
 * a report must read identically on the assessor's laptop, in CI, and on a
 * reviewer's machine. Callers pass an explicit `utcOffsetMin`.
 */

import { SENSOR_PARAMS } from './sensorParser'

const isNum = (v) => v != null && Number.isFinite(v)

// How each parameter is named in a sentence, and whether it takes the word
// "concentrations" (a gas or particulate does; a temperature does not).
// `mid` is the form used mid-sentence: common nouns lowercase, but an
// acronym or trade designation keeps its case ("PM2.5", "TVOC") — otherwise
// the text reads either shouted or misspelled.
const PROSE = {
  co2: { name: 'Carbon dioxide', mid: 'carbon dioxide', concentration: true },
  pm25: { name: 'PM2.5', mid: 'PM2.5', concentration: true },
  pm10: { name: 'PM10', mid: 'PM10', concentration: true },
  tvoc: { name: 'TVOC', mid: 'TVOC', concentration: true },
  hcho: { name: 'Formaldehyde', mid: 'formaldehyde', concentration: true },
  co: { name: 'Carbon monoxide', mid: 'carbon monoxide', concentration: true },
  temp: { name: 'Temperature', mid: 'temperature', concentration: false },
  rh: { name: 'Relative humidity', mid: 'relative humidity', concentration: false },
  press: { name: 'Barometric pressure', mid: 'barometric pressure', concentration: false },
}

// Reported decimal places. Resolution the instrument and the reader actually
// use — a CO2 reading of "789 ppm" not "789.34 ppm".
const DECIMALS = { co2: 0, pm25: 1, pm10: 1, tvoc: 0, hcho: 0, co: 1, temp: 1, rh: 0, press: 0 }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Display name for a parameter when it opens a sentence. */
export function proseName(param) {
  return (PROSE[param] && PROSE[param].name) || param
}

/** Display name for a parameter mid-sentence (see PROSE.mid). */
export function proseNameMid(param) {
  const spec = PROSE[param]
  return (spec && (spec.mid || spec.name)) || param
}

/**
 * A screening reference rendered at the precision it was AUTHORED in.
 *
 * Reference values are cited standards, not measurements: EPA's PM2.5
 * benchmark is "35 µg/m³", so printing "35.0 µg/m³" (the precision we report
 * *readings* at) would misstate the citation. Integers stay integers.
 */
function formatRefNumber(v) {
  if (!isNum(v)) return null
  return Number.isInteger(v)
    ? v.toLocaleString('en-US')
    : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** The unit string for a parameter, from the single source of truth. */
export function unitOf(param, units = {}) {
  if (units && units[param]) return units[param]
  const spec = SENSOR_PARAMS.find((p) => p.key === param)
  return spec ? spec.unit : ''
}

/** Number with the parameter's reported precision and thousands separators. */
export function formatValue(v, param) {
  if (!isNum(v)) return null
  const d = DECIMALS[param] != null ? DECIMALS[param] : 1
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** "5 h 20 m" / "30 h" / "45 m" / "0 m" — the form a client reads faster than seconds. */
export function formatDuration(sec) {
  if (!isNum(sec) || sec < 0) return null
  const total = Math.round(sec / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} m`
  return m ? `${h} h ${m} m` : `${h} h`
}

/**
 * "Jul 18, 2:14 PM" in site-local time.
 *
 * The offset is applied to the epoch and read back with UTC getters, so the
 * result depends only on (timestamp, offset) — never on the host timezone.
 */
export function formatTimestamp(ms, opts = {}) {
  if (!isNum(ms)) return null
  const d = new Date(ms + (isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0) * 60000)
  const hour24 = d.getUTCHours()
  const h = hour24 % 12 || 12
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h}:${min} ${hour24 >= 12 ? 'PM' : 'AM'}`
}

/** "Jul 31, 2026" — a calendar date with no time of day, same offset rules. */
export function formatDateOnly(ms, opts = {}) {
  if (!isNum(ms)) return null
  const d = new Date(ms + (isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0) * 60000)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** Site-local hour (0–23) for a timestamp, without host-timezone dependency. */
function localHour(ms, utcOffsetMin = 0) {
  if (!isNum(ms)) return null
  return ((Math.floor((ms + utcOffsetMin * 60000) / 3600000) % 24) + 24) % 24
}

/**
 * Percentages, formatted so the number never overstates the record.
 *
 * Two guards matter more than they look:
 *   • A value below 100 never prints as "100%". Rounding 99.96% up would
 *     assert the reference was never exceeded when in fact it was.
 *   • A value above 0 never prints as "0%", for the mirror-image reason.
 * A whole number drops its decimal ("80%", not "80.0%") while a meaningful
 * fraction keeps it ("99.2%").
 */
function pct(v) {
  if (!isNum(v)) return null
  let x = v
  if (x < 100 && x > 99.9) x = 99.9
  if (x > 0 && x < 0.1) x = 0.1
  const rounded = Math.round(x * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

/** As `pct`, rounded to whole percent, with the same no-overstatement guards. */
function pctWhole(v) {
  if (!isNum(v)) return null
  let x = Math.round(v)
  if (x === 100 && v < 100) x = 99
  if (x === 0 && v > 0) x = 1
  return `${x}%`
}

/** How a reference is described in prose, for either reference shape. */
function referenceText(reference, param, units) {
  if (!reference) return null
  const u = unitOf(param, units)
  if (isNum(reference.limit)) return `${formatRefNumber(reference.limit)} ${u}`.trim()
  if (Array.isArray(reference.band) && isNum(reference.band[0]) && isNum(reference.band[1])) {
    return `${formatRefNumber(reference.band[0])}–${formatRefNumber(reference.band[1])} ${u}`.trim()
  }
  return null
}

/**
 * The single deterministic sentence under each parameter's chart.
 *
 * Strictly "measured value vs. the selected reference". Returns null when
 * there is no reference to compare against — the report then prints the
 * statistics alone rather than inventing a comparison.
 *
 * @returns {string|null}
 */
export function parameterStatement(param, stats, reference, opts = {}) {
  if (!stats) return null
  const refText = referenceText(reference, param, opts.units)
  if (!refText) return null
  const spec = PROSE[param] || { name: param, concentration: false }
  const subject = spec.concentration ? `${spec.name} concentrations` : spec.name

  if (isNum(stats.pctAbove)) {
    if (stats.pctAbove === 0) {
      return `${subject} remained below the selected screening reference (${refText}) throughout the monitoring period.`
    }
    return `${subject} remained below the selected screening reference (${refText}) during ${pctWhole(100 - stats.pctAbove)} of logged measurements.`
  }

  if (isNum(stats.pctInBand)) {
    if (stats.pctInBand === 100) {
      return `${subject} remained within the selected comfort range (${refText}) throughout the monitoring period.`
    }
    return `${subject} remained within the selected comfort range (${refText}) during ${pctWhole(stats.pctInBand)} of the monitoring period.`
  }

  return null
}

/**
 * Per-parameter "Monitoring Insights" — the factual observations that let a
 * non-technical reader see the pattern without being told what it means.
 *
 * Each bullet is emitted only when the data supports it, so a short or
 * partial dataset produces fewer bullets rather than weaker ones.
 *
 * @param {object} opts
 * @param {object[]} [opts.points] parsed points (for the overnight bullet)
 * @param {object[]} [opts.events] [{ t, label }] logged monitoring events
 * @param {number}  [opts.utcOffsetMin]
 * @param {object}  [opts.units]
 * @returns {{id:string, text:string}[]}
 */
export function monitoringInsights(param, stats, reference, opts = {}) {
  if (!stats) return []
  const out = []
  const offset = isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0
  const u = unitOf(param, opts.units)
  const spec = PROSE[param] || { name: param, concentration: false }
  const noun = spec.concentration ? 'concentration' : 'reading'

  // 1. When the maximum occurred — the most-read fact in the section.
  if (isNum(stats.max)) {
    const when = formatTimestamp(stats.maxAt, { utcOffsetMin: offset })
    const hour = localHour(stats.maxAt, offset)
    const occupied = stats.occupancy && stats.occupancy.meanOccupied != null && stats.maxAt != null
      ? isNum(hour) && hour >= 12 && hour < 18
      : false
    if (when && occupied) {
      out.push({ id: 'peak-timing', text: `Highest ${noun} recorded during marked occupied hours, on ${when}.` })
    } else if (when) {
      out.push({ id: 'peak-timing', text: `Highest ${noun} recorded on ${when} (${formatValue(stats.max, param)} ${u}).`.replace(' ()', '') })
    }
  }

  // 2. Overnight level — states the measured average, and lets the reader
  //    compare it with the daytime figures themselves.
  if (Array.isArray(opts.points) && opts.points.length) {
    const night = opts.points
      .filter((p) => p && isNum(p[param]) && isNum(p.t))
      .filter((p) => {
        const h = localHour(p.t, offset)
        return h != null && (h < 5 || h >= 22)
      })
      .map((p) => p[param])
    if (night.length >= 3) {
      const avg = night.reduce((a, b) => a + b, 0) / night.length
      out.push({ id: 'overnight', text: `Overnight readings (22:00–05:00) averaged ${formatValue(avg, param)} ${u}.`.trim() })
    }
  }

  // 3. Time above / outside the selected reference — or its explicit absence.
  if (isNum(stats.pctAbove)) {
    if (stats.timeAboveSec === 0 || stats.pctAbove === 0) {
      out.push({ id: 'time-above', text: 'The selected screening reference was not exceeded during the monitoring period.' })
    } else if (isNum(stats.timeAboveSec)) {
      out.push({ id: 'time-above', text: `Readings were above the selected screening reference for ${formatDuration(stats.timeAboveSec)}.` })
    }
  } else if (isNum(stats.pctInBand)) {
    if (stats.timeOutsideSec === 0 || stats.pctInBand === 100) {
      out.push({ id: 'time-outside', text: 'Readings remained within the selected comfort range for the full monitoring period.' })
    } else if (isNum(stats.timeOutsideSec)) {
      out.push({ id: 'time-outside', text: `Readings were outside the selected comfort range for ${formatDuration(stats.timeOutsideSec)}.` })
    }
  }

  // 4. Occupied vs unoccupied difference — a measured difference, stated as a
  //    difference. What it implies about ventilation is the assessor's call.
  const delta = stats.occupancy && stats.occupancy.delta
  if (isNum(delta) && Math.abs(delta) >= 1) {
    const dir = delta > 0 ? 'higher' : 'lower'
    out.push({
      id: 'occupancy-delta',
      text: `Readings averaged ${formatValue(Math.abs(delta), param)} ${u} ${dir} during marked occupied hours than outside them.`.replace(/\s+/g, ' '),
    })
  }

  // 5. Co-occurrence with a logged event. States that the maximum fell within
  //    the window of an annotated event — a timing fact. It does NOT attribute
  //    the reading to the event; only the assessor can do that.
  if (Array.isArray(opts.events) && isNum(stats.maxAt)) {
    const windowMs = (isNum(opts.eventWindowMin) ? opts.eventWindowMin : 60) * 60000
    const near = opts.events.find((e) => e && isNum(e.t) && Math.abs(e.t - stats.maxAt) <= windowMs && e.label)
    if (near) {
      out.push({ id: 'event-cooccurrence', text: `The highest ${noun} was recorded within ${Math.round(windowMs / 60000)} minutes of a logged event (${near.label}).` })
    }
  }

  return out
}

/**
 * Report-level "Key dataset highlights" — the section a reader remembers.
 *
 * Draws across parameters, ordered so the most-cited facts lead: where the
 * maximum fell, then how much of the period each parameter sat inside its
 * reference, then the occupancy difference.
 *
 * @param {{param:string, stats:object, reference:object}[]} blocks
 * @param {object} opts as for monitoringInsights, plus `max` (cap, default 6)
 * @returns {{id:string, text:string}[]}
 */
export function datasetHighlights(blocks, opts = {}) {
  const list = (Array.isArray(blocks) ? blocks : []).filter((b) => b && b.stats)
  if (!list.length) return []
  const offset = isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0
  const cap = isNum(opts.max) ? opts.max : 6
  const out = []

  // Lead with the peak of the parameter that spent the most time above its
  // reference — the dataset's most-cited single fact.
  const byExposure = [...list]
    .filter((b) => isNum(b.stats.pctAbove) && b.stats.pctAbove > 0)
    .sort((a, b) => b.stats.pctAbove - a.stats.pctAbove)
  const lead = byExposure[0]
  if (lead) {
    const when = formatTimestamp(lead.stats.maxAt, { utcOffsetMin: offset })
    const u = unitOf(lead.param, opts.units)
    if (when) {
      out.push({
        id: `peak-${lead.param}`,
        text: `Highest ${proseNameMid(lead.param)} reading occurred ${when} (${formatValue(lead.stats.max, lead.param)} ${u}).`.replace(/\s+/g, ' '),
      })
    }
  }

  // Each parameter's share of the period inside its selected reference.
  // Emitted for every parameter INCLUDING the one that led above: "how high,
  // and when" and "how much of the time" are different facts, and the second
  // is usually the one a client acts on. The cap keeps the section short.
  list.forEach((b) => {
    if (out.length >= cap) return
    const name = proseName(b.param)
    if (isNum(b.stats.pctAbove)) {
      if (b.stats.pctAbove === 0) {
        out.push({ id: `within-${b.param}`, text: `${name} did not exceed the selected screening reference at any point during monitoring.` })
      } else {
        out.push({ id: `within-${b.param}`, text: `${name} remained below the selected screening reference for ${pct(100 - b.stats.pctAbove)} of monitoring.` })
      }
    } else if (isNum(b.stats.pctInBand)) {
      out.push({ id: `within-${b.param}`, text: `${name} remained within the selected comfort range for ${pct(b.stats.pctInBand)} of the monitoring period.` })
    }
  })

  // The occupied/unoccupied difference, from the parameter that shows the
  // largest one (typically CO2 — the clearest occupancy signal).
  const withDelta = list
    .filter((b) => b.stats.occupancy && isNum(b.stats.occupancy.delta))
    .sort((a, b) => Math.abs(b.stats.occupancy.delta) - Math.abs(a.stats.occupancy.delta))[0]
  if (withDelta && out.length < cap) {
    const d = withDelta.stats.occupancy.delta
    if (Math.abs(d) >= 1) {
      out.push({
        id: `occupancy-${withDelta.param}`,
        text: `${proseName(withDelta.param)} averaged ${formatValue(Math.abs(d), withDelta.param)} ${unitOf(withDelta.param, opts.units)} ${d > 0 ? 'higher' : 'lower'} during marked occupied hours.`.replace(/\s+/g, ' '),
      })
    }
  }

  return out.slice(0, cap)
}
