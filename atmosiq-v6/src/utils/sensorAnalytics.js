/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * sensorAnalytics — derived time-series statistics for the Logger Studio
 * Analysis chart cards. Pure + unit-testable. Factual screening figures
 * only (mean, peak, % over a reference, occupied-vs-unoccupied delta) —
 * no interpretation or determination is made here.
 */

// Which single parameter a chart's stat row summarizes. Combined or
// composite charts (temp+RH, multi-parameter, differential, zone overlay)
// return null — their stat row is skipped.
const PRIMARY_PARAM = { co2: 'co2', pm: 'pm25', co: 'co', tvoc: 'tvoc', hcho: 'hcho' }
export function chartPrimaryParam(defId) {
  return PRIMARY_PARAM[defId] || null
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/**
 * Compute the stat row for one parameter series.
 *   values      — parameter values (may contain nulls), index-aligned to…
 *   timestamps  — point timestamps in ms (or undefined for row-order data)
 *   opts.occupancyWindows — [{ start, end }] ms ranges marking occupancy
 *   opts.limit  — screening reference value (for % over); null to skip
 * Returns null when there's no usable data. `pctOver`, `deltaOccNoc`, and
 * `peakOccupied` are null when their inputs are unavailable (no limit /
 * no occupancy windows / no timestamps).
 */
export function chartStats(values, timestamps, opts = {}) {
  const pairs = (values || [])
    .map((v, i) => ({ v, t: timestamps ? timestamps[i] : undefined }))
    .filter((p) => p.v != null && Number.isFinite(p.v))
  if (!pairs.length) return null

  const vals = pairs.map((p) => p.v)
  const n = vals.length
  const peakPair = pairs.reduce((m, p) => (p.v > m.v ? p : m), pairs[0])

  const windows = Array.isArray(opts.occupancyWindows) ? opts.occupancyWindows : []
  const hasOcc = windows.length > 0 && pairs.some((p) => p.t != null)
  const inOcc = (t) => t != null && windows.some((w) => t >= w.start && t <= w.end)

  let meanOcc = null
  let meanNoc = null
  let deltaOccNoc = null
  let peakOccupied = null
  if (hasOcc) {
    meanOcc = mean(pairs.filter((p) => inOcc(p.t)).map((p) => p.v))
    meanNoc = mean(pairs.filter((p) => !inOcc(p.t)).map((p) => p.v))
    deltaOccNoc = meanOcc != null && meanNoc != null ? meanOcc - meanNoc : null
    peakOccupied = inOcc(peakPair.t)
  }

  let pctOver = null
  if (opts.limit != null) {
    pctOver = (vals.filter((v) => v > opts.limit).length / n) * 100
  }

  return {
    mean: mean(vals),
    peak: peakPair.v,
    n,
    meanOcc,
    meanNoc,
    deltaOccNoc,
    peakOccupied,
    pctOver,
  }
}
