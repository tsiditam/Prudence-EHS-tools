/**
 * AtmosFlow — Lab Results CSV Parser
 *
 * Pure CSV → labResults[] mapper for the most common environmental
 * lab report layouts (EMSL Analytical, Eurofins / EMLab P&K,
 * Aerotech, generic). Closes the CoC loop: forms go out from
 * SamplingFormsView, samples come back as a results CSV, this
 * parser maps the CSV into a structured shape that the DOCX
 * renderer can table out as an appendix.
 *
 * NOT a wire-protocol parser. NOT an API client. The user uploads a
 * CSV they received from a lab, the function returns a normalized
 * shape. No network calls, no schema validation against the lab's
 * proprietary format — instead, column headers are auto-detected by
 * fuzzy keyword match so the same parser handles EMSL ("Sample ID")
 * and EMLab ("Lab #") and generic ("Sample Number") inputs without
 * per-lab branching.
 *
 * Architecture:
 *   parseLabResultsCsv(csvText)  → { laboratory, rows[], unmapped[], warnings[] }
 *     1. Split into header + data rows (RFC-4180-lite — handles
 *        quoted fields with embedded commas, NOT embedded quotes or
 *        embedded newlines; sufficient for the layouts in scope).
 *     2. Auto-detect column mapping via mapHeader(header) → canonical
 *        field name (or null = unmapped).
 *     3. For each data row, build a labResults row with canonical
 *        fields filled + `extra` carrying any unmapped columns.
 *
 * The output shape is what `assessment.labResults.rows[]` stores and
 * what the DOCX section consumes.
 */

const CANONICAL_FIELDS = [
  'sampleId',
  'sampleType',
  'location',
  'collectedAt',
  'receivedAt',
  'analyte',
  'result',
  'units',
  'detectionLimit',
  'analystNotes',
]

// Header patterns — order matters (first match wins). Specific
// before generic.
const HEADER_PATTERNS = [
  // sampleId — "Sample ID", "Lab #", "Lab Sample Number"
  [/^lab\s*sample\s*(?:id|num|#|number)$/i, 'sampleId'],
  [/^(?:lab|client)\s*(?:id|num|#|number)$/i, 'sampleId'],
  [/^sample\s*(?:id|num|#|number|name)$/i, 'sampleId'],

  // sampleType — "Sample Type", "Media Type", "Sample Media"
  [/^(?:sample\s*)?media(?:\s*type)?$/i, 'sampleType'],
  [/^sample\s*type$/i, 'sampleType'],
  [/^analysis\s*type$/i, 'sampleType'],

  // location — "Location", "Sample Location", "Room", "Area"
  [/^(?:sample\s*)?location$/i, 'location'],
  [/^room|area|building$/i, 'location'],
  [/^sample\s*description$/i, 'location'],

  // collectedAt — "Date Collected", "Sampling Date", "Collection Date"
  [/^(?:date\s*)?collected$/i, 'collectedAt'],
  [/^collection\s*date$/i, 'collectedAt'],
  [/^sampling\s*date$/i, 'collectedAt'],
  [/^date\s*sampled$/i, 'collectedAt'],

  // receivedAt — "Date Received", "Lab Received Date"
  [/^(?:date\s*)?received$/i, 'receivedAt'],
  [/^lab\s*received(?:\s*date)?$/i, 'receivedAt'],
  [/^received\s*at\s*lab$/i, 'receivedAt'],

  // analyte — "Analyte", "Parameter", "Test", "Organism", "Compound"
  [/^analyte$/i, 'analyte'],
  [/^parameter$/i, 'analyte'],
  [/^organism$/i, 'analyte'],
  [/^compound$/i, 'analyte'],
  [/^test\s*name?$/i, 'analyte'],

  // result — "Result", "Value", "Concentration", "Count"
  [/^result$/i, 'result'],
  [/^value$/i, 'result'],
  [/^concentration$/i, 'result'],
  [/^count$/i, 'result'],

  // units — "Units", "Unit", "Reporting Units"
  [/^units?$/i, 'units'],
  [/^reporting\s*units?$/i, 'units'],

  // detectionLimit — "Detection Limit", "DL", "MDL", "Reporting Limit", "RL"
  [/^(?:method\s*)?detection\s*limit$/i, 'detectionLimit'],
  [/^reporting\s*limit$/i, 'detectionLimit'],
  [/^\s*(?:m?d?l|rl)\s*$/i, 'detectionLimit'],

  // analystNotes — "Notes", "Comments", "Analyst Comments"
  [/^(?:analyst\s*)?notes?$/i, 'analystNotes'],
  [/^(?:analyst\s*)?comments?$/i, 'analystNotes'],
]

/**
 * Map a single CSV header to a canonical field name. Returns null
 * when no pattern matches — the caller stores the column in `extra`
 * so the data isn't lost.
 */
export function mapHeader(rawHeader) {
  if (typeof rawHeader !== 'string') return null
  const cleaned = rawHeader.trim()
  if (!cleaned) return null
  for (const [pattern, field] of HEADER_PATTERNS) {
    if (pattern.test(cleaned)) return field
  }
  return null
}

/**
 * Split a single CSV line into its fields. Honors double-quoted
 * fields with embedded commas. Does NOT honor embedded quotes or
 * embedded newlines — out of scope for lab-CSV layouts in production.
 * Returns an array of trimmed strings.
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

/**
 * Heuristic laboratory-name detector from common CSV preambles or a
 * "Laboratory" header column. Returns null if nothing identifying
 * could be extracted.
 */
function detectLaboratory(csvText) {
  if (typeof csvText !== 'string') return null
  // Look for known lab signatures in the first ~10 lines.
  const head = csvText.split('\n').slice(0, 10).join('\n')
  if (/EMSL\s*Analytical/i.test(head)) return 'EMSL Analytical, Inc.'
  if (/EMLab\s*P&K|EMLab\s*P\s*and\s*K/i.test(head)) return 'EMLab P&K (Eurofins)'
  if (/Eurofins/i.test(head)) return 'Eurofins'
  if (/Aerotech/i.test(head)) return 'Aerotech Laboratories'
  if (/Pace\s*Analytical/i.test(head)) return 'Pace Analytical'
  if (/Test\s*America|Eurofins\s*TestAmerica/i.test(head)) return 'Eurofins TestAmerica'
  return null
}

/**
 * Find the row in the CSV that looks like the column-header row.
 * Lab CSVs often have a preamble (lab name, address, COA #, etc.)
 * before the actual table. Heuristic: the header row is the first
 * row that has at least 2 columns AND at least 2 of those columns
 * map to a canonical field via mapHeader.
 *
 * Returns { headerIndex, headers } or null if no header-like row
 * is found.
 */
function findHeaderRow(lines) {
  for (let i = 0; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    if (fields.length < 2) continue
    let mappedCount = 0
    for (const f of fields) {
      if (mapHeader(f)) mappedCount++
      if (mappedCount >= 2) return { headerIndex: i, headers: fields }
    }
  }
  return null
}

/**
 * Parse a CSV text into structured lab results.
 *
 * @param {string} csvText
 * @returns {{
 *   laboratory: string | null,
 *   rows: Array<{ sampleId, sampleType, location, collectedAt, receivedAt, analyte, result, units, detectionLimit, analystNotes, extra }>,
 *   unmappedColumns: string[],
 *   warnings: string[],
 * }}
 */
export function parseLabResultsCsv(csvText) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return { laboratory: null, rows: [], unmappedColumns: [], warnings: ['Empty or non-text CSV input.'] }
  }
  const laboratory = detectLaboratory(csvText)
  // Normalize line endings, drop empty / pure-whitespace lines.
  const lines = csvText.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length > 0)
  const header = findHeaderRow(lines)
  if (!header) {
    return {
      laboratory,
      rows: [],
      unmappedColumns: [],
      warnings: ['No recognizable column header row found. Confirm the CSV contains columns like Sample ID, Analyte, Result.'],
    }
  }
  const { headerIndex, headers } = header
  const mapping = headers.map(mapHeader)
  const unmappedColumns = headers.filter((_, i) => !mapping[i])
  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    if (fields.length === 0 || fields.every(f => !f)) continue
    const row = {}
    const extra = {}
    let anyCanonicalFilled = false
    for (let c = 0; c < headers.length; c++) {
      const val = (fields[c] || '').trim()
      const field = mapping[c]
      if (field) {
        row[field] = val
        if (val) anyCanonicalFilled = true
      } else if (val) {
        extra[headers[c]] = val
      }
    }
    if (!anyCanonicalFilled) continue
    // Fill missing canonical fields with empty strings so downstream
    // consumers don't have to undefined-guard.
    for (const f of CANONICAL_FIELDS) {
      if (row[f] === undefined) row[f] = ''
    }
    row.extra = extra
    rows.push(row)
  }
  const warnings = []
  if (rows.length === 0) warnings.push('Header row found but no data rows could be parsed.')
  return { laboratory, rows, unmappedColumns, warnings }
}
