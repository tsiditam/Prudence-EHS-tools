/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * docxText — read the text out of a .docx, in the browser.
 *
 * AtmosFlow's own deliverables are .docx (the consultant report, the
 * Indoor Environmental Monitoring Report), so "here is my report, what
 * do you make of it?" is the most natural thing an assessor can ask the
 * assistant — and it was the one file type the upload path could not
 * take.
 *
 * ── No new dependency ──────────────────────────────────────────────────
 *
 * A .docx is a zip of XML, exactly like the .xlsx that `sensorXlsx.js`
 * already reads. Same approach here: the already-bundled jszip (loaded
 * on demand) plus the browser's DOMParser. No mammoth, no docx library,
 * nothing added to the bundle. Deliberately NOT `docxtemplater` — that
 * package is the one this codebase keeps off the chat path.
 *
 * ── What it extracts, and what it does not ─────────────────────────────
 *
 * Paragraph and table text in document order, which is what carries the
 * findings, the tables of readings, and the recommendations. Not
 * formatting, not images, not the figure PNGs — a chart embedded as an
 * image has no text layer, and this reports nothing rather than
 * pretending otherwise.
 *
 * The XML→text helper is exported pure so it can be tested with inline
 * XML and no zip.
 */

/** Pages have no meaning in a .docx; the budget is on characters. */
export const MAX_DOCX_CHARS = 60_000

/**
 * Turn WordprocessingML into plain text.
 *
 * Three element types carry the structure that matters:
 *   w:p    paragraph      → newline
 *   w:tab  tab            → a tab, so table-ish runs stay separable
 *   w:br   explicit break → newline
 *
 * Runs (`w:t`) are concatenated inside their paragraph. `xml:space` is
 * irrelevant here because we normalise whitespace at the end anyway.
 *
 * @param {string} xml contents of word/document.xml
 * @returns {string}
 */
export function documentXmlToText(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return ''
  let doc
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return ''
  }
  if (!doc || !doc.documentElement) return ''
  // A parse failure surfaces as a <parsererror> element rather than a
  // throw, so it has to be checked for explicitly.
  if (doc.getElementsByTagName('parsererror').length) return ''

  const out = []
  // getElementsByTagName with the w: prefix is namespace-naive but
  // matches how the file is actually written by Word, and mirrors what
  // sensorXlsx does for worksheets.
  const paragraphs = doc.getElementsByTagName('w:p')
  const list = paragraphs.length ? paragraphs : doc.getElementsByTagName('p')

  for (const p of Array.from(list)) {
    let line = ''
    // Walk descendants in document order so a tab between two runs lands
    // between their text rather than being appended at the end.
    const walk = (node) => {
      for (const child of Array.from(node.childNodes || [])) {
        const name = child.nodeName
        if (name === 'w:t' || name === 't') {
          line += child.textContent || ''
        } else if (name === 'w:tab' || name === 'tab') {
          line += '\t'
        } else if (name === 'w:br' || name === 'br') {
          line += '\n'
        } else if (child.childNodes && child.childNodes.length) {
          walk(child)
        }
      }
    }
    walk(p)
    const trimmed = line.trim()
    if (trimmed) out.push(trimmed)
  }
  return out.join('\n')
}

/**
 * Read a .docx File's text.
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.maxChars]
 * @returns {Promise<{text: string, truncated: boolean}>}
 */
export async function readDocxText(file, opts = {}) {
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : MAX_DOCX_CHARS
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)

  const main = zip.file('word/document.xml')
  if (!main) {
    // A .doc renamed to .docx, or an OpenDocument file, lands here.
    throw new Error('That file is not a Word (.docx) document.')
  }
  const body = documentXmlToText(await main.async('string'))

  // Headers and footers are separate parts, and on an AtmosFlow report
  // they are where the identifying facts live: the running header
  // carries the project and dates, the footer carries "Prepared for
  // <client>". Reading only document.xml yields a report that never
  // says who it is for — so they are pulled in once each and labelled,
  // rather than repeated per page as Word would render them.
  const chrome = []
  for (const [label, re] of [
    ['Running header', /^word\/header\d*\.xml$/],
    ['Running footer', /^word\/footer\d*\.xml$/],
  ]) {
    const seen = new Set()
    for (const f of zip.file(re) || []) {
      const t = documentXmlToText(await f.async('string')).replace(/\s+/g, ' ').trim()
      // Word emits first-page / even-page variants that usually repeat.
      if (t && !seen.has(t)) {
        seen.add(t)
        chrome.push(`[${label}] ${t}`)
      }
    }
  }

  const text = chrome.length ? `${chrome.join('\n')}\n\n${body}` : body
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return { text: clean.slice(0, maxChars), truncated: clean.length > maxChars }
}
