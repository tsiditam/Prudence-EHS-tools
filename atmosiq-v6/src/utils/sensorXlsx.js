/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * sensorXlsx — read an .xlsx logger export into rows for sensorParser.
 *
 * No new dependency and no SheetJS (which has a prototype-pollution CVE
 * history): an .xlsx is a zip of XML, so we read the first worksheet with
 * the already-bundled jszip + the browser's DOMParser, resolve the shared
 * string table, and hand a plain 2D row array to parseSensorRows — the
 * same core the CSV path uses. Excel date serials are converted to real
 * timestamps inside parseTimestamp.
 *
 * The XML→rows helpers are exported pure so they're unit-testable with
 * inline XML (no zip needed).
 */

import { parseSensorRows } from './sensorParser'

// Shared string table: ordered <si> entries; each may hold multiple <t>
// runs (rich text) which concatenate.
export function parseSharedStrings(xml) {
  if (!xml) return []
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((t) => t.textContent || '').join(''))
}

// "A1" / "BC12" → 0-based column index.
function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '')
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

// Worksheet XML → 2D row array (strings). Shared-string cells (t="s")
// dereference into `shared`; inline strings and numbers pass through.
export function worksheetXmlToRows(sheetXml, shared = []) {
  if (!sheetXml) return []
  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml')
  const rowEls = Array.from(doc.getElementsByTagName('row'))
  const out = []
  let maxCol = 0
  for (const rowEl of rowEls) {
    const arr = []
    for (const c of Array.from(rowEl.getElementsByTagName('c'))) {
      const col = colIndex(c.getAttribute('r'))
      const t = c.getAttribute('t')
      let val = ''
      if (t === 'inlineStr') {
        const tEl = c.getElementsByTagName('t')[0]
        val = tEl ? (tEl.textContent || '') : ''
      } else {
        const vEl = c.getElementsByTagName('v')[0]
        const raw = vEl ? (vEl.textContent || '') : ''
        val = t === 's' ? (shared[Number(raw)] ?? '') : raw
      }
      arr[col] = val
      if (col > maxCol) maxCol = col
    }
    out.push(arr)
  }
  // Normalize ragged rows to a rectangular grid.
  return out.map((r) => { for (let i = 0; i <= maxCol; i++) if (r[i] === undefined) r[i] = ''; return r })
}

// Pick the lowest-numbered worksheet (logger exports are single-sheet).
function firstSheetPath(zip) {
  const keys = Object.keys(zip.files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
  keys.sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0))
  return keys[0] || null
}

// Extract the first worksheet of an .xlsx File/Blob to a 2D row array.
export async function xlsxToRows(file) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const sheetPath = firstSheetPath(zip)
  if (!sheetPath) throw new Error('No worksheet found in that .xlsx file.')
  const sheetXml = await zip.file(sheetPath).async('string')
  const ssFile = zip.file('xl/sharedStrings.xml')
  const shared = ssFile ? parseSharedStrings(await ssFile.async('string')) : []
  return worksheetXmlToRows(sheetXml, shared)
}

export async function parseSensorXlsx(file, opts = {}) {
  return parseSensorRows(await xlsxToRows(file), opts)
}
