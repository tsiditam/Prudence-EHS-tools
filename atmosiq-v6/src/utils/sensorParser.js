/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * sensorParser — turn a CSV logger export into report-ready IAQ series.
 *
 * Screening/documentation only: this parser shapes and flags data for
 * visualization; it makes no compliance or causation determination.
 *
 * Reuses splitCsvLine from labResultsParser so CSV quoting behaves
 * identically to the lab-results import. Pure functions (no React, no
 * DOM) so the logic is unit-testable.
 */

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { splitCsvLine } from './labResultsParser'

dayjs.extend(customParseFormat)

// Canonical IAQ parameters we detect + chart. `key` is the series key,
// `label`/`unit` drive axis + caption text. Order matters for detection:
// more specific patterns (co2, pm25) are tested before generic ones (co, pm).
export const SENSOR_PARAMS = [
  { key: 'co2',   label: 'CO₂',         unit: 'ppm',   match: /(^|[^a-z])(co2|co₂|carbon\s*diox)/i,            min: 0,    max: 50000 },
  { key: 'pm25',  label: 'PM2.5',       unit: 'µg/m³', match: /pm\s*2\.?5|pm25/i,                              min: 0,    max: 2000 },
  { key: 'pm10',  label: 'PM10',        unit: 'µg/m³', match: /pm\s*10|pm10/i,                                 min: 0,    max: 5000 },
  { key: 'tvoc',  label: 'TVOC',        unit: 'ppb',   match: /tvoc|\bvoc/i,                                   min: 0,    max: 60000 },
  { key: 'co',    label: 'CO',          unit: 'ppm',   match: /(^|[^a-z2])co($|[^a-z2])|carbon\s*monox/i,      min: 0,    max: 1000 },
  { key: 'temp',  label: 'Temperature', unit: '°F',    match: /temp|temperature|°\s*[cf]\b/i,                  min: -40,  max: 160 },
  { key: 'rh',    label: 'Relative Humidity', unit: '%', match: /\brh\b|humid|%\s*rh/i,                        min: 0,    max: 100 },
  { key: 'press', label: 'Pressure',    unit: 'hPa',   match: /press|hpa|mbar/i,                               min: 300,  max: 1200 },
]

const TS_MATCH = /time|date|timestamp|datetime|^t$|epoch/i
const ZONE_MATCH = /zone|location|room|area/i

// Common explicit timestamp formats to try before falling back to the
// loose Date parser (which mis-reads ambiguous strings).
const TS_FORMATS = [
  'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss', 'YYYY/MM/DD HH:mm:ss',
  'MM/DD/YYYY HH:mm:ss', 'MM/DD/YYYY HH:mm', 'M/D/YYYY H:mm',
  'MM/DD/YY HH:mm', 'M/D/YY H:mm', 'YYYY-MM-DD HH:mm', 'DD/MM/YYYY HH:mm:ss',
]

export function detectUnit(header, param) {
  const h = header.toLowerCase()
  if (param === 'temp') {
    if (/°\s*c|\bc\b|celsius/.test(h) && !/°\s*f|fahren/.test(h)) return '°C'
    return '°F'
  }
  if (/µg\/m³|ug\/m3|ug\/m\^?3/.test(h)) return 'µg/m³'
  if (/\bppm\b/.test(h)) return 'ppm'
  if (/\bppb\b/.test(h)) return 'ppb'
  if (/%/.test(h)) return '%'
  return null
}

// Classify a header → { role:'timestamp'|'zone'|'param'|'unknown', param?, unit? }
export function classifyHeader(header) {
  if (typeof header !== 'string' || !header.trim()) return { role: 'unknown' }
  const h = header.trim()
  if (TS_MATCH.test(h)) return { role: 'timestamp' }
  for (const p of SENSOR_PARAMS) {
    if (p.match.test(h)) return { role: 'param', param: p.key, unit: detectUnit(h, p.key) || p.unit }
  }
  if (ZONE_MATCH.test(h)) return { role: 'zone' }
  return { role: 'unknown' }
}

function parseTimestamp(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  // Epoch (seconds or ms)
  if (/^\d{10}$/.test(s)) return dayjs.unix(Number(s)).valueOf()
  if (/^\d{13}$/.test(s)) return Number(s)
  for (const f of TS_FORMATS) {
    const d = dayjs(s, f, true)
    if (d.isValid()) return d.valueOf()
  }
  // Excel date serial (days since 1899-12-30, fraction = time of day).
  // XLSX stores dates as bare numbers; serials for ~1954–2120 land in
  // 20000–80000, distinct from the 10/13-digit epoch forms above.
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const n = Number(s)
    if (n >= 20000 && n <= 80000) return Math.round((n - 25569) * 86400000)
  }
  const loose = dayjs(s)
  return loose.isValid() ? loose.valueOf() : null
}

function toNumber(v) {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[^0-9.\-+eE]/g, ''))
  return Number.isFinite(n) ? n : null
}

const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Evenly decimate to <= maxPoints, always keeping first + last.
export function downsample(points, maxPoints = 800) {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const out = []
  for (let i = 0; i < points.length; i += step) out.push(points[i])
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1])
  return out
}

// Scale each selected parameter to 0–100% of its own observed range, for
// a shape-comparison chart where parameters of different magnitudes (CO₂
// in thousands vs RH in tens) can be read together. Actual values are
// preserved on each point (key `<param>`) so the tooltip shows real units;
// only the `n_<param>` keys are normalized. Returns { data, ranges }.
export function normalizeForCompare(points, params) {
  const list = Array.isArray(params) ? params : []
  const ranges = {}
  list.forEach((p) => {
    const vals = points.map((pt) => pt[p]).filter((v) => v != null)
    ranges[p] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 1 }
  })
  const data = points.map((pt) => {
    const o = { t: pt.t }
    list.forEach((p) => {
      o[p] = pt[p] ?? null
      const r = ranges[p]
      const span = r.max - r.min
      o['n_' + p] = pt[p] == null ? null : (span ? ((pt[p] - r.min) / span) * 100 : 50)
    })
    return o
  })
  return { data, ranges }
}

/**
 * Parse sensor CSV text. `mapping` optionally overrides auto-detection:
 *   { [columnIndex]: { role, param, unit } }
 * Returns null when there's nothing usable.
 */
export function parseSensorCsv(csvText, opts = {}) {
  if (typeof csvText !== 'string' || !csvText.trim()) return null
  const lines = csvText.split(/\r\n?|\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return null
  return parseSensorRows(lines.map(splitCsvLine), opts)
}

/**
 * Core parser over a 2D array of rows (rows[0] = headers). Shared by the
 * CSV path and the XLSX path (sensorXlsx.js) so both produce identical
 * series + summary + quality output.
 */
export function parseSensorRows(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length < 2) return null
  const maxPoints = opts.maxPoints || 800

  const headers = rows[0]
  // Per-column classification (mapping override wins).
  const cols = headers.map((h, i) => (opts.mapping && opts.mapping[i]) || classifyHeader(h))
  const tsIdx = cols.findIndex((c) => c.role === 'timestamp')
  const paramCols = cols
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.role === 'param')

  const units = {}
  paramCols.forEach((c) => { if (c.unit) units[c.param] = c.unit })

  // Build points; first param column wins if a param repeats.
  const seen = new Set()
  const activeParams = paramCols.filter((c) => (seen.has(c.param) ? false : seen.add(c.param)))

  const rawPoints = []
  let emptyRows = 0
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] || []
    if (!cells.length || cells.every((x) => !String(x ?? '').trim())) { emptyRows++; continue }
    const t = tsIdx >= 0 ? parseTimestamp(cells[tsIdx]) : (r - 1)
    const pt = { t, _i: r - 1 }
    let any = false
    activeParams.forEach((c) => {
      const n = toNumber(cells[c.i])
      pt[c.param] = n
      if (n != null) any = true
    })
    if (any || t != null) rawPoints.push(pt)
  }

  if (!rawPoints.length || !activeParams.length) return null

  const hasTimestamps = tsIdx >= 0 && rawPoints.some((p) => typeof p.t === 'number')
  // Sort by timestamp when we have real ones.
  if (hasTimestamps) rawPoints.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))

  const summary = buildSummary(rawPoints, activeParams, hasTimestamps, emptyRows)
  const quality = assessQuality(rawPoints, activeParams, hasTimestamps, summary)
  const points = downsample(rawPoints, maxPoints).map(({ _i, ...rest }) => rest)

  return {
    fileName: opts.fileName || null,
    params: activeParams.map((c) => c.param),
    units,
    columns: headers.map((h, i) => ({ raw: h, ...cols[i] })),
    hasTimestamps,
    points,
    rawCount: rawPoints.length,
    summary,
    quality,
  }
}

function buildSummary(points, activeParams, hasTimestamps, emptyRows) {
  const ts = points.map((p) => p.t).filter((t) => typeof t === 'number')
  let intervalSec = null
  if (hasTimestamps && ts.length > 2) {
    const deltas = []
    for (let i = 1; i < ts.length; i++) deltas.push((ts[i] - ts[i - 1]) / 1000)
    intervalSec = median(deltas.filter((d) => d > 0))
  }
  const missing = {}
  activeParams.forEach((c) => {
    missing[c.param] = points.filter((p) => p[c.param] == null).length
  })
  return {
    count: points.length,
    start: hasTimestamps && ts.length ? ts[0] : null,
    end: hasTimestamps && ts.length ? ts[ts.length - 1] : null,
    intervalSec,
    emptyRows,
    missing,
  }
}

function assessQuality(points, activeParams, hasTimestamps, summary) {
  const flags = []
  if (!hasTimestamps) flags.push({ level: 'uncertain', msg: 'No timestamp column detected — map it or the X-axis uses row order.' })

  if (hasTimestamps) {
    const ts = points.map((p) => p.t).filter((t) => typeof t === 'number')
    const dupes = ts.length - new Set(ts).size
    if (dupes > 0) flags.push({ level: 'minor', msg: `${dupes} duplicate timestamp${dupes === 1 ? '' : 's'}.` })
    // Irregular intervals: many deltas far from the median.
    if (summary.intervalSec) {
      let irregular = 0
      for (let i = 1; i < ts.length; i++) {
        const d = (ts[i] - ts[i - 1]) / 1000
        if (d > summary.intervalSec * 3 || d <= 0) irregular++
      }
      if (irregular > Math.max(2, ts.length * 0.05)) flags.push({ level: 'minor', msg: 'Irregular sampling intervals / gaps detected.' })
    }
  }

  activeParams.forEach((c) => {
    const spec = SENSOR_PARAMS.find((p) => p.key === c.param)
    const vals = points.map((p) => p[c.param]).filter((v) => v != null)
    if (!vals.length) return
    const miss = summary.missing[c.param] || 0
    if (miss > points.length * 0.2) flags.push({ level: 'minor', msg: `${spec.label}: ${Math.round((miss / points.length) * 100)}% of readings missing.` })
    if (spec && vals.some((v) => v < spec.min || v > spec.max)) {
      flags.push({ level: 'review', msg: `${spec.label}: values outside the physically plausible range — check unit mapping.` })
    }
    // Flatline: zero variance across a meaningful run.
    if (vals.length > 10 && new Set(vals).size === 1) {
      flags.push({ level: 'review', msg: `${spec.label}: readings are flatlined — possible sensor fault.` })
    }
  })

  const rank = { ok: 0, minor: 1, uncertain: 2, review: 3 }
  const worst = flags.reduce((acc, f) => (rank[f.level] > rank[acc] ? f.level : acc), 'ok')
  const statusText = {
    ok: 'Data appears suitable for visualization.',
    minor: 'Data has minor gaps — review before final reporting.',
    uncertain: 'Timestamp or unit mapping is uncertain — review the mapping.',
    review: 'Data requires review before using in a final report.',
  }
  return { level: worst, status: statusText[worst], flags }
}
