/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * chatAttachments — turn a dropped file into something AtmosFlow AI can read.
 *
 * ── Why a digest, and not the file ─────────────────────────────────────
 *
 * The obvious implementation is to ship the file to the API and parse it
 * there. Three things make that the wrong call here:
 *
 *   1. THE HOT PATH STAYS LEAN. `api/field-assistant.ts` is the Jasper
 *      cold-start path, and the standing rule after the docxtemplater
 *      incident is that heavy parsing dependencies do not go in it. A CSV,
 *      XLSX and PDF parser bundled into every chat turn is the same defect
 *      with a different library.
 *
 *   2. THE BODY BUDGET IS ALREADY SPENT. Vercel caps the request body near
 *      4.5 MB and photos already compete for it. A four-day logger export
 *      is megabytes of rows; the *facts* in it are two kilobytes.
 *
 *   3. THE PARSERS ALREADY EXIST, CLIENT-SIDE, TESTED. `parseSensorCsv`,
 *      `xlsxToRows` and `parseLabResultsCsv` are the same code paths Logger
 *      Studio and Lab Results Import already run. Re-implementing them
 *      server-side would mean two parsers that must agree forever.
 *
 * So the file is parsed in the browser and only a bounded DIGEST travels:
 * what the columns were, over what period, at what interval, with what
 * summary statistics and which integrity flags. That is what a question
 * like "does this look like a ventilation problem?" is actually answered
 * from — the model never needed row 8,442.
 *
 * ── What a digest is not ───────────────────────────────────────────────
 *
 * A digest reports what was measured. It does not score, classify, or
 * interpret, and it carries no threshold comparisons — those belong to the
 * engine and to a qualified reviewer, not to a file-upload path.
 *
 * Pure: no React, no network, no DOM beyond the File/Blob reading the
 * caller hands in. Everything here is unit-testable from plain objects.
 */

import { parseSensorCsv, parseSensorRows } from './sensorParser'
import { xlsxToRows } from './sensorXlsx'
import { parseLabResultsCsv } from './labResultsParser'

/** Attachment kinds this module can produce a digest for. */
export const ATTACHMENT_KINDS = ['sensor', 'lab', 'pdf', 'text']

/** How many non-image files may ride along with a single message. */
export const MAX_ATTACHMENTS_PER_REQUEST = 3

/**
 * Largest file we will attempt to read into memory, per file.
 *
 * Generous compared with the photo cap because none of these bytes reach
 * the network — they are parsed in the browser and thrown away. The limit
 * exists so a mis-drag of a 500 MB archive fails immediately instead of
 * hanging the tab.
 */
export const MAX_ATTACHMENT_BYTES = 25_000_000

/**
 * Character ceiling on a single rendered digest.
 *
 * Sized so the worst case (MAX_ATTACHMENTS_PER_REQUEST full digests) stays
 * a rounding error against the prompt budget rather than crowding out the
 * conversation history.
 */
export const MAX_DIGEST_CHARS = 4000

/**
 * Character ceiling for a DOCUMENT digest (PDF, .docx, plain text).
 *
 * Larger than the structured budget above, and for a specific reason: a
 * logger or lab digest is COMPLETE at 4,000 characters — it is a summary
 * by construction, and more room would add nothing. A report is the
 * opposite; its content is the whole point. A real AtmosFlow monitoring
 * report extracts to ~10,000 characters, so the structured budget would
 * hand the model the cover page and the first two sections and silently
 * drop the findings — which is precisely the part someone uploading a
 * report wants read.
 *
 * Still bounded: three documents at this size is ~13k tokens, which sits
 * against the history cap rather than crowding it out.
 *
 * ── Why this is 16k and not 40k ────────────────────────────────────────
 *
 * A digest is concatenated into the USER MESSAGE, which is persisted and
 * replayed as history for up to MAX_HISTORY_TURNS (20) turns. So an inline
 * digest is not paid once — it is re-sent on every turn until it trims out.
 * A 40k-char digest is ~11k tokens re-sent twenty times for one upload,
 * which is the same class of defect as the knowledge-graph projection that
 * shipped in every context block for a feature nobody could open.
 *
 * The extractor now reads up to 120k characters (utils/pdfText.js), so for
 * a long report this digest is a PREFIX and says so. Reaching the rest is
 * a retrieval problem, not a budget problem: the text is stored and fetched
 * by tool on the turn it is needed, rather than carried on every turn in
 * case it is.
 */
export const MAX_DOCUMENT_DIGEST_CHARS = 16_000

const TEXT_EXT = /\.(txt|md|log)$/i
const CSV_EXT = /\.(csv|tsv)$/i
const XLSX_EXT = /\.(xlsx|xlsm)$/i
const PDF_EXT = /\.pdf$/i
const DOCX_EXT = /\.docx$/i

const IMAGE_MIME = /^image\//

/**
 * What kind of thing did the user just drop?
 *
 * Extension is checked alongside MIME because the two disagree constantly
 * in the field: Windows serves `.csv` as `application/vnd.ms-excel`, iOS
 * serves a Files-app pick as `application/octet-stream`, and a logger that
 * writes `.TXT` with tab separators is still a CSV to everyone but the
 * operating system.
 *
 * @param {{name?: string, type?: string}} file
 * @returns {'image'|'sensor'|'lab'|'pdf'|'text'|null} null when unsupported
 */
export function classifyAttachment(file) {
  if (!file) return null
  const name = typeof file.name === 'string' ? file.name : ''
  const type = typeof file.type === 'string' ? file.type : ''

  if (IMAGE_MIME.test(type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)) return 'image'
  if (PDF_EXT.test(name) || type === 'application/pdf') return 'pdf'
  // .docx before .xlsx: both are zip-of-XML and both carry a
  // "…officedocument…" MIME type, so the more specific test goes first.
  if (DOCX_EXT.test(name) || type.includes('wordprocessingml')) return 'docx'
  if (XLSX_EXT.test(name) || type.includes('spreadsheetml')) return 'sensor'
  // A CSV could be either a logger export or a lab report. Which one it is
  // cannot be known from the name, so both parsers are tried against the
  // content and the one that recognises more wins (see `digestForFile`).
  if (CSV_EXT.test(name) || type === 'text/csv' || type === 'application/vnd.ms-excel') return 'sensor'
  if (TEXT_EXT.test(name) || type.startsWith('text/')) return 'text'
  return null
}

/**
 * The accept attribute for the composer's file input.
 *
 * Carries BOTH the MIME type and the extension for every data format,
 * because the mobile pickers disagree about which one they honour: iOS
 * greys out anything it does not believe is accepted, and it matches on
 * UTI (resolved from the MIME type) rather than on a bare extension —
 * so an extension-only list leaves a Word report untappable in the Files
 * app. Android's picker leans the other way and matches extensions more
 * reliably. Listing both is what makes the picker usable on a phone,
 * which is where these files actually get attached.
 *
 * `application/octet-stream` is included deliberately: iOS serves a
 * Files-app pick as octet-stream more often than not, and omitting it
 * hides exactly the documents this feature exists to accept. The real
 * gate is `classifyAttachment` plus the parser, which run on content and
 * name — the accept list only decides what the picker will offer.
 */
export const ATTACHMENT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'text/csv', '.csv',
  'text/tab-separated-values', '.tsv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', '.xlsm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx',
  'application/pdf', '.pdf',
  'text/plain', '.txt', '.md', '.log',
  'application/octet-stream',
].join(',')

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Round to at most `d` places without printing trailing zeroes. */
function round(v, d = 2) {
  if (!isNum(v)) return null
  const f = Math.pow(10, d)
  return Math.round(v * f) / f
}

/** ISO date-time, or null. Digests are timezone-explicit via UTC. */
function iso(ms) {
  if (!isNum(ms)) return null
  try {
    return new Date(ms).toISOString()
  } catch {
    return null
  }
}

function humanDuration(ms) {
  if (!isNum(ms) || ms <= 0) return null
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d} d ${h % 24} h`
  }
  return h ? `${h} h ${m} m` : `${m} m`
}

/**
 * A logger dataset reduced to its reportable facts.
 *
 * @param {object} dataset output of parseSensorCsv / parseSensorRows
 * @param {string} [fileName]
 */
export function buildSensorDigest(dataset, fileName) {
  if (!dataset) return null
  const summary = dataset.summary || {}
  const stats = summary.stats || {}
  const params = Array.isArray(dataset.params) ? dataset.params : []
  const units = dataset.units || {}

  return {
    kind: 'sensor',
    name: fileName || dataset.fileName || null,
    readings: isNum(dataset.rawCount) ? dataset.rawCount : summary.count || 0,
    hasTimestamps: !!dataset.hasTimestamps,
    start: iso(summary.start),
    end: iso(summary.end),
    duration: humanDuration(
      isNum(summary.start) && isNum(summary.end) ? summary.end - summary.start : null,
    ),
    intervalSec: isNum(summary.intervalSec) ? Math.round(summary.intervalSec) : null,
    parameters: params.map((p) => {
      const s = stats[p] || null
      return {
        param: p,
        unit: units[p] || null,
        mean: s ? round(s.mean, 3) : null,
        min: s ? round(s.min, 3) : null,
        max: s ? round(s.max, 3) : null,
        n: s ? s.n : 0,
        missing: isNum(summary.missing && summary.missing[p]) ? summary.missing[p] : 0,
      }
    }),
    // Integrity flags travel with the data. A dataset whose temperature
    // column is probably Celsius mislabelled as Fahrenheit must not be
    // discussed as though that were settled.
    qualityFlags: Array.isArray(dataset.quality && dataset.quality.flags)
      ? dataset.quality.flags.map((f) => (typeof f === 'string' ? f : f && f.msg)).filter(Boolean)
      : [],
    unmappedColumns: Array.isArray(dataset.columns)
      ? dataset.columns.filter((c) => c && c.role === 'unknown').map((c) => c.raw).slice(0, 12)
      : [],
  }
}

/**
 * A lab results CSV reduced to its analytes and sample count.
 *
 * Individual results are NOT enumerated past a small sample: a 400-row
 * bulk mould report would consume the whole digest budget, and the
 * question a user asks of an uploaded lab report ("what did this find?")
 * is answered by the analyte list and the sample inventory.
 */
export function buildLabDigest(parsed, fileName) {
  if (!parsed) return null
  const rows = Array.isArray(parsed.rows) ? parsed.rows : []
  const analytes = []
  const seenAnalyte = new Set()
  const samples = new Set()
  for (const r of rows) {
    if (r && r.sampleId) samples.add(r.sampleId)
    const a = r && r.analyte
    if (a && !seenAnalyte.has(a)) {
      seenAnalyte.add(a)
      analytes.push(a)
    }
  }
  return {
    kind: 'lab',
    name: fileName || null,
    laboratory: parsed.laboratory || null,
    rowCount: rows.length,
    sampleCount: samples.size,
    analytes: analytes.slice(0, 40),
    analytesTruncated: analytes.length > 40,
    // A handful of verbatim rows so units and detection limits are visible
    // in their original form rather than paraphrased.
    sampleRows: rows.slice(0, 8).map((r) => ({
      sampleId: r.sampleId || null,
      location: r.location || null,
      analyte: r.analyte || null,
      result: r.result || null,
      units: r.units || null,
      detectionLimit: r.detectionLimit || null,
    })),
    unmappedColumns: Array.isArray(parsed.unmappedColumns) ? parsed.unmappedColumns.slice(0, 12) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
  }
}

/** Free text (a PDF's extracted text, or a dropped .txt) with a hard cap. */
export function buildTextDigest(text, fileName, opts = {}) {
  const raw = typeof text === 'string' ? text : ''
  // Collapse the runs of whitespace PDF extraction leaves behind, so the
  // budget is spent on words rather than layout.
  const clean = raw.replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const limit = isNum(opts.maxChars) ? opts.maxChars : MAX_DOCUMENT_DIGEST_CHARS - 400
  return {
    kind: opts.kind === 'pdf' || opts.kind === 'docx' ? opts.kind : 'text',
    name: fileName || null,
    pages: isNum(opts.pages) ? opts.pages : null,
    // Pages the extractor actually read. Computed all along and dropped at
    // the call site, so a 41-page report whose last pages were never opened
    // rendered as "41 pages … (truncated)" — which reads as "trimmed a bit"
    // rather than "half of this document was not looked at".
    pagesRead: isNum(opts.pagesRead) ? opts.pagesRead : null,
    chars: clean.length,
    truncated: clean.length > limit,
    text: clean.slice(0, limit),
    // The COMPLETE cleaned extraction, for the document store. Deliberately
    // not read by digestToPrompt: `text` is the bounded prefix that rides
    // inline, `full` is what a tool fetches a window of on the turn it is
    // needed. Keeping both on one object is what stops the two drifting —
    // the prefix is always literally the head of the full text.
    full: clean,
  }
}

/**
 * Render a digest as the text block that rides with the user's message.
 *
 * Plain text rather than JSON because it is read by a language model, and
 * because a labelled block survives truncation legibly where a clipped
 * JSON object does not.
 */
export function digestToPrompt(digest) {
  if (!digest) return ''
  const L = []
  const name = digest.name ? ` — ${digest.name}` : ''

  if (digest.kind === 'sensor') {
    L.push(`[Attached logger dataset${name}]`)
    L.push(`Readings: ${digest.readings}${digest.intervalSec ? ` at ~${digest.intervalSec}s interval` : ''}`)
    if (digest.start && digest.end) L.push(`Period: ${digest.start} to ${digest.end}${digest.duration ? ` (${digest.duration})` : ''}`)
    if (!digest.hasTimestamps) L.push('No timestamp column was detected — ordering is row order, not time.')
    L.push('Parameters measured:')
    for (const p of digest.parameters) {
      const u = p.unit ? ` ${p.unit}` : ''
      const range = p.mean == null ? 'no numeric values' : `mean ${p.mean}${u}, min ${p.min}${u}, max ${p.max}${u}, n=${p.n}`
      L.push(`  - ${p.param}: ${range}${p.missing ? `, ${p.missing} missing` : ''}`)
    }
    if (digest.unmappedColumns.length) L.push(`Unrecognised columns: ${digest.unmappedColumns.join(', ')}`)
    if (digest.qualityFlags.length) {
      L.push('Data integrity notes:')
      for (const f of digest.qualityFlags) L.push(`  - ${f}`)
    }
  } else if (digest.kind === 'lab') {
    L.push(`[Attached laboratory results${name}]`)
    if (digest.laboratory) L.push(`Laboratory: ${digest.laboratory}`)
    L.push(`${digest.rowCount} result rows across ${digest.sampleCount} sample IDs`)
    if (digest.analytes.length) {
      L.push(`Analytes: ${digest.analytes.join(', ')}${digest.analytesTruncated ? ', …' : ''}`)
    }
    if (digest.sampleRows.length) {
      L.push('First rows verbatim:')
      for (const r of digest.sampleRows) {
        L.push(
          `  - ${[r.sampleId, r.location, r.analyte, r.result, r.units, r.detectionLimit && `DL ${r.detectionLimit}`]
            .filter(Boolean)
            .join(' | ')}`,
        )
      }
    }
    if (digest.unmappedColumns.length) L.push(`Unmapped columns: ${digest.unmappedColumns.join(', ')}`)
    for (const w of digest.warnings) L.push(`Note: ${w}`)
  } else {
    const label = digest.kind === 'pdf' ? 'PDF' : digest.kind === 'docx' ? 'Word document' : 'document'
    L.push(`[Attached ${label}${name}]`)
    // Say what was NOT read, specifically. "(truncated)" alone reads as a
    // trimmed tail; a model told "41 pages, first 38 read" can say which
    // part of the document its answer does not cover — and a reviewer
    // needs that far more than it needs the extra characters.
    if (digest.pages) {
      const unread = isNum(digest.pagesRead) && digest.pagesRead < digest.pages
        ? ` (pages 1-${digest.pagesRead} read; ${digest.pages - digest.pagesRead} not read)`
        : ''
      L.push(`${digest.pages} page${digest.pages === 1 ? '' : 's'}${unread}`)
    }
    if (digest.truncated) {
      L.push(
        `Extracted text, TRUNCATED — this is the first ${digest.text.length.toLocaleString()} of `
        + `${digest.chars.toLocaleString()} characters extracted. Anything you say about this document `
        + `covers only the portion below; say so rather than implying you read all of it.`,
      )
    } else {
      L.push('Extracted text:')
    }
    L.push(digest.text)
  }

  const out = L.join('\n')
  // Structured digests are complete well inside the small budget;
  // documents get the larger one because their content IS the payload.
  const cap = digest.kind === 'sensor' || digest.kind === 'lab'
    ? MAX_DIGEST_CHARS
    : MAX_DOCUMENT_DIGEST_CHARS
  return out.length > cap ? `${out.slice(0, cap - 3)}...` : out
}

/**
 * Short human label for the composer chip.
 */
export function digestSummaryLine(digest) {
  if (!digest) return ''
  if (digest.kind === 'sensor') {
    const n = digest.parameters.length
    return `${digest.readings.toLocaleString('en-US')} readings · ${n} parameter${n === 1 ? '' : 's'}`
  }
  if (digest.kind === 'lab') {
    return `${digest.rowCount} results · ${digest.sampleCount} sample${digest.sampleCount === 1 ? '' : 's'}`
  }
  if (digest.kind === 'pdf') return digest.pages ? `${digest.pages} page${digest.pages === 1 ? '' : 's'}` : 'PDF'
  const words = digest.text ? digest.text.split(/\s+/).filter(Boolean).length : 0
  if (digest.kind === 'docx') return `${words.toLocaleString('en-US')} words read`
  return `${digest.chars.toLocaleString('en-US')} characters`
}

/**
 * Decide between the logger parser and the lab parser for a CSV.
 *
 * Both are run and the more confident result wins. A logger export has
 * recognised parameter columns; a lab report has analyte/result columns.
 * Guessing from the filename is unreliable — "results.csv" is written by
 * both — so the content decides.
 */
export function pickCsvDigest(csvText, fileName) {
  let sensor = null
  let lab = null
  try {
    sensor = parseSensorCsv(csvText, { fileName })
  } catch {
    sensor = null
  }
  try {
    lab = parseLabResultsCsv(csvText)
  } catch {
    lab = null
  }
  const sensorParams = sensor && Array.isArray(sensor.params) ? sensor.params.length : 0
  const labRows = lab && Array.isArray(lab.rows) ? lab.rows.length : 0
  const labMapped = labRows > 0 && lab.rows.some((r) => r && r.analyte)

  // A lab report only wins when it actually mapped analytes; otherwise a
  // logger CSV whose headers the lab parser half-recognised would be
  // described as laboratory data, which is a worse error than the reverse.
  if (labMapped && (sensorParams === 0 || labRows > sensorParams * 2)) {
    return buildLabDigest(lab, fileName)
  }
  if (sensorParams > 0) return buildSensorDigest(sensor, fileName)
  if (labMapped) return buildLabDigest(lab, fileName)
  return null
}

/**
 * Parse a File into a digest.
 *
 * `readPdfText` is injected rather than imported so this module stays free
 * of the PDF engine: the caller supplies it (dynamically imported at the
 * moment a PDF is actually dropped), and tests supply a stub.
 *
 * @param {File} file
 * @param {object} [deps]
 * @param {(file: File) => Promise<{text: string, pages: number}>} [deps.readPdfText]
 * @param {(file: File) => Promise<{text: string}>} [deps.readDocxText]
 * @returns {Promise<{ok: true, digest: object} | {ok: false, error: string}>}
 */
export async function digestForFile(file, deps = {}) {
  if (!file) return { ok: false, error: 'No file provided.' }
  if (isNum(file.size) && file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `${file.name || 'File'} is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1_000_000)} MB.`,
    }
  }
  const kind = classifyAttachment(file)
  const name = file.name || null

  try {
    if (kind === 'sensor' && XLSX_EXT.test(name || '')) {
      const rows = await xlsxToRows(file)
      const ds = parseSensorRows(rows, { fileName: name })
      const digest = buildSensorDigest(ds, name)
      if (!digest || !digest.parameters.length) {
        return { ok: false, error: `Could not find recognisable data columns in ${name || 'the spreadsheet'}.` }
      }
      return { ok: true, digest }
    }

    if (kind === 'sensor') {
      const text = await file.text()
      const digest = pickCsvDigest(text, name)
      if (!digest) {
        return {
          ok: false,
          error: `Could not recognise ${name || 'the file'} as logger data or lab results. It needs a header row with recognisable columns.`,
        }
      }
      return { ok: true, digest }
    }

    if (kind === 'pdf') {
      if (typeof deps.readPdfText !== 'function') {
        return { ok: false, error: 'PDF reading is unavailable in this context.' }
      }
      const { text, pages, pagesRead } = await deps.readPdfText(file)
      if (!text || !text.trim()) {
        return {
          ok: false,
          error: `No selectable text found in ${name || 'the PDF'}. A scanned document needs OCR first.`,
        }
      }
      return { ok: true, digest: buildTextDigest(text, name, { kind: 'pdf', pages, pagesRead }) }
    }

    if (kind === 'docx') {
      if (typeof deps.readDocxText !== 'function') {
        return { ok: false, error: 'Word document reading is unavailable in this context.' }
      }
      const { text } = await deps.readDocxText(file)
      if (!text || !text.trim()) {
        return {
          ok: false,
          error: `No readable text found in ${name || 'that document'}. A report that is only images has no text to read.`,
        }
      }
      return { ok: true, digest: buildTextDigest(text, name, { kind: 'docx' }) }
    }

    if (kind === 'text') {
      const text = await file.text()
      if (!text.trim()) return { ok: false, error: `${name || 'The file'} is empty.` }
      return { ok: true, digest: buildTextDigest(text, name) }
    }
  } catch (err) {
    return { ok: false, error: `Could not read ${name || 'the file'}: ${(err && err.message) || 'unknown error'}` }
  }

  return { ok: false, error: `${name || 'That file type'} is not supported.` }
}
