/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * pdfText — extract selectable text from a PDF, in the browser.
 *
 * ── Why this file exists on its own ────────────────────────────────────
 *
 * pdf.js is roughly a megabyte. The SPA bundle is already past Vite's
 * chunk-size warning, and the overwhelming majority of sessions never
 * upload a PDF. So the engine lives behind a module boundary and the
 * caller reaches it with `await import('./pdfText')` at the moment a PDF
 * is actually dropped — Vite emits it as its own chunk, and a user who
 * never attaches a PDF never downloads it.
 *
 * Nothing else in the app may import this file statically. Doing so would
 * pull pdf.js back into the main chunk and quietly undo the split.
 *
 * ── Scanned documents ──────────────────────────────────────────────────
 *
 * This reads the text layer only. A scanned lab report — a photograph of
 * paper in a PDF wrapper — has no text layer, and this returns empty
 * rather than guessing. The caller turns that into an explicit "no
 * selectable text found; a scanned document needs OCR first" message,
 * which is the honest answer.
 */

/**
 * Pages read before we stop.
 *
 * Was 20, on the reasoning that "a lab report's findings are at the front".
 * True of a lab report, and wrong about the document people actually upload
 * for review: a consultant's IAQ assessment runs 30-60 pages and is shaped
 * the other way round — scope and method at the front, findings, tables and
 * recommendations at the back, appendices after that. A real 41-page report
 * lost pages 21-41, which is the half worth reading.
 *
 * 60 covers the realistic range for a full assessment without turning an
 * accidental drop of a 400-page archive into a locked tab; the character
 * ceiling below is the real backstop either way.
 */
export const MAX_PDF_PAGES = 60

/**
 * Character ceiling across all pages.
 *
 * Raised with the page cap — 60 pages of dense report text runs past 60k,
 * and a ceiling that cuts mid-report while the page budget says there was
 * room is the confusing failure. These bytes never reach the network: the
 * file is parsed in the browser and thrown away, so the cost is memory and
 * a few hundred milliseconds, not payload.
 */
export const MAX_PDF_CHARS = 120_000

let enginePromise = null

/**
 * Load pdf.js once per session and point it at its worker.
 *
 * The worker URL is resolved through `import.meta.url` so Vite fingerprints
 * and serves it as an asset; hardcoding a path would break under the PWA's
 * hashed build output.
 */
function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      try {
        const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.toString()
      } catch {
        // Without a worker pdf.js falls back to main-thread parsing. Slower
        // on a large document, but a working upload beats a failed one.
      }
      return pdfjs
    })()
  }
  return enginePromise
}

/**
 * Read a PDF's text.
 *
 * @param {File|Blob} file
 * @param {object} [opts]
 * @param {number} [opts.maxPages]
 * @param {number} [opts.maxChars]
 * @returns {Promise<{text: string, pages: number, pagesRead: number, truncated: boolean}>}
 */
export async function readPdfText(file, opts = {}) {
  const maxPages = Number.isFinite(opts.maxPages) ? opts.maxPages : MAX_PDF_PAGES
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : MAX_PDF_CHARS

  const pdfjs = await loadEngine()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({
    data,
    // No network fetches for fonts or CMaps: this runs offline in the
    // field, and the text layer does not need them to be readable.
    disableFontFace: true,
    isEvalSupported: false,
  }).promise

  const pages = doc.numPages
  const pagesToRead = Math.min(pages, maxPages)
  const out = []
  let chars = 0
  // Pages actually READ, which is not the same as pages attempted: the loop
  // stops early on the character ceiling. Reporting the attempt count made
  // the disclosure overstate what the model had seen, and an honest
  // truncation notice is the entire value of tracking this.
  let pagesRead = 0

  try {
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      // `hasEOL` marks the end of a visual line; using it keeps a results
      // table on separate lines instead of collapsing it into one run-on
      // string where the analyte and its value become indistinguishable.
      let text = ''
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue
        text += item.str
        text += item.hasEOL ? '\n' : ' '
      }
      page.cleanup()
      pagesRead = i
      const trimmed = text.trim()
      if (trimmed) {
        out.push(trimmed)
        chars += trimmed.length
      }
      if (chars >= maxChars) break
    }
  } finally {
    // Release the worker's copy of the document even if a page threw.
    try { await doc.destroy() } catch { /* already gone */ }
  }

  const joined = out.join('\n\n')
  return {
    text: joined.slice(0, maxChars),
    pages,
    pagesRead,
    truncated: joined.length > maxChars || pages > pagesRead,
  }
}
