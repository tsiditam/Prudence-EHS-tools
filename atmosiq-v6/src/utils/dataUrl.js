/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Decode stored `data:` URLs — the counterpart to fileToDataUrl in
 * projectsTheme.js. Projects persist uploaded files as base64 `data:` URLs in
 * project.documents[].dataUrl (projectStore.addDocument); these helpers turn
 * one back into text / bytes / a File so a project's stored CSV/XLSX can be
 * re-fed into Logger Studio's existing parser without a fresh file upload.
 *
 * Pure and dependency-free; works in the browser and in jsdom tests.
 */

// Split a `data:<mime>[;base64],<body>` URL. Throws on anything that isn't one.
function parseDataUrl(dataUrl) {
  const s = String(dataUrl || '')
  const comma = s.indexOf(',')
  if (!s.startsWith('data:') || comma === -1) throw new Error('Not a data URL')
  const header = s.slice(5, comma) // e.g. "text/csv;base64"
  const body = s.slice(comma + 1)
  const isBase64 = /;base64/i.test(header)
  const mime = header.replace(/;base64/i, '').split(';')[0] || ''
  return { mime, body, isBase64 }
}

/** Decode a data URL to raw bytes. */
export function dataUrlToBytes(dataUrl) {
  const { body, isBase64 } = parseDataUrl(dataUrl)
  if (!isBase64) {
    // Percent-encoded text payload — re-encode the decoded string as UTF-8.
    return new TextEncoder().encode(decodeURIComponent(body))
  }
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Decode a data URL to UTF-8 text (for CSV). Handles a UTF-8 BOM transparently. */
export function dataUrlToText(dataUrl) {
  return new TextDecoder('utf-8').decode(dataUrlToBytes(dataUrl))
}

/** Decode a data URL into a File, so it drops straight into File/Blob APIs (e.g. xlsxToRows). */
export function dataUrlToFile(dataUrl, name = 'file', type = '') {
  const bytes = dataUrlToBytes(dataUrl)
  const mime = type || parseDataUrl(dataUrl).mime || 'application/octet-stream'
  return new File([bytes], name, { type: mime })
}
