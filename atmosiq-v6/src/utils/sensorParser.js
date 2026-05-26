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
  { key: 'hcho',  label: 'Formaldehyde', unit: 'ppb',  match: /hcho|formaldehyde|ch2o|methanal/i,              min: 0,    max: 6000 },
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
    // Explicit Fahrenheit / Celsius markers, including bracketed forms
    // ("Temp [degC]", "Temperature (°F)") and the bare "degC" / "degF"
    // tokens loggers commonly emit. Returns null when no marker is present
    // so the caller can infer the scale from the values rather than
    // defaulting to °F (which mis-reads Celsius logs).
    if (/°\s*f\b|deg(?:rees?)?\.?\s*f\b|fahrenheit|\[f\]|\(f\)|\bf\b/.test(h)) return '°F'
    if (/°\s*c\b|deg(?:rees?)?\.?\s*c\b|celsius|\[c\]|\(c\)|\bc\b/.test(h)) return '°C'
    return null
  }
  if (/µg\/m³|ug\/m3|ug\/m\^?3/.test(h)) return 'µg/m³'
  if (/mg\/m³|mg\/m3|mg\/m\^?3/.test(h)) return 'mg/m³'
  if (/\bppm\b/.test(h)) return 'ppm'
  if (/\bppb\b/.test(h)) return 'ppb'
  if (/%/.test(h)) return '%'
  return null
}

// Infer the temperature scale from the value distribution when the header
// carried no explicit unit. Occupied / most-outdoor IAQ temperatures read
// ~50–100 °F versus ~10–38 °C, so a sub-45 median with no reading above ~50
// is implausibly cold for °F but normal for °C → Celsius; otherwise °F.
export function inferTempUnit(values) {
  const vals = (values || []).filter((v) => v != null)
  if (!vals.length) return '°F'
  const med = median(vals)
  const max = Math.max(...vals)
  return (med != null && med <= 45 && max <= 50) ? '°C' : '°F'
}

// Hint phrases that indicate whether a logger export is indoor or outdoor.
// Read from the filename and column headers (e.g. "IAQ_Outdoor_20.xlsx",
// "Outdoor CO2 [ppm]"). Returns null when the signal is absent or mixed.
const OUTDOOR_HINT = /\boutdoor\b|\bambient\b|\bexterior\b|\boutside\b|\boa\b/i
const INDOOR_HINT = /\bindoor\b|\binterior\b|\binside\b|\breturn\b/i
export function detectDatasetRole(fileName, headers) {
  // Normalize separators (underscores, dots, brackets) to spaces so the
  // \b word-boundary hints match inside names like "IAQ_Outdoor_20.xlsx".
  const hay = [fileName || '', ...(Array.isArray(headers) ? headers : [])]
    .join(' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
  const outdoor = OUTDOOR_HINT.test(hay)
  const indoor = INDOOR_HINT.test(hay)
  if (outdoor && !indoor) return 'outdoor'
  if (indoor && !outdoor) return 'indoor'
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

// PID reference compounds for the TVOC ppb/ppm → µg/m³ conversion. TVOC is a
// mixture with no single molecular weight, so mass concentration is expressed
// relative to a reference compound; PID instruments calibrate to isobutylene
// by default. The conversion is an explicit, surfaced assumption — never a
// silent one (the chosen compound is shown wherever a converted value lands).
export const TVOC_REFERENCES = {
  isobutylene: { label: 'Isobutylene', mw: 56.11 },
  toluene:     { label: 'Toluene',     mw: 92.14 },
}
// Molar volume of an ideal gas at 25 °C and 1 atm (L/mol).
const MOLAR_VOLUME_25C = 24.45

// Convert a volumetric mixing ratio (ppb) to mass concentration (µg/m³) for a
// reference compound of molecular weight `mw` (g/mol). µg/m³ = ppb · MW ÷ Vm.
export function ppbToUgm3(ppb, mw) {
  if (ppb == null || !Number.isFinite(ppb) || !Number.isFinite(mw)) return null
  return (ppb * mw) / MOLAR_VOLUME_25C
}

// Inverse of ppbToUgm3 — mass concentration (µg/m³) back to ppb for a
// reference compound. Used for ppb-equivalent display alongside the µg/m³
// reading field, which stays the canonical (Mølhave-aligned) scored unit.
export function ugm3ToPpb(ugm3, mw) {
  if (ugm3 == null || !Number.isFinite(ugm3) || !Number.isFinite(mw) || mw === 0) return null
  return (ugm3 * MOLAR_VOLUME_25C) / mw
}

// Formaldehyde (HCHO) molecular weight (g/mol). A single compound, so the
// ppb ↔ µg/m³ conversion is exact — no reference-compound assumption like
// TVOC. Used for the analyzer's cross-unit equivalent display.
export const HCHO_MW = 30.03

// Map a logger parameter onto the per-zone reading field id (SENSOR_FIELDS)
// it can populate. Indoor only — the outdoor fields (co2o, tfo, …) and HCHO
// have no logger source and stay manual. TVOC is handled separately because
// its reading field is µg/m³ while loggers report ppb/ppm/µg/m³.
const READING_FIELD_MAP = {
  co2:  { field: 'co2', dp: 0 },
  pm25: { field: 'pm',  dp: 1 },
  rh:   { field: 'rh',  dp: 0 },
  co:   { field: 'co',  dp: 1 },
  temp: { field: 'tf',  dp: 1 },
}

/**
 * Derive per-zone reading-field values from a parsed sensor-log object
 * (the shape returned by parseSensorRows, persisted as `sensorData`).
 * Pure: returns { fields, details, skipped } and mutates nothing.
 *   fields  — { [fieldId]: stringValue } ready to write via setZF
 *   details — [{ field, param, value, n, note }] for a UI preview
 *             (`note` describes any unit conversion applied)
 *   skipped — [{ param, reason }] for parameters with no safe target
 * `stat` selects 'mean' (default) or 'median'. `tvocRef` selects the TVOC
 * reference compound key (default 'isobutylene').
 */
export function sensorAveragesToFields(sensorData, opts = {}) {
  const stat = opts.stat === 'median' ? 'median' : 'mean'
  const empty = { fields: {}, details: [], skipped: [] }
  // Accept either a raw parsed object (v1) or the multi-dataset envelope
  // (v2): averages always come from the primary indoor dataset.
  const ds = primaryDataset(sensorData) || {}
  const stats = ds.summary && ds.summary.stats
  if (!stats) return empty
  const units = ds.units || {}
  const params = Array.isArray(ds.params) ? ds.params : []
  const ref = TVOC_REFERENCES[opts.tvocRef] || TVOC_REFERENCES.isobutylene
  const fields = {}
  const details = []
  const skipped = []
  params.forEach((p) => {
    const s = stats[p]
    if (!s) return
    let val = s[stat]
    if (val == null) return

    if (p === 'tvoc') {
      // `tv` is µg/m³. Fill directly when the log is already mass-based;
      // convert from ppb/ppm via the chosen PID reference compound. Skip
      // anything else (e.g. a unitless air-quality index) rather than guess.
      const u = String(units.tvoc || '').toLowerCase()
      let note = ''
      if (/µg|ug/.test(u)) {
        // already µg/m³ — no conversion
      } else if (u.includes('ppm') || u.includes('ppb')) {
        const isPpm = u.includes('ppm')
        val = ppbToUgm3(isPpm ? val * 1000 : val, ref.mw)
        note = `${isPpm ? 'ppm' : 'ppb'}→µg/m³ @ ${ref.label}`
      } else {
        skipped.push({ param: 'tvoc', reason: `unit "${units.tvoc || 'unknown'}" not convertible to µg/m³` })
        return
      }
      const rounded = Number(val.toFixed(0))
      fields.tv = String(rounded)
      details.push({ field: 'tv', param: 'tvoc', value: rounded, n: s.n, note })
      return
    }

    const map = READING_FIELD_MAP[p]
    if (!map) return
    let note = ''
    if (p === 'temp' && units.temp === '°C') { val = (val * 9) / 5 + 32; note = '°C→°F' }
    const rounded = Number(val.toFixed(map.dp))
    fields[map.field] = String(rounded)
    details.push({ field: map.field, param: p, value: rounded, n: s.n, note })
  })
  return { fields, details, skipped }
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

  // Temperature unit: prefer an explicit marker (mapping override or header);
  // otherwise infer from the values rather than defaulting to °F, so a bare
  // "Temp" column of Celsius readings isn't mis-scaled.
  let tempInferredCelsius = false
  const tCol = activeParams.find((c) => c.param === 'temp')
  if (tCol) {
    const mapped = opts.mapping && opts.mapping[tCol.i] && opts.mapping[tCol.i].unit
    const explicit = mapped || detectUnit(headers[tCol.i] || '', 'temp')
    if (explicit) {
      units.temp = explicit
    } else {
      const inferred = inferTempUnit(rawPoints.map((p) => p.temp))
      units.temp = inferred
      tempInferredCelsius = inferred === '°C'
    }
  }

  const summary = buildSummary(rawPoints, activeParams, hasTimestamps, emptyRows)
  const quality = assessQuality(rawPoints, activeParams, hasTimestamps, summary, units, tempInferredCelsius)
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
  const stats = {}
  activeParams.forEach((c) => {
    const vals = points.map((p) => p[c.param]).filter((v) => v != null)
    missing[c.param] = points.length - vals.length
    stats[c.param] = vals.length
      ? {
          mean: vals.reduce((a, b) => a + b, 0) / vals.length,
          median: median(vals),
          min: Math.min(...vals),
          max: Math.max(...vals),
          n: vals.length,
        }
      : null
  })
  return {
    count: points.length,
    start: hasTimestamps && ts.length ? ts[0] : null,
    end: hasTimestamps && ts.length ? ts[ts.length - 1] : null,
    intervalSec,
    emptyRows,
    missing,
    stats,
  }
}

function assessQuality(points, activeParams, hasTimestamps, summary, units = {}, tempInferredCelsius = false) {
  const flags = []
  if (!hasTimestamps) flags.push({ level: 'uncertain', msg: 'No timestamp column detected — map it or the X-axis uses row order.' })

  // Temperature unit sanity. A °F-labeled series that averages near or below
  // freezing-comfort is almost certainly Celsius mislabeled as Fahrenheit;
  // surface it for review rather than silently charting 20 °F for a room.
  const tempVals = points.map((p) => p.temp).filter((v) => v != null)
  if (tempVals.length) {
    const tmed = median(tempVals)
    if (units.temp === '°F' && tmed != null && tmed <= 45) {
      flags.push({ level: 'review', msg: `Temperature averages ${Math.round(tmed)} °F — implausibly cold for an occupied space. Verify the unit; these values read like °C.` })
    }
  }
  if (tempInferredCelsius) {
    flags.push({ level: 'minor', msg: 'Temperature unit not specified in the header — inferred °C from the values (they read like Celsius). Remap the column if this is wrong.' })
  }

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

// ── Multi-dataset envelope (Logger Studio) ────────────────────────────────
// Logger Studio compares multiple logger files (indoor / outdoor baseline /
// per-zone). They live in a single `sensorData` envelope so persistence and
// the report pipeline keep one key. `graphs` (per-chart export state) and
// `thresholds` (reference-line visibility) stay envelope-level; the parsed
// series live in `datasets[]`.

export const SENSOR_DATA_VERSION = 2

/**
 * Normalize any stored sensorData into the v2 multi-dataset envelope.
 * Idempotent: a v2 envelope passes through (defaults filled); a legacy v1
 * parsed object is wrapped as the single primary indoor dataset. Returns
 * null for nullish input.
 */
export function normalizeSensorData(sd) {
  if (!sd || typeof sd !== 'object') return sd ?? null
  if (sd.version === SENSOR_DATA_VERSION && Array.isArray(sd.datasets)) {
    return {
      ...sd,
      datasets: sd.datasets,
      occupancyWindows: Array.isArray(sd.occupancyWindows) ? sd.occupancyWindows : [],
      thresholds: sd.thresholds || { co2: true },
      graphs: sd.graphs || {},
    }
  }
  // Legacy v1: the object itself is the primary (indoor) dataset, with
  // graphs/thresholds/mapping riding alongside the parsed fields.
  const { graphs, thresholds, version, datasets, occupancyWindows, ...parsed } = sd
  return {
    version: SENSOR_DATA_VERSION,
    datasets: [{ id: 'primary', role: 'indoor', label: 'Indoor', ...parsed }],
    occupancyWindows: [],
    thresholds: thresholds || { co2: true },
    graphs: graphs || {},
  }
}

/**
 * The primary (indoor) dataset. Accepts a v2 envelope or a legacy v1 object
 * (which is itself the primary dataset). Returns null when absent.
 */
export function primaryDataset(sd) {
  if (!sd || typeof sd !== 'object') return null
  if (Array.isArray(sd.datasets)) return sd.datasets.find((d) => d.role === 'indoor') || sd.datasets[0] || null
  return sd
}

// Nearest value (within `tol` ms) to time `t` in a t-sorted [{t, v}] array.
function nearestValue(arr, t, tol) {
  if (!arr.length) return null
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].t < t) lo = mid + 1
    else hi = mid
  }
  let best = arr[lo]
  if (lo > 0 && Math.abs(arr[lo - 1].t - t) < Math.abs(best.t - t)) best = arr[lo - 1]
  return Math.abs(best.t - t) <= tol ? best.v : null
}

/**
 * Time-align one parameter across several datasets for overlay charts.
 * Builds a union timeline of all datasets' timestamps and, for each base
 * time, nearest-joins each dataset's value within a tolerance (defaults to
 * the smallest dataset interval, floor 60 s). Returns
 *   { points: [{ t, [datasetId]: value|null }], ids: [datasetId] }
 * Only timestamped datasets participate (row-order series can't be aligned).
 */
export function alignDatasets(datasets, param, opts = {}) {
  const list = (datasets || []).filter((d) => d && d.hasTimestamps && Array.isArray(d.points))
  const ids = list.map((d) => d.id)
  if (!list.length) return { points: [], ids }

  const series = {}
  let allTs = []
  list.forEach((d) => {
    const s = d.points
      .map((p) => ({ t: p.t, v: p[param] }))
      .filter((p) => typeof p.t === 'number' && p.v != null)
      .sort((a, b) => a.t - b.t)
    series[d.id] = s
    allTs = allTs.concat(s.map((p) => p.t))
  })
  const baseTs = Array.from(new Set(allTs)).sort((a, b) => a - b)
  if (!baseTs.length) return { points: [], ids }

  const intervals = list.map((d) => d.summary && d.summary.intervalSec).filter((s) => s > 0)
  const tol = opts.toleranceMs != null
    ? opts.toleranceMs
    : Math.max((intervals.length ? Math.min(...intervals) : 300) * 1000, 60000)

  let points = baseTs.map((t) => {
    const row = { t }
    ids.forEach((id) => { row[id] = nearestValue(series[id], t, tol) })
    return row
  })
  points = downsample(points, opts.maxPoints || 800)
  return { points, ids }
}
