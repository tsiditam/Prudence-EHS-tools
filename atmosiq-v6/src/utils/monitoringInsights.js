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
// `short` is the column-width form used on chips, figure captions and the
// cover's parameter list; `title` is the formal section heading, which names
// the quantity in full and carries its symbol so a reader who knows only one
// of the two still finds the section.
const PROSE = {
  co2: { name: 'Carbon dioxide', mid: 'carbon dioxide', short: 'CO₂', title: 'Carbon dioxide (CO₂)', concentration: true },
  pm25: { name: 'PM2.5', mid: 'PM2.5', short: 'PM2.5', title: 'Particulate matter (PM2.5)', concentration: true },
  pm10: { name: 'PM10', mid: 'PM10', short: 'PM10', title: 'Particulate matter (PM10)', concentration: true },
  tvoc: { name: 'TVOC', mid: 'TVOC', short: 'TVOC', title: 'Total volatile organic compounds (TVOC)', concentration: true },
  hcho: { name: 'Formaldehyde', mid: 'formaldehyde', short: 'HCHO', title: 'Formaldehyde (HCHO)', concentration: true },
  co: { name: 'Carbon monoxide', mid: 'carbon monoxide', short: 'CO', title: 'Carbon monoxide (CO)', concentration: true },
  temp: { name: 'Temperature', mid: 'temperature', short: 'Temp', title: 'Temperature', concentration: false },
  rh: { name: 'Relative humidity', mid: 'relative humidity', short: 'RH', title: 'Relative humidity', concentration: false },
  press: { name: 'Barometric pressure', mid: 'barometric pressure', short: 'Pressure', title: 'Barometric pressure', concentration: false },
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

/** Compact display name — chips, figure captions, the cover parameter list. */
export function proseNameShort(param) {
  const spec = PROSE[param]
  return (spec && (spec.short || spec.name)) || param
}

/** Formal section heading, naming the quantity in full with its symbol. */
export function proseNameTitle(param) {
  const spec = PROSE[param]
  return (spec && (spec.title || spec.name)) || param
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
  const declared = DECIMALS[param] != null ? DECIMALS[param] : 1
  const d = precisionFor(v, declared)
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/**
 * The declared precision, widened only far enough to keep a reading from
 * rounding away to nothing.
 *
 * DECIMALS is set per parameter for the unit each is USUALLY logged in, and
 * for that unit it is right: CO₂ reads "789 ppm", not "789.34 ppm". But the
 * same parameter can arrive in a unit two or three orders of magnitude
 * smaller — TVOC in ppm from a PID, formaldehyde in mg/m³ from a Q-Trak —
 * and there the declared precision prints a real measurement as "0".
 *
 * A report that states the mean was "0 mg/m³" when it was 0.020 is not
 * imprecise, it is false, and this platform's entire value is that its
 * numbers can be relied on.
 *
 * So the widening is deliberately minimal: precision is raised ONLY when the
 * declared value would round to zero, and then only to two significant
 * figures. Every reading that already prints as a non-zero number keeps
 * exactly the precision it has today — over-claiming precision on a
 * measurement is its own kind of defect.
 */
function precisionFor(v, declared) {
  const a = Math.abs(v)
  if (a === 0) return declared
  if (Number(a.toFixed(declared)) !== 0) return declared
  return Math.max(declared, 1 - Math.floor(Math.log10(a)))
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

/**
 * A monitoring period as one compact range — "Jul 15 – 18, 2026".
 *
 * The cover states WHEN monitoring ran, not when each end of it fell to the
 * minute; the exact bounds are in §Dataset integrity and in the figures. The
 * month and year collapse only when both ends share them.
 */
export function formatDateRange(startMs, endMs, opts = {}) {
  if (!isNum(startMs) || !isNum(endMs)) return null
  const off = (isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0) * 60000
  const a = new Date(startMs + off)
  const b = new Date(endMs + off)
  const [am, ad, ay] = [a.getUTCMonth(), a.getUTCDate(), a.getUTCFullYear()]
  const [bm, bd, by] = [b.getUTCMonth(), b.getUTCDate(), b.getUTCFullYear()]
  if (ay !== by) return `${MONTHS[am]} ${ad}, ${ay} – ${MONTHS[bm]} ${bd}, ${by}`
  if (am !== bm) return `${MONTHS[am]} ${ad} – ${MONTHS[bm]} ${bd}, ${by}`
  if (ad !== bd) return `${MONTHS[am]} ${ad} – ${bd}, ${by}`
  return `${MONTHS[am]} ${ad}, ${ay}`
}

/**
 * Break a timestamp into its calendar/clock parts in a given IANA time zone,
 * using the platform's own zone database — so daylight time is handled
 * correctly (EDT in summer, EST in winter) and the abbreviation is the real
 * one for that date, not a fixed guess.
 *
 * `timeZone` omitted → the host's local zone. In the browser that is the
 * machine generating the report, which is exactly whose clock the generation
 * stamp should read from.
 */
function zonedParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(new Date(ms))
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || ''
  return {
    month: g('month'),
    day: g('day'),
    year: g('year'),
    hour: g('hour'),
    minute: g('minute'),
    period: (g('dayPeriod') || '').toUpperCase(),
    zone: g('timeZoneName'),
  }
}

/**
 * The generation date, in the generator's local zone — "8-15-2026".
 *
 * This is the date the report was produced, so it reads from the clock of the
 * machine that produced it (or an explicit `timeZone`), not the monitoring
 * site's offset.
 */
export function formatGeneratedDate(iso, opts = {}) {
  const ms = typeof iso === 'string' && iso ? Date.parse(iso) : isNum(iso) ? iso : NaN
  if (!isNum(ms)) return typeof iso === 'string' ? iso || null : null
  try {
    const p = zonedParts(ms, opts.timeZone)
    return `${p.month}-${p.day}-${p.year}`
  } catch {
    const d = new Date(ms)
    return `${d.getUTCMonth() + 1}-${d.getUTCDate()}-${d.getUTCFullYear()}`
  }
}

/**
 * A generation timestamp in a normal, local format — "8-15-2026, 9:16 PM EDT".
 *
 * Date and time as a reader expects them, in the time zone the report was
 * generated in, with the real zone abbreviation for that date. Still
 * unambiguous enough to tell two copies of a report apart — the point of the
 * stamp — without reading as a machine string.
 */
export function formatGeneratedAt(iso, opts = {}) {
  const ms = typeof iso === 'string' && iso ? Date.parse(iso) : isNum(iso) ? iso : NaN
  if (!isNum(ms)) return typeof iso === 'string' ? iso || null : null
  try {
    const p = zonedParts(ms, opts.timeZone)
    return `${p.month}-${p.day}-${p.year}, ${p.hour}:${p.minute} ${p.period}${p.zone ? ` ${p.zone}` : ''}`
  } catch {
    // Fallback: UTC, unambiguous, if the platform lacks zone data.
    const d = new Date(ms)
    const two = (n) => String(n).padStart(2, '0')
    const h = d.getUTCHours() % 12 || 12
    return `${d.getUTCMonth() + 1}-${d.getUTCDate()}-${d.getUTCFullYear()}, ${h}:${two(d.getUTCMinutes())} ${d.getUTCHours() >= 12 ? 'PM' : 'AM'} UTC`
  }
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
    // ANY exceedance is stated as an exceedance. Framing a screening-reference
    // exceedance as "remained below … during X%" reads as minimization to a
    // reviewer and contradicts the section's own status chip — a 93.5%-above
    // ("remained below during 7%") or a 48%-above ("remained below during 52%")
    // sentence under a "Review Suggested" chip is exactly the kind of thing that
    // draws a hard question. The exceedance carries the strip's own one-decimal
    // "% Above" precision.
    return `${subject} exceeded the selected screening reference (${refText}) during ${pct(stats.pctAbove)} of logged measurements.`
  }

  if (isNum(stats.pctInBand)) {
    if (stats.pctInBand === 100) {
      return `${subject} remained within the selected comfort range (${refText}) throughout the monitoring period.`
    }
    // Same principle for a comfort band: when most of the period was OUTSIDE the
    // range, lead with that rather than the minority in-band fraction. A minor
    // excursion keeps the "remained within during X%" frame, which agrees with a
    // "Within Reference" chip.
    if (stats.pctInBand < 50) {
      return `${subject} fell outside the selected comfort range (${refText}) during ${pct(100 - stats.pctInBand)} of the monitoring period.`
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
