/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * monitoringStats — deterministic time-series statistics for the Indoor
 * Environmental Monitoring Report (the standalone Logger Studio deliverable).
 *
 * Pure and unit-tested. Every value returned here is a MEASURED FACT —
 * a count, a duration, a distribution. Nothing in this module interprets,
 * scores, diagnoses, or renders an opinion. The report layer states
 * "value vs. the selected screening reference" and stops there.
 *
 * ── Statistical conventions ────────────────────────────────────────────
 * These numbers appear in a client deliverable that may become a record, so
 * each convention is fixed, documented, and reproducible by a third party
 * working from the same CSV:
 *
 *   • Percentile — NEAREST-RANK. The p-th percentile is the value at
 *     ceil(p/100 × n) in the ascending-sorted sample. No interpolation:
 *     every percentile reported is a value that was actually measured.
 *   • Standard deviation — SAMPLE (n − 1 denominator), matching the
 *     spreadsheet default (Excel STDEV / STDEV.S) a reviewer would check
 *     the number against.
 *   • Time above / outside a reference — INTERVAL-WEIGHTED. Each reading is
 *     credited with the elapsed time to the NEXT reading; where that span
 *     exceeds GAP_FACTOR × the nominal logging interval it is treated as a
 *     data gap and the reading is credited with the nominal interval only.
 *     Unmeasured time is never counted.
 *   • Coverage — readings actually recorded ÷ readings expected across the
 *     monitoring span at the nominal interval.
 *   • Hour-of-day — bucketed by arithmetic on the timestamp plus an explicit
 *     UTC offset (no host-timezone dependency, so the same dataset yields
 *     the same profile on any machine).
 *
 * Timestamps are epoch milliseconds throughout, matching `sensorParser`'s
 * parsed `points` (`{ t, co2, temp, … }`).
 */

// A span longer than GAP_FACTOR × the nominal interval is a data gap, not a
// slow sample. Chosen (rather than 2×) so ordinary logger jitter — a reading
// landing a little late — is still credited as continuous monitoring, while a
// genuinely missed interval is not.
export const GAP_FACTOR = 1.5

const isNum = (v) => v != null && Number.isFinite(v)
const asc = (a, b) => a - b

/** Arithmetic mean, or null for an empty sample. */
export function mean(values) {
  const xs = (values || []).filter(isNum)
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Trailing mean of each point's value over `windowMs` ending at that point, or
 * `null` where a full window of data does not precede the point.
 *
 * This is the averaging step an acute, WINDOWED criterion (a 1-hour or 24-hour
 * category) must be evaluated on: a category with an averaging period may only
 * be assigned from the mean over that period, never a single short-interval
 * reading. A point whose trailing window is not fully covered by data returns
 * `null`, so a dataset shorter than the window can never satisfy the criterion.
 * Operates on `[{ t, v }]` ascending points; returns one entry per point.
 */
export function trailingMeans(points, windowMs) {
  const n = (points || []).length
  const out = new Array(n).fill(null)
  if (!isNum(windowMs) || windowMs <= 0 || !n) return out
  let lo = 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += points[i].v
    while (points[lo].t < points[i].t - windowMs) {
      sum -= points[lo].v
      lo++
    }
    if (points[i].t - points[0].t >= windowMs) out[i] = sum / (i - lo + 1)
  }
  return out
}

/**
 * Nearest-rank percentile (see conventions above).
 * @param {number[]} values
 * @param {number} p percentile in 0–100
 * @returns {number|null}
 */
export function percentile(values, p) {
  const xs = (values || []).filter(isNum).sort(asc)
  if (!xs.length) return null
  if (p <= 0) return xs[0]
  if (p >= 100) return xs[xs.length - 1]
  const rank = Math.ceil((p / 100) * xs.length)
  return xs[Math.min(xs.length, Math.max(1, rank)) - 1]
}

/**
 * Sample standard deviation (n − 1). Null for n < 2, where it is undefined —
 * reported as "—" rather than a misleading 0.
 */
export function stdDev(values) {
  const xs = (values || []).filter(isNum)
  if (xs.length < 2) return null
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const ss = xs.reduce((a, b) => a + (b - m) * (b - m), 0)
  return Math.sqrt(ss / (xs.length - 1))
}

/**
 * The nominal logging interval in seconds — the MEDIAN gap between
 * consecutive timestamps. Median (not mean) so one long gap can't inflate
 * the cadence the whole report is weighted against.
 * @returns {number|null} null when there are too few timestamps
 */
export function nominalIntervalSec(points) {
  const ts = (points || []).map((p) => p && p.t).filter(isNum).sort(asc)
  if (ts.length < 3) return null
  const deltas = []
  for (let i = 1; i < ts.length; i++) {
    const d = (ts[i] - ts[i - 1]) / 1000
    if (d > 0) deltas.push(d)
  }
  if (!deltas.length) return null
  deltas.sort(asc)
  const mid = Math.floor(deltas.length / 2)
  return deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2
}

/**
 * Readings for one parameter, ascending by time, dropping nulls.
 * @returns {{t:number|null, v:number}[]}
 */
export function readings(points, param) {
  return (points || [])
    .filter((p) => p && isNum(p[param]))
    .map((p) => ({ t: isNum(p.t) ? p.t : null, v: p[param] }))
    .sort((a, b) => (a.t == null || b.t == null ? 0 : a.t - b.t))
}

/**
 * Interval-weighted duration, in seconds, for which a predicate held.
 *
 * Each reading is credited with the elapsed time to the next reading, capped
 * at the nominal interval when that span looks like a data gap (see
 * GAP_FACTOR). The final reading is credited with one nominal interval so the
 * last sample of a monitoring period is not silently worth zero.
 *
 * Without timestamps the count of matching readings × the nominal interval is
 * used; without a nominal interval the duration is unknowable and this
 * returns null (the report then shows the percentage only).
 *
 * @param {{t:number|null,v:number}[]} rs ascending readings
 * @param {(v:number)=>boolean} predicate
 * @param {number|null} intervalSec nominal logging interval
 * @returns {number|null} seconds, or null when not determinable
 */
export function durationWhere(rs, predicate, intervalSec) {
  const list = rs || []
  if (!list.length || !isNum(intervalSec) || intervalSec <= 0) return null
  const cap = intervalSec * GAP_FACTOR
  let sec = 0
  for (let i = 0; i < list.length; i++) {
    if (!predicate(list[i].v)) continue
    const here = list[i].t
    const next = i + 1 < list.length ? list[i + 1].t : null
    if (here == null || next == null) {
      sec += intervalSec // no timestamps to measure against
      continue
    }
    const span = (next - here) / 1000
    sec += span > cap || span <= 0 ? intervalSec : span
  }
  return sec
}

/**
 * Dataset integrity for the monitoring period.
 *
 * `coveragePct` compares readings recorded against readings expected across
 * the span at the nominal interval, capped at 100 (a logger that briefly
 * over-samples must not report 103% coverage). Gaps are spans longer than
 * GAP_FACTOR × nominal.
 *
 * @returns {{startTs, endTs, durationSec, intervalSec, n, expected,
 *   coveragePct, gapCount, longestGapSec}}
 */
export function coverage(points, param, opts = {}) {
  const rs = readings(points, param)
  const intervalSec = isNum(opts.intervalSec) ? opts.intervalSec : nominalIntervalSec(points)
  const ts = rs.map((r) => r.t).filter(isNum)
  const startTs = ts.length ? ts[0] : null
  const endTs = ts.length ? ts[ts.length - 1] : null
  const durationSec = startTs != null && endTs != null ? (endTs - startTs) / 1000 : null

  let expected = null
  let coveragePct = null
  if (isNum(durationSec) && isNum(intervalSec) && intervalSec > 0) {
    expected = Math.floor(durationSec / intervalSec) + 1
    coveragePct = expected > 0 ? Math.min(100, (rs.length / expected) * 100) : null
  }

  let gapCount = 0
  let longestGapSec = null
  if (isNum(intervalSec) && intervalSec > 0 && ts.length > 1) {
    const cap = intervalSec * GAP_FACTOR
    for (let i = 1; i < ts.length; i++) {
      const span = (ts[i] - ts[i - 1]) / 1000
      if (span > cap) {
        gapCount += 1
        if (longestGapSec == null || span > longestGapSec) longestGapSec = span
      }
    }
  }

  return { startTs, endTs, durationSec, intervalSec, n: rs.length, expected, coveragePct, gapCount, longestGapSec }
}

/**
 * Average value by hour of day (0–23).
 *
 * Bucketing is pure arithmetic on the timestamp plus an explicit UTC offset,
 * so it never depends on the host machine's timezone — the same dataset
 * produces the same profile in the browser, in CI, and on a reviewer's laptop.
 *
 * @param {object} opts
 * @param {number} [opts.utcOffsetMin=0] site-local offset from UTC, in minutes
 * @returns {{hour:number, mean:number|null, n:number}[]} always 24 entries
 */
export function hourOfDayProfile(points, param, opts = {}) {
  const offsetMin = isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0
  const buckets = Array.from({ length: 24 }, () => [])
  readings(points, param).forEach((r) => {
    if (r.t == null) return
    const shifted = r.t + offsetMin * 60000
    const hour = ((Math.floor(shifted / 3600000) % 24) + 24) % 24
    buckets[hour].push(r.v)
  })
  return buckets.map((vals, hour) => ({ hour, mean: mean(vals), n: vals.length }))
}

/**
 * Occupied vs. unoccupied means for one parameter.
 * @param {{start:number,end:number}[]} windows occupancy windows in ms
 */
export function occupancySplit(points, param, windows) {
  const wins = Array.isArray(windows) ? windows : []
  const rs = readings(points, param)
  if (!wins.length || !rs.some((r) => r.t != null)) {
    return { meanOccupied: null, meanUnoccupied: null, delta: null }
  }
  const inOcc = (t) => t != null && wins.some((w) => t >= w.start && t <= w.end)
  const meanOccupied = mean(rs.filter((r) => inOcc(r.t)).map((r) => r.v))
  const meanUnoccupied = mean(rs.filter((r) => !inOcc(r.t)).map((r) => r.v))
  const delta = meanOccupied != null && meanUnoccupied != null ? meanOccupied - meanUnoccupied : null
  return { meanOccupied, meanUnoccupied, delta }
}

/**
 * The complete statistics block for one parameter — everything the report's
 * summary strip, statistics appendix, and insights need, in one pass.
 *
 * Two reference shapes are supported, matching how screening values are
 * actually expressed:
 *   • `{ limit: n }`      — an upper screening value (CO₂, PM2.5, CO, TVOC).
 *                           Reports pctAbove / timeAboveSec.
 *   • `{ band: [lo,hi] }` — a comfort range (temperature, RH).
 *                           Reports pctInBand / timeOutsideSec.
 * Omit the reference entirely and the comparison fields stay null; the
 * descriptive statistics are still returned.
 *
 * @param {object[]} points parsed sensor points
 * @param {string} param e.g. 'co2'
 * @param {object} [opts]
 * @param {{limit?:number, band?:number[]}} [opts.reference]
 * @param {{start:number,end:number}[]} [opts.occupancyWindows]
 * @param {number} [opts.intervalSec] override the detected nominal interval
 * @param {number} [opts.utcOffsetMin] for the hour-of-day profile
 * @returns {object|null} null when the parameter has no usable readings
 */
export function parameterStats(points, param, opts = {}) {
  const rs = readings(points, param)
  if (!rs.length) return null

  const vals = rs.map((r) => r.v)
  const cov = coverage(points, param, { intervalSec: opts.intervalSec })
  const intervalSec = cov.intervalSec

  // Peak/min carry their timestamps — the report cites when the maximum
  // occurred, which is one of the most-read facts in the highlights.
  let maxR = rs[0]
  let minR = rs[0]
  for (const r of rs) {
    if (r.v > maxR.v) maxR = r
    if (r.v < minR.v) minR = r
  }

  const ref = opts.reference || {}
  const hasLimit = isNum(ref.limit)
  const hasBand = Array.isArray(ref.band) && isNum(ref.band[0]) && isNum(ref.band[1])

  let pctAbove = null
  let timeAboveSec = null
  let pctInBand = null
  let timeOutsideSec = null

  if (hasLimit) {
    const over = vals.filter((v) => v > ref.limit).length
    pctAbove = (over / vals.length) * 100
    timeAboveSec = durationWhere(rs, (v) => v > ref.limit, intervalSec)
  }
  if (hasBand) {
    const [lo, hi] = ref.band
    const within = vals.filter((v) => v >= lo && v <= hi).length
    pctInBand = (within / vals.length) * 100
    timeOutsideSec = durationWhere(rs, (v) => v < lo || v > hi, intervalSec)
  }

  return {
    param,
    n: vals.length,
    mean: mean(vals),
    median: percentile(vals, 50),
    min: minR.v,
    minAt: minR.t,
    max: maxR.v,
    maxAt: maxR.t,
    p95: percentile(vals, 95),
    stdDev: stdDev(vals),
    pctAbove,
    timeAboveSec,
    pctInBand,
    timeOutsideSec,
    occupancy: occupancySplit(points, param, opts.occupancyWindows),
    coverage: cov,
  }
}
