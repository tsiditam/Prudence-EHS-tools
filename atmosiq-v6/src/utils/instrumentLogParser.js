/**
 * AtmosFlow — Instrument Log CSV Parser
 *
 * Pure CSV → aggregated readings mapper for time-series instrument
 * log files. Closes the manual-re-key friction from the field
 * audit: assessor connects their Q-Trak / Aeroqual / Graywolf to
 * a laptop or pulls the SD card, exports a CSV log of a 5-15 min
 * sample period in a zone, uploads it here → the parser detects
 * the parameter columns + aggregates (mean / median / p95 / max /
 * min) → the assessor applies the aggregated values straight into
 * the zone's sensor fields. No manual transcription.
 *
 * Same input-detection philosophy as src/utils/labResultsParser.js
 * (Move 4a): one auto-detector handles every vendor's CSV layout
 * via fuzzy header matching. No per-vendor branching unless a
 * vendor's format is truly idiosyncratic.
 *
 * Supported parameter detection (canonical IDs match SENSOR_FIELDS
 * in src/constants/questions.js):
 *
 *   co2  — CO2 / Carbon Dioxide / CO2 ppm
 *   tf   — Temperature / Temp / Temp F
 *   rh   — RH / Relative Humidity / Humidity
 *   co   — CO / Carbon Monoxide
 *   pm   — PM2.5 / Particulate / PM (no PM10 → drops unmapped)
 *   tv   — TVOC / VOC / Volatile Organics
 *   hc   — HCHO / Formaldehyde
 *
 * Unit normalization: temperature accepts °F directly, converts
 * Celsius to Fahrenheit when the header indicates °C. PPB → PPM
 * conversion for HCHO when the column header carries ppb units.
 * Everything else is passed through verbatim (the source-of-truth
 * is the instrument's reported units; we don't reinterpret).
 */

const CANONICAL_PARAMS = ['co2', 'tf', 'rh', 'co', 'pm', 'tv', 'hc']

/**
 * Map a single CSV header to one of the canonical parameter IDs
 * (or null if the column doesn't carry a parameter we care about).
 *
 * Detection-order matters because some tokens are prefixes of
 * others ("CO" prefix of "CO2", "PM" prefix of "PM2.5" vs "PM10").
 * The explicit-drop check (PM10) comes first; CO2 is checked
 * before CO; °C is checked before °F-less Temperature fallback.
 */
export function mapInstrumentHeader(rawHeader) {
  if (typeof rawHeader !== 'string') return null
  const cleaned = rawHeader.trim().toLowerCase()
  if (!cleaned) return null

  // Explicit drop — PM10 is not a parameter AtmosFlow scores.
  // Surface as null so the caller logs it in unmappedColumns.
  if (/^pm\s*10\b/.test(cleaned)) return null

  // CO2 — must come before CO check.
  if (/\bco\s*2\b/.test(cleaned) || /carbon\s*dioxide/.test(cleaned)) {
    return { canonical: 'co2', transform: 'passthrough' }
  }

  // CO (carbon monoxide) — explicitly NOT followed by "2".
  if (/^co(?!\s*2)\b/.test(cleaned) || /carbon\s*monoxide/.test(cleaned)) {
    return { canonical: 'co', transform: 'passthrough' }
  }

  // Temperature — check °C vs °F vs unit-less.
  if (/\btemp(?:erature)?\b/.test(cleaned) || /\bdry[\s-]*bulb/.test(cleaned)) {
    if (/[°˚]?\s*c\b/.test(cleaned) && !/[°˚]?\s*f\b/.test(cleaned)) {
      return { canonical: 'tf', transform: 'celsius_to_fahrenheit' }
    }
    return { canonical: 'tf', transform: 'passthrough' }
  }

  // Relative humidity.
  if (/relative\s*humidity/.test(cleaned) || /^r\.?h\.?\b/.test(cleaned) || /^humidity\b/.test(cleaned)) {
    return { canonical: 'rh', transform: 'passthrough' }
  }

  // PM2.5.
  if (/\bpm\s*2\.?5\b/.test(cleaned) || /particulate(?:\s*matter)?(?:\s*2\.?5)?/.test(cleaned)) {
    return { canonical: 'pm', transform: 'passthrough' }
  }

  // TVOC / VOC — match as a standalone word so "Total VOCs",
  // "Cumulative VOC", and bare "VOC" all flow through the same path.
  if (/\btvocs?\b/.test(cleaned) || /\bvocs?\b/.test(cleaned) || /volatile\s*organic/.test(cleaned)) {
    return { canonical: 'tv', transform: 'passthrough' }
  }

  // Formaldehyde — ppb→ppm transform when the unit is in the header.
  if (/\bhcho\b/.test(cleaned) || /formaldehyde/.test(cleaned)) {
    if (/\bppb\b/.test(cleaned)) return { canonical: 'hc', transform: 'ppb_to_ppm' }
    return { canonical: 'hc', transform: 'passthrough' }
  }

  return null
}

/**
 * Split a CSV line honoring double-quoted fields with embedded
 * commas. Does NOT support embedded quotes or newlines — those
 * are not in scope for instrument-log layouts.
 */
export function splitCsvLine(line) {
  if (typeof line !== 'string') return []
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function normalizeValue(raw, transform) {
  if (raw === null || raw === undefined) return null
  const cleaned = String(raw).trim()
  if (cleaned === '') return null
  // Allow numeric values with units appended ("23.5 ppm", "1,234")
  // by stripping non-numeric trailing characters. Leave NaN to the
  // caller via the explicit isFinite check.
  const numericPart = cleaned.replace(/[, ]/g, '').match(/^-?\d+(?:\.\d+)?/)
  if (!numericPart) return null
  const n = Number(numericPart[0])
  if (!Number.isFinite(n)) return null
  if (transform === 'celsius_to_fahrenheit') {
    return n * 9 / 5 + 32
  }
  if (transform === 'ppb_to_ppm') {
    return n / 1000
  }
  return n
}

/**
 * Find the header row in a CSV that may contain a preamble. Instrument
 * logs are often single-parameter ("Time,CO2") — unlike lab CSVs
 * which always have several columns. Heuristic: first row where at
 * least 1 column maps to a canonical parameter. Confusing
 * preamble rows (lab name, project title) won't have parameter
 * columns so this still skips them safely.
 */
function findHeaderRow(lines) {
  for (let i = 0; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    if (fields.length === 0) continue
    let mapped = 0
    for (const f of fields) if (mapInstrumentHeader(f)) mapped++
    if (mapped >= 1) return { headerIndex: i, headers: fields }
  }
  return null
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function aggregate(values) {
  if (!values || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  // Stats are stored UNROUNDED so the recommended-reading layer
  // can round each parameter to its own precision (HCHO needs
  // sub-ppm, CO/CO2/PM/TVOC are integers, temp/RH one decimal).
  // The display layer applies its own toFixed() per parameter.
  return {
    count: sorted.length,
    mean: sum / sorted.length,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

function detectInstrument(csvText) {
  if (typeof csvText !== 'string') return null
  const head = csvText.split('\n').slice(0, 12).join('\n')
  if (/Q[\s-]*Trak/i.test(head)) return 'TSI Q-Trak'
  if (/IAQ[\s-]*Calc/i.test(head)) return 'TSI IAQ-Calc'
  if (/Aeroqual/i.test(head)) return 'Aeroqual'
  if (/Graywolf|AdvancedSense/i.test(head)) return 'Graywolf'
  if (/Testo/i.test(head)) return 'Testo'
  if (/Kanomax/i.test(head)) return 'Kanomax'
  if (/Awair/i.test(head)) return 'Awair'
  if (/Kaiterra/i.test(head)) return 'Kaiterra'
  return null
}

/**
 * Parse an instrument-log CSV and return aggregated per-parameter
 * statistics.
 *
 * @param {string} csvText
 * @returns {{
 *   instrument: string | null,
 *   parameters: { [canonicalId]: { count, mean, median, p95, min, max } },
 *   unmappedColumns: string[],
 *   warnings: string[],
 *   sampleCount: number,        // data rows accepted
 *   recommendedReadings: { [canonicalId]: number },
 *                              // mean rounded for the SENSOR_FIELDS input,
 *                              // the "apply to zone" payload
 * }}
 */
export function parseInstrumentLogCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return {
      instrument: null,
      parameters: {},
      unmappedColumns: [],
      warnings: ['Empty or non-text CSV input.'],
      sampleCount: 0,
      recommendedReadings: {},
    }
  }

  const instrument = detectInstrument(csvText)
  const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length > 0)
  const header = findHeaderRow(lines)
  if (!header) {
    return {
      instrument,
      parameters: {},
      unmappedColumns: [],
      warnings: ['No recognizable parameter header row found. Confirm the CSV contains columns like CO2, Temperature, Humidity, etc.'],
      sampleCount: 0,
      recommendedReadings: {},
    }
  }

  const { headerIndex, headers } = header
  const mapping = headers.map(h => mapInstrumentHeader(h))
  const unmappedColumns = headers.filter((_, i) => !mapping[i])

  // Per-canonical aggregation buckets — multiple columns mapping
  // to the same canonical (e.g. two temperature columns from a
  // dual-probe device) get concatenated into the same bucket.
  const buckets = {}
  for (const c of CANONICAL_PARAMS) buckets[c] = []

  let acceptedRows = 0
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    if (fields.length === 0 || fields.every(f => !f)) continue
    let anyValue = false
    for (let c = 0; c < headers.length; c++) {
      const map = mapping[c]
      if (!map) continue
      const value = normalizeValue(fields[c], map.transform)
      if (value !== null) {
        buckets[map.canonical].push(value)
        anyValue = true
      }
    }
    if (anyValue) acceptedRows++
  }

  const parameters = {}
  const recommendedReadings = {}
  for (const c of CANONICAL_PARAMS) {
    const agg = aggregate(buckets[c])
    if (agg) {
      parameters[c] = agg
      // Round the recommended apply-to-zone value to a sane number
      // of significant figures based on the parameter's typical
      // precision.
      if (c === 'hc') recommendedReadings[c] = Math.round(agg.mean * 1000) / 1000
      else if (c === 'co' || c === 'co2' || c === 'pm' || c === 'tv') recommendedReadings[c] = Math.round(agg.mean)
      else recommendedReadings[c] = Math.round(agg.mean * 10) / 10
    }
  }

  const warnings = []
  if (acceptedRows === 0) warnings.push('Header row found but no parameter values could be parsed.')
  if (Object.keys(parameters).length === 0) warnings.push('No supported parameters detected. Confirm column headers map to CO2 / Temp / RH / CO / PM2.5 / TVOC / HCHO.')

  return {
    instrument,
    parameters,
    unmappedColumns,
    warnings,
    sampleCount: acceptedRows,
    recommendedReadings,
  }
}
