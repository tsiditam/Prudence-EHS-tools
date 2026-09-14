/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The model-output contract, and the deterministic gate that enforces it.
 *
 * The model reads a ForensicAnalysisBundle and returns at most five
 * interpretations. It may PRIORITIZE, INTERPRET, offer ALTERNATIVES, name
 * MISSING CONTEXT and propose REVIEWS. It may not mint evidence, recompute a
 * statistic, state a number the deterministic layer did not produce, or reach a
 * conclusion about cause, compliance or health.
 *
 * Nothing here is a prompt. A prompt is a request; this is the part that holds
 * when the request is ignored — the same posture as the Phase 2 intake
 * envelope, and for the same reason: a guarantee that lives only in wording is
 * not a guarantee. Everything below is pure and runs with no network, so every
 * claim it makes is testable without calling a model at all.
 *
 * ── The gates ──────────────────────────────────────────────────────────
 *  1. STRUCTURE.  An output that is not the agreed shape is not partially
 *     trusted. It is refused whole, with a reason.
 *  2. IDENTITY.   Every id must already exist in `bundle.evidence`. The model
 *     never mints one. Resolution is a LOOKUP against the registry the bundle
 *     already built — a validator that re-ran detection to decide whether an id
 *     was real would be a second opinion about the evidence, and the two could
 *     disagree.
 *  3. BOUNDS.     At most five interpretations, one per pattern, with every
 *     string and list capped. A malformed list ITEM is dropped; a malformed
 *     required field rejects that interpretation. Nothing is guessed at.
 *  4. ARITHMETIC. A figure carrying a unit must be one the deterministic layer
 *     actually produced, at the precision the model wrote it. Rounding passes;
 *     alteration does not.
 *  5. LANGUAGE.   The shared banned-language scan, unchanged, plus the
 *     forensics layer. A hit rejects the interpretation.
 *
 * A rejected interpretation lands in `rejected` with its reason rather than
 * vanishing, because a proposal silently dropped is indistinguishable from one
 * the model never made.
 */

import { scanProseForBannedLanguage } from '../engine/report/cih-validation.js'
import { scanForensicLanguage } from '../constants/forensic-language.js'
import { bundleEvidence } from './forensicBundle.js'

/** Bumped when the interpretation record's shape changes. */
export const FORENSIC_INTERPRETATION_VERSION = 1

/** Interrupting an assessor is expensive; five is the whole budget. */
export const MAX_INTERPRETATIONS = 5

/**
 * How much review a pattern is worth — NOT how bad the building is.
 *
 * Deliberately about the reviewer's queue rather than the site's condition. A
 * vocabulary of `low / medium / high` would be a severity rating reached by a
 * model from a trace, which is the thing this whole design exists to prevent,
 * and the product removed its last site rating in engine v3.0.
 */
export const IMPORTANCE_VALUES = Object.freeze(['routine', 'worth_review', 'priority_review'])

export const MAX_TITLE_CHARS = 120
export const MAX_INTERPRETATION_CHARS = 900
export const MAX_ITEM_CHARS = 300
export const MAX_LIST_ITEMS = 5

/** Every reason this gate can refuse something. Frozen so a test can pin it. */
export const REJECTION_REASONS = Object.freeze([
  'unparseable_output', 'malformed_output', 'no_bundle', 'fingerprint_mismatch',
  'malformed_interpretation', 'missing_pattern_id', 'unknown_pattern_id',
  'duplicate_pattern', 'over_interpretation_limit', 'invalid_importance',
  'missing_title', 'missing_interpretation', 'unknown_evidence_id',
  'unknown_context_gap_id', 'context_gap_not_on_pattern', 'unsupported_figure',
  'prohibited_language',
])

const isNum = (v) => v != null && Number.isFinite(v)
const isStr = (v) => typeof v === 'string'
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** Trim, collapse whitespace, cap. Returns '' for anything that is not a string. */
const clean = (v, cap) => (isStr(v) ? v.replace(/\s+/g, ' ').trim().slice(0, cap) : '')

/** Keep only well-formed strings, capped in both length and count. */
const cleanList = (v, cap = MAX_ITEM_CHARS, max = MAX_LIST_ITEMS) =>
  arr(v).filter(isStr).map((x) => clean(x, cap)).filter(Boolean).slice(0, max)

// ── Arithmetic ─────────────────────────────────────────────────────────

/**
 * Units a forensic figure can carry.
 *
 * A number WITHOUT one is not checked, for the reason `narrativeAudit` records:
 * "three of four days" and "roughly twice the overnight level" are arithmetic
 * over the bundle, and the prompt asks for exactly that kind of sentence. A
 * rule that flagged them would be switched off, after which nothing would be
 * checked at all.
 */
const UNIT_FORMS = [
  'ppm', 'ppb', 'µg/m³', 'ug/m3', 'µg/m3', 'mg/m³', 'mg/m3',
  '°f', '°c', '%',
  'seconds', 'second', 'sec', 's',
  'minutes', 'minute', 'min',
  'hours', 'hour', 'hrs', 'hr', 'h',
  'days', 'day',
]
const UNIT_ALT = UNIT_FORMS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')
// The trailing guard is a lookahead, NOT `\b`. A word boundary after a unit
// ending in a non-word character — `µg/m³`, `%` — can never match, because
// there is no word character on either side of that position. With `\b` this
// gate silently ignored every percentage and every mass concentration in the
// model's prose while appearing to work, since `ppm` and `°F` end in letters
// and passed. The lookahead asks the real question: is the unit the end of the
// token, rather than the start of a longer word like "samples"?
const FIGURE_RE = new RegExp(String.raw`(-?\d[\d,]*(?:\.\d+)?)\s*(${UNIT_ALT})(?![A-Za-z0-9])`, 'gi')

const decimalsOf = (text) => {
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
const roundTo = (v, d) => {
  const f = 10 ** d
  return Math.round(v * f) / f
}

/**
 * Every number the deterministic layer actually produced for this bundle.
 *
 * Durations also contribute their minute, hour and day equivalents: the same
 * quantity in a different unit is restatement, not invention, and refusing it
 * would reject the most natural sentence a reader wants ("elevated for about
 * four hours").
 */
export function supportedFigures(bundle) {
  const out = new Set()
  const add = (v) => { if (isNum(v)) out.add(Math.abs(v)) }
  const addDuration = (sec) => {
    if (!isNum(sec)) return
    add(sec); add(sec / 60); add(sec / 3600); add(sec / 86400)
  }

  const walk = (node, key) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, key))
    if (node && typeof node === 'object') {
      return Object.entries(node).forEach(([k, v]) => walk(v, k))
    }
    if (!isNum(node)) return
    if (/durationsec|timeabovesec|timeoutsidesec|longestgapsec/i.test(String(key))) addDuration(node)
    // Timestamps are instants, not quantities; nothing should restate one as a
    // figure, and admitting them would let almost any large number through.
    else if (!/^(t|startts|endts|peakat|maxat|minat|daystartts|createdat)$/i.test(String(key))) add(node)
  }

  walk(obj(bundle).events, 'events')
  walk(obj(bundle).patterns, 'patterns')
  walk(obj(bundle).parameters, 'parameters')
  walk(obj(obj(bundle).context).available, 'available')
  return out
}

/**
 * Figures in `text` that the bundle cannot account for.
 *
 * A figure matches when some supported value, rounded to the precision the
 * model wrote, equals it. So 1451.83 may be written "1452 ppm" or "1450 ppm"
 * at zero decimals but not "1500 ppm".
 */
export function unsupportedFigures(text, supported) {
  const out = []
  const s = isStr(text) ? text : ''
  FIGURE_RE.lastIndex = 0
  let m
  while ((m = FIGURE_RE.exec(s)) !== null) {
    const raw = m[1].replace(/,/g, '')
    const value = Number(raw)
    if (!isNum(value)) continue
    const d = decimalsOf(raw)
    const target = Math.abs(value)
    let ok = false
    for (const v of supported) {
      if (roundTo(v, d) === target) { ok = true; break }
    }
    if (!ok) out.push(`${m[1]} ${m[2]}`.trim())
  }
  return out
}

// ── Language ───────────────────────────────────────────────────────────

/**
 * The shared scan plus the forensics layer.
 *
 * The shared one runs FIRST and is untouched — it is the liability floor every
 * report path already clears. The forensics layer only adds.
 */
export function scanInterpretationLanguage(text) {
  const s = isStr(text) ? text : ''
  if (!s) return []
  const shared = scanProseForBannedLanguage(s).map((h) => ({ ...h, layer: 'shared' }))
  const forensic = scanForensicLanguage(s).map((h) => ({ ...h, layer: 'forensic' }))
  return [...shared, ...forensic]
}

// ── The gate ───────────────────────────────────────────────────────────

const reject = (list, item, reason, detail) => {
  list.push({ ...item, reason, ...(detail == null ? {} : { detail }) })
}

/**
 * Validate a model's forensic output against the bundle it was given.
 *
 * @param {object|string} raw what the model returned
 * @param {object} bundle the ForensicAnalysisBundle it was built from
 * @param {object} [opts]
 * @param {string} [opts.expectFingerprint] refuse unless the bundle still
 *   carries this fingerprint — the guard against validating an answer about a
 *   session that has since changed
 * @returns {{ok:boolean, interpretations:Array, rejected:Array, fingerprint:string|null}}
 */
export function validateForensicOutput(raw, bundle, opts = {}) {
  const fingerprint = isStr(obj(bundle).fingerprint) ? bundle.fingerprint : null
  const empty = { ok: false, interpretations: [], rejected: [], fingerprint }

  if (!bundle || typeof bundle !== 'object' || !fingerprint) {
    return { ...empty, rejected: [{ reason: 'no_bundle' }] }
  }
  if (opts.expectFingerprint && opts.expectFingerprint !== fingerprint) {
    return { ...empty, rejected: [{ reason: 'fingerprint_mismatch', detail: `${opts.expectFingerprint} != ${fingerprint}` }] }
  }

  // Gate 1 — structure. Fail closed: an object that cannot be parsed is an
  // object that cannot be bounded.
  let parsed = raw
  if (isStr(raw)) {
    try { parsed = JSON.parse(raw) } catch { return { ...empty, rejected: [{ reason: 'unparseable_output' }] } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...empty, rejected: [{ reason: 'malformed_output' }] }
  }
  if (!Array.isArray(parsed.interpretations)) {
    return { ...empty, rejected: [{ reason: 'malformed_output', detail: 'interpretations must be an array' }] }
  }

  const evidence = obj(bundle.evidence).patternIds ? bundle.evidence : bundleEvidence(bundle)
  const patternById = new Map(arr(bundle.patterns).map((p) => [p.id, p]))
  const knownIds = new Set([
    ...arr(evidence.eventIds), ...arr(evidence.patternIds), ...arr(evidence.datasetIds),
    ...arr(evidence.parameterIds), ...arr(evidence.annotationIds),
  ])
  const knownGaps = new Set(arr(evidence.contextGapIds))
  const supported = supportedFigures(bundle)

  const interpretations = []
  const rejected = []
  const seenPatterns = new Set()

  for (const candidate of parsed.interpretations) {
    const c = obj(candidate)
    const item = { pattern_id: isStr(c.pattern_id) ? c.pattern_id : null }

    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      reject(rejected, item, 'malformed_interpretation'); continue
    }
    // Gate 2 — identity. The pattern must be one the deterministic layer found.
    if (!isStr(c.pattern_id) || !c.pattern_id) { reject(rejected, item, 'missing_pattern_id'); continue }
    if (!patternById.has(c.pattern_id)) { reject(rejected, item, 'unknown_pattern_id'); continue }
    if (seenPatterns.has(c.pattern_id)) { reject(rejected, item, 'duplicate_pattern'); continue }

    // Gate 3 — bounds. Required scalars must be present and well formed.
    const title = clean(c.title, MAX_TITLE_CHARS)
    if (!title) { reject(rejected, item, 'missing_title'); continue }
    const interpretation = clean(c.interpretation, MAX_INTERPRETATION_CHARS)
    if (!interpretation) { reject(rejected, item, 'missing_interpretation'); continue }
    if (!IMPORTANCE_VALUES.includes(c.importance)) {
      reject(rejected, item, 'invalid_importance', String(c.importance)); continue
    }

    // Malformed LIST ITEMS are dropped rather than rejecting the whole entry —
    // one bad string in a list of alternatives is not a reason to lose the
    // interpretation, and dropping is not guessing.
    const alternatives = cleanList(c.alternative_explanations)
    const reviews = cleanList(c.recommended_reviews)

    // Evidence ids, when cited, must resolve. Never minted.
    const evidenceIds = arr(c.evidence_ids).filter(isStr)
    const badEvidence = evidenceIds.find((id) => !knownIds.has(id))
    if (badEvidence) { reject(rejected, item, 'unknown_evidence_id', badEvidence); continue }

    // Context gaps must be real AND must belong to THIS pattern. A gap that is
    // real elsewhere in the session says nothing about this one, and the whole
    // point of the pattern-dependent design is that it is not a session-wide
    // checklist.
    const gapIds = arr(c.missing_context_ids).filter(isStr)
    const unknownGap = gapIds.find((id) => !knownGaps.has(id))
    if (unknownGap) { reject(rejected, item, 'unknown_context_gap_id', unknownGap); continue }
    const own = new Set(arr(patternById.get(c.pattern_id).missingContext).map((m) => m.id))
    const foreignGap = gapIds.find((id) => !own.has(id))
    if (foreignGap) { reject(rejected, item, 'context_gap_not_on_pattern', foreignGap); continue }

    // Gate 4 — arithmetic, over everything the model wrote.
    const prose = [title, interpretation, ...alternatives, ...reviews].join('\n')
    const bad = unsupportedFigures(prose, supported)
    if (bad.length) { reject(rejected, item, 'unsupported_figure', bad.join(', ')); continue }

    // Gate 5 — language.
    const hits = scanInterpretationLanguage(prose)
    if (hits.length) {
      reject(rejected, item, 'prohibited_language', hits.map((h) => `${h.layer}:${h.term}`).join(', '))
      continue
    }

    if (interpretations.length >= MAX_INTERPRETATIONS) {
      reject(rejected, item, 'over_interpretation_limit'); continue
    }

    seenPatterns.add(c.pattern_id)
    interpretations.push({
      pattern_id: c.pattern_id,
      title,
      importance: c.importance,
      interpretation,
      alternative_explanations: alternatives,
      missing_context_ids: gapIds,
      recommended_reviews: reviews,
      report_candidate: c.report_candidate === true,
      evidence_ids: evidenceIds,
    })
  }

  return { ok: true, interpretations, rejected, fingerprint }
}

/**
 * The persisted interpretation record.
 *
 * Stored separately from the deterministic analysis and from the assessor's
 * review, so the three can be reasoned about independently: the analysis is a
 * fact about the data, this is a model's reading of it, and acceptance is a
 * person's decision about that reading. It carries the fingerprint of the
 * inputs it was produced from, which is what `forensicFreshness` compares.
 *
 * Every field is optional because every field is read defensively — a record
 * built from a missing bundle or a missing validation result is a record with
 * a null fingerprint and an `empty` status, which is the honest description of
 * that situation and not an error to throw. The JSDoc says so rather than
 * declaring a contract the body does not enforce.
 *
 * @param {object} [input]
 * @param {object} [input.bundle] result of `buildForensicBundle`
 * @param {object} [input.validation] result of `validateForensicOutput`
 * @param {object} [input.model] `{ provider, name, version }`
 * @param {string} [input.generatedAt] ISO
 */
export function buildForensicInterpretationRecord(input = {}) {
  const bundle = obj(input.bundle)
  const validation = obj(input.validation)
  const model = obj(input.model)
  const interpretations = arr(validation.interpretations)
  const rejectedCount = arr(validation.rejected).length

  const status = validation.ok === false
    ? 'rejected'
    : (interpretations.length ? 'validated' : 'empty')

  return {
    version: FORENSIC_INTERPRETATION_VERSION,
    forensicSchemaVersion: bundle.schemaVersion ?? null,
    // The inputs this reading is about. Anything else makes it stale.
    fingerprint: isStr(bundle.fingerprint) ? bundle.fingerprint : null,
    generatedAt: isStr(input.generatedAt) ? input.generatedAt : new Date().toISOString(),
    model: {
      provider: isStr(model.provider) ? model.provider : null,
      name: isStr(model.name) ? model.name : null,
      version: isStr(model.version) ? model.version : null,
    },
    interpretations,
    validation: {
      status,
      accepted: interpretations.length,
      rejected: rejectedCount,
      // Reasons only — the rejected content itself is the model's, and storing
      // prose that failed a language gate onto the record would put it exactly
      // where the gate exists to keep it out of.
      reasons: arr(validation.rejected).map((r) => obj(r).reason).filter(Boolean),
    },
  }
}
