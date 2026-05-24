/**
 * Supplemental report sections — placement, lettering, and TOC sync.
 *
 * The v2.1 engine renderer owns the canonical section model (body order,
 * Table of Contents, Appendices A–F). Newer data additions — the Standards
 * Currency methodology note and the Lab Results / Sensor Graphs appendices —
 * are NOT part of the engine model. Rather than pushing them onto the end of
 * the document (which left them out of the TOC, mis-lettered, and after the
 * footer), this module folds them into the canonical model:
 *
 *   • body sections (e.g. Standards Currency) render after Limitations and
 *     Professional Judgment, before the Signatory + appendices;
 *   • appendices (Lab Results, Sensor Graphs) are lettered continuously
 *     after the engine's last appendix (A–F → G, H, …);
 *   • every supplemental heading uses the shared section heading style; and
 *   • TOC entries are inserted at the matching position.
 *
 * Input shape (built by DocxReport.js from the assessment blob):
 *   supplemental = {
 *     bodySections: [ { title, children } ],   // verbatim title
 *     appendices:   [ { title, children } ],   // title gets "Appendix X — " prefix
 *   }
 * Builders return `null` when they have nothing to render, so absent data
 * produces no section, no TOC entry, and no letter consumed.
 */

const APPENDIX_TITLE_RE = /^Appendix\s+([A-Z])\b/

// A url-safe-ish anchor id mirroring the engine's TOC anchor convention.
const slug = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')

// First appendix letter to assign to supplemental appendices: one past the
// highest "Appendix X" letter already present in the engine TOC (A–F → G).
function nextAppendixLetter(engineTocEntries) {
  let maxCode = 'F'.charCodeAt(0) // canonical model reserves A–F
  for (const e of engineTocEntries || []) {
    const m = APPENDIX_TITLE_RE.exec(e.title || '')
    if (m) maxCode = Math.max(maxCode, m[1].charCodeAt(0))
  }
  return maxCode + 1
}

/**
 * Build the DOCX children + TOC metadata for the supplemental sections.
 *
 * @param {object} supplemental  { bodySections?, appendices? }
 * @param {object} opts          { headingFn, engineTocEntries }
 * @returns {{ bodyChildren, appendixChildren, bodyTocEntries, appendixTocEntries }}
 */
export function assembleSupplementalSections(supplemental, opts = {}) {
  const headingFn = opts.headingFn
  const empty = { bodyChildren: [], appendixChildren: [], bodyTocEntries: [], appendixTocEntries: [] }
  if (!supplemental || !headingFn) return empty

  const bodySections = (supplemental.bodySections || []).filter(s => s && Array.isArray(s.children) && s.children.length > 0)
  const appendices = (supplemental.appendices || []).filter(s => s && Array.isArray(s.children) && s.children.length > 0)

  const bodyChildren = []
  const bodyTocEntries = []
  for (const sec of bodySections) {
    bodyChildren.push(headingFn(sec.title), ...sec.children)
    bodyTocEntries.push({ anchorId: slug(sec.title), title: sec.title, level: 1 })
  }

  const appendixChildren = []
  const appendixTocEntries = []
  let code = nextAppendixLetter(opts.engineTocEntries)
  for (const ap of appendices) {
    const letter = String.fromCharCode(code++)
    const title = `Appendix ${letter} — ${ap.title}`
    appendixChildren.push(headingFn(title), ...ap.children)
    appendixTocEntries.push({ anchorId: slug(title), title, level: 1 })
  }

  return { bodyChildren, appendixChildren, bodyTocEntries, appendixTocEntries }
}

/**
 * Splice supplemental TOC entries into the engine's TOC entry list so the
 * Table of Contents lists every section in rendered order: body sections
 * after "Limitations and Professional Judgment", appendices after the last
 * engine appendix.
 */
export function mergeSupplementalTocEntries(engineTocEntries, supp) {
  const entries = [...(engineTocEntries || [])]
  const bodyTocEntries = supp?.bodyTocEntries || []
  const appendixTocEntries = supp?.appendixTocEntries || []
  if (bodyTocEntries.length === 0 && appendixTocEntries.length === 0) return entries

  // Body sections: after Limitations/Professional Judgment (fall back to end).
  if (bodyTocEntries.length > 0) {
    const limIdx = entries.findIndex(e => /Limitations and Professional Judgment/i.test(e.title || ''))
    const at = limIdx >= 0 ? limIdx + 1 : entries.length
    entries.splice(at, 0, ...bodyTocEntries)
  }

  // Appendices: after the last "Appendix X" entry (fall back to end).
  if (appendixTocEntries.length > 0) {
    let lastApx = -1
    for (let i = 0; i < entries.length; i++) {
      if (APPENDIX_TITLE_RE.test(entries[i].title || '')) lastApx = i
    }
    const at = lastApx >= 0 ? lastApx + 1 : entries.length
    entries.splice(at, 0, ...appendixTocEntries)
  }

  return entries
}
