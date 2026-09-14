/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The report's own prose, by section — the text a quote must resolve against.
 *
 * Semantic Report QA rests entirely on one thing: when a reviewer quotes the
 * report, AtmosFlow must be able to find that quotation in the report. This
 * module is what makes that possible, and it is the only thing in the
 * semantic layer that has to be exactly right, because everything downstream
 * inherits its errors silently.
 *
 * ── It COLLECTS; it does not render ────────────────────────────────────
 * The obvious way to produce report text is to write one — walk the model and
 * emit strings. That is the wrong way, and the reason is the rule this
 * codebase keeps paying to relearn: every layer must say the same thing about
 * the same data. `sections-atmosflow.js` already turns the model into the one
 * client deliverable. A second walk that produced text would be a SECOND
 * rendering of the same document, free to drift, and a quote resolved against
 * drifted text is a quote resolved against a document no client ever saw.
 * That failure is silent and it looks like success.
 *
 * So nothing here renders anything. Every block this module returns is a
 * string that already exists ON THE MODEL and reaches the document unchanged:
 * `body(t)` and `bullet(t)` emit `String(t)` verbatim, and `lead(b, rest)`
 * splits one string into two runs whose concatenation is the original.
 * `report-text.test.ts` builds the real DOCX children and asserts
 * every block appears in them, so a drift between this file and the renderer
 * fails the build rather than corrupting a quote.
 *
 * ── Tables are excluded, and that is not a limitation ──────────────────
 * A table cell is not prose. Cells pass through `fmt()`, which turns an empty
 * value into an em dash, and through `sev().label`, which turns an outcome
 * token into a word — so the model's value and the document's cell are
 * genuinely different strings, and a quote could resolve against one while
 * the reader saw the other. Headings are excluded for the same reason:
 * `label()` upper-cases them.
 *
 * The exclusion also happens to be correct on the merits. The measurement
 * table, the findings table, the action register, the references appendix and
 * the QA/QC rows are structured data, and the deterministic layer already
 * compares them to each other far better than a language model could. What is
 * left is what the semantic layer is actually for: the paragraphs where
 * meaning lives and where two sections can disagree without any field
 * disagreeing.
 *
 * ── It mirrors the renderer's conditions, not just its fields ──────────
 * A section the document does not print must not appear here either. The
 * guards below are the renderer's guards, deliberately duplicated rather than
 * loosened: section 5's prose is all inside `if (M.findings)`, the
 * recommendations intro prints only when a register or a legacy list exists,
 * and so on. Collecting prose from a section the reader never sees would let
 * a reviewer raise a finding about text that is not in the report.
 */

import { fnv1aHex } from '../utils/forensicEvents.js'

/** Bumped when the section list or the collection rules change. */
export const REPORT_TEXT_VERSION = 1

/**
 * The sections a semantic reviewer may quote from, in document order.
 *
 * Frozen, and pinned by test against what the collector can actually produce.
 * A section id is a stable handle: it is what a reviewer names and what
 * resolution looks up, so it may not be renamed without a version bump.
 */
export const REPORT_SECTIONS = Object.freeze([
  Object.freeze({ id: 'executive_summary', name: 'Executive Summary' }),
  Object.freeze({ id: 'scope_and_purpose', name: 'Purpose, Scope & Site Background' }),
  Object.freeze({ id: 'methods', name: 'Investigation Methods & QA/QC' }),
  Object.freeze({ id: 'walkthrough_observations', name: 'Walkthrough Observations & Occupant Reports' }),
  Object.freeze({ id: 'measurement_results', name: 'Measurement Results' }),
  Object.freeze({ id: 'discussion', name: 'Discussion & Conclusions' }),
  Object.freeze({ id: 'recommended_actions', name: 'Recommended Actions & Verification' }),
  Object.freeze({ id: 'limitations', name: 'Limitations' }),
  Object.freeze({ id: 'professional_review', name: 'Professional Review & Signature' }),
  Object.freeze({ id: 'parameter_background', name: 'Appendix A — Parameter Background' }),
])

/** Every section id, for a fast membership test. */
export const REPORT_SECTION_IDS = Object.freeze(REPORT_SECTIONS.map((s) => s.id))

/**
 * What the report renders that this module deliberately does not collect,
 * with the reason. Exported so the exclusion is a stated decision a test can
 * read rather than an absence somebody has to notice.
 */
export const EXCLUDED_FROM_TEXT = Object.freeze({
  findings_table: 'Structured rows. Cells pass through fmt() and sev().label, so the model value and the printed cell are different strings.',
  measurement_table: 'The per-zone results table. Structured rows, and the outcome column is sev().label rather than a model value.',
  action_register: 'The recommended-actions register. Structured rows, and priority and owner share cells with other fields.',
  qa_qc: 'Rendered as a two-column table through splitLabelValue, which drops the separator.',
  references: 'Structured rows, and the basis text is rewritten by referenceBasisText().',
  conceptual_model_rows: 'Structured rows. Its intro paragraph IS collected, under discussion.',
  sampling_table: 'Structured rows. Its intro paragraph IS collected, under recommended_actions.',
  observations_building: 'The building-systems table. Structured rows, and each cell passes through fmt().',
  floor_plan_pins: 'The site-plan pin table. Structured rows naming locations, not claims about them.',
  headings: 'label() upper-cases; h1/h2 are navigation, not claims.',
  captions: 'Figure and table captions, set by the renderer rather than carried as report claims.',
  photo_captions: 'Composed by the renderer from a title and a timestamp.',
  cover_and_signature: 'Identity and metadata, not statements about the building.',
})

/** The separator between blocks in a section's joined text. */
export const BLOCK_SEPARATOR = '\n\n'

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * A model field as a block, or nothing.
 *
 * Only a non-empty string becomes a block. `String(t)` is what the renderer
 * emits, so anything that is not already a string is a field this module has
 * no business quoting — a number in a prose slot is a defect, not a sentence.
 */
const block = (v) => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

/** The renderer's `toParas`: a string, an array of strings, or nothing. */
const toParas = (t) => (Array.isArray(t) ? t : t ? [t] : [])

/**
 * Collect one section's prose. Each collector mirrors the renderer's own
 * guards; see the module note on why they are duplicated rather than relaxed.
 */
const COLLECTORS = {
  executive_summary(M) {
    const out = []
    if (M.execSummary) {
      // The renderer accepts a bare string for a stored report built before
      // the summary carried its own findings and actions. Both shapes render,
      // so both are collected.
      const es = typeof M.execSummary === 'string' ? { paragraphs: [M.execSummary] } : obj(M.execSummary)
      arr(es.paragraphs).forEach((p) => out.push(p))
      arr(es.findings).forEach((f) => out.push(f))
      arr(es.actions).forEach((a) => out.push(a))
    }
    // Printed under its own label between the summary and section 1, so it
    // belongs to the summary a reader has just read rather than to section 1.
    if (M.overallStatement) out.push(M.overallStatement)
    return out
  },

  scope_and_purpose(M) {
    const s = obj(M.scope)
    if (!M.scope || (!s.paras && !s.text)) return []
    return (s.paras || [s.text]).filter(Boolean)
  },

  methods(M) {
    const m = obj(M.methodology)
    if (!M.methodology) return []
    const out = [...arr(m.bullets)]
    if (m.referenceFramework) out.push(m.referenceFramework)
    return out
  },

  walkthrough_observations(M) {
    if (!M.observations) return []
    const o = obj(M.observations)
    const out = []
    if (o.intro) out.push(o.intro)
    arr(o.zones).forEach((zone) => {
      const z = obj(zone)
      arr(z.observed).forEach((line) => out.push(line))
      arr(z.occupantReports).forEach((line) => out.push(line))
      // `lead('Assessor notes: ', z.notes)` — the prefix is the renderer's
      // and the note is the report's, so only the note is quotable.
      if (z.notes) out.push(z.notes)
    })
    return out
  },

  measurement_results(M) {
    if (!M.results) return []
    const r = obj(M.results)
    return r.intro ? [r.intro] : []
  },

  discussion(M) {
    // Every paragraph in section 5 is inside the renderer's `if (M.findings)`.
    if (!M.findings) return []
    const out = []
    const d = obj(M.discussion)
    arr(d.paragraphs).forEach((p) => out.push(p))
    const f = obj(M.findings)
    if (f.intro) out.push(f.intro)
    const cm = obj(M.conceptualModel)
    if (arr(cm.rows).length) toParas(cm.intro).forEach((p) => out.push(p))
    const wh = obj(M.workingHypotheses)
    if (arr(wh.items).length) {
      if (wh.intro) out.push(wh.intro)
      arr(wh.items).forEach((it) => out.push(it))
    }
    return out
  },

  recommended_actions(M) {
    const rec = obj(M.recommendations)
    const out = []
    const hasRegister = arr(rec.register).length > 0
    const hasLegacy = arr(rec.immediate).length || arr(rec.shortTerm).length || arr(rec.mediumTerm).length
    // Section 6 prints only when one of the two shapes exists. Without it the
    // intro reaches no reader, so it is not quotable.
    if (hasRegister || hasLegacy) {
      toParas(rec.intro).forEach((p) => out.push(p))
      if (!hasRegister) {
        arr(rec.immediate).forEach((it) => out.push(it))
        arr(rec.shortTerm).forEach((it) => out.push(it))
        arr(rec.mediumTerm).forEach((it) => out.push(it))
      }
    }
    // 6.1, which the renderer guards on its own rows.
    const smp = obj(M.sampling)
    if (arr(smp.rows).length) toParas(smp.intro).forEach((p) => out.push(p))
    return out
  },

  limitations(M) {
    return [...arr(M.limitations)]
  },

  professional_review(M) {
    const r = obj(M.review)
    if (!M.review || !r.statement) return []
    return [r.statement]
  },

  parameter_background(M) {
    const r = obj(M.results)
    if (!arr(r.parameters).length) return []
    const out = []
    if (r.perParamIntro) out.push(r.perParamIntro)
    arr(r.parameters).forEach((param) => {
      // `splitLead` may render a line as a bold lead plus a remainder; the two
      // runs concatenate back to this exact line, so the line is the block.
      arr(obj(param).body).forEach((line) => out.push(line))
    })
    return out
  },
}

/**
 * A block's identity is its content.
 *
 * Not its position: a paragraph that moves within a section is the same
 * paragraph, and two identical blocks in one section ARE the same string —
 * which is precisely the case quote resolution must refuse to guess between,
 * so making them share an id keeps that ambiguity visible rather than hiding
 * it behind an index.
 */
export const blockId = (text) => `blk-${fnv1aHex(String(text))}`

/**
 * The report's quotable prose, by section.
 *
 * Pure and synchronous. Returns every declared section, including empty ones,
 * so a consumer can tell "this report has no limitations" from "this section
 * id is not a thing" without a second lookup.
 *
 * @param {object} model the assembled render model, AI sections already folded
 *   in — the SAME object the export renders, never live draft state
 * @returns {Array<{section_id:string, section_name:string,
 *   blocks: Array<{id:string, text:string}>, text:string}>}
 */
export function collectReportText(model) {
  const M = obj(model)
  return REPORT_SECTIONS.map(({ id, name }) => {
    const raw = COLLECTORS[id](M) || []
    const blocks = []
    const seen = new Set()
    for (const value of raw) {
      const text = block(value)
      if (!text) continue
      const bid = blockId(text)
      // One entry per distinct string. A repeated block is the same block, and
      // listing it twice would offer a reviewer two handles on one sentence.
      if (seen.has(bid)) continue
      seen.add(bid)
      blocks.push(Object.freeze({ id: bid, text }))
    }
    return Object.freeze({
      section_id: id,
      section_name: name,
      blocks: Object.freeze(blocks),
      text: blocks.map((b) => b.text).join(BLOCK_SEPARATOR),
    })
  })
}

/** The sections that actually carry prose, for a caller that wants only those. */
export function nonEmptySections(sections) {
  return arr(sections).filter((s) => obj(s).text)
}

/**
 * A fingerprint of the report's prose as collected.
 *
 * Distinct from `fingerprintPackage` in `evidencePackage.js`, which excludes
 * `sections` by construction and therefore cannot see the text at all. This
 * one exists to answer a different question: is the prose a semantic review
 * was performed against still the prose the report carries? Same hash
 * function as the rest of the family, so the two read alike in a log.
 *
 * Section ids are included, not just text, so moving a paragraph between
 * sections changes the fingerprint. It is a different document when it does.
 */
export function reportTextFingerprint(sections) {
  const parts = arr(sections).map((s) => `${obj(s).section_id} ${obj(s).text || ''}`)
  return fnv1aHex(`${REPORT_TEXT_VERSION}${parts.join('')}`)
}

export const __test = { COLLECTORS, block, toParas }
