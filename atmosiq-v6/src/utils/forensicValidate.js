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
 *     actually produced FOR THIS PATTERN, in THAT UNIT, at the precision the
 *     model wrote it. Rounding passes; alteration does not.
 *  5. LANGUAGE.   The shared banned-language scan, unchanged, plus the
 *     forensics layer. A hit rejects the interpretation.
 *
 * ── Everything is scoped to the pattern being interpreted ──────────────
 * Gates 2 and 4 both resolve against `evidenceScopeForPattern`, not against the
 * session. The bundle registry answers "is this id real"; it cannot answer "is
 * this id anything to do with the claim". Those came apart immediately: a CO₂
 * interpretation could cite a genuine TVOC event, and a genuine PM figure from
 * a parameter the pattern never touches could support a number in its prose.
 * Both pass a registry check and both are unfounded.
 *
 * A rejected interpretation lands in `rejected` with its reason rather than
 * vanishing, because a proposal silently dropped is indistinguishable from one
 * the model never made — and for the same reason the RESULT distinguishes a
 * model that validly raised nothing from one whose every proposal was thrown
 * away. See `INTERPRETATION_STATUSES`.
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
  'evidence_not_on_pattern', 'unknown_context_gap_id', 'context_gap_not_on_pattern',
  'unsupported_figure', 'prohibited_language',
])

/**
 * What became of a model response, as four distinguishable outcomes.
 *
 * The first cut collapsed two of them. `ok` meant "the envelope parsed", so a
 * response whose every interpretation was rejected returned `ok: true` with an
 * empty list, and the record it produced was indistinguishable from a model
 * that had looked at the session and correctly found nothing worth raising.
 * Those are opposite facts about the analysis: one says the deterministic layer
 * surfaced nothing a reader needs, the other says the model tried and the gate
 * threw all of it away. Storing them the same way hides a failing model behind
 * a quiet panel, which is the shape of every silent-fallback defect in this
 * codebase.
 *
 *   validated — at least one interpretation survived, nothing was rejected
 *   partial   — at least one survived AND at least one was rejected
 *   empty     — the model validly returned no interpretations at all
 *   rejected  — the model attempted interpretations and none survived, or the
 *               envelope itself failed
 */
export const INTERPRETATION_STATUSES = Object.freeze(['validated', 'partial', 'empty', 'rejected'])

/** The status implied by an accepted/rejected count. */
export function interpretationStatus(accepted, rejected) {
  if (accepted > 0) return rejected > 0 ? 'partial' : 'validated'
  return rejected > 0 ? 'rejected' : 'empty'
}

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
 * Units a forensic figure can carry, and what each spelling means.
 *
 * A number WITHOUT one is not checked, for the reason `narrativeAudit` records:
 * "three of four days" and "roughly twice the overnight level" are arithmetic
 * over the bundle, and the prompt asks for exactly that kind of sentence. A
 * rule that flagged them would be switched off, after which nothing would be
 * checked at all.
 *
 * A number WITH one is checked against a supported value IN THE SAME UNIT.
 * Storing bare magnitudes — which is what the first cut of this gate did — lets
 * a real 35.1 µg/m³ reading support model prose saying "35.1 ppm", "35.1 %" or
 * "35.1 °F". Those are three different claims about three different quantities
 * and the record supports none of them. The magnitude agreeing is a coincidence
 * of arithmetic, not evidence.
 *
 * `unit` is the canonical token two spellings of one quantity share; `factor`
 * is how many canonical units one written unit is worth. Only DURATION converts
 * across spellings, and only because the seconds, minutes and hours of one
 * measured span are restatements of a single deterministic number — refusing
 * "about four hours" for a 14 340-second excursion would reject the most
 * natural sentence a reader wants.
 *
 * Nothing else converts, deliberately. ppm↔ppb and µg/m³↔mg/m³ are arithmetic
 * a reader could defend, but a model that writes the wrong one of the pair has
 * made a real error and this gate should catch it. °F↔°C is not even that: the
 * conversion is affine, and performing it here would make the validator the
 * author of a number nobody measured.
 */
const UNIT_SPELLINGS = [
  // Concentration.
  ['ppm', 'ppm', 1], ['ppb', 'ppb', 1],
  // Both micro signs — U+00B5 MICRO SIGN and U+03BC GREEK SMALL LETTER MU look
  // identical, arrive from different keyboards and copy-paste sources, and have
  // both been seen in this product's own instrument exports. Plus the ASCII
  // fallback and both cube spellings.
  ['µg/m³', 'ug/m3', 1], ['μg/m³', 'ug/m3', 1], ['ug/m³', 'ug/m3', 1],
  ['µg/m3', 'ug/m3', 1], ['μg/m3', 'ug/m3', 1], ['ug/m3', 'ug/m3', 1],
  ['mg/m³', 'mg/m3', 1], ['mg/m3', 'mg/m3', 1],
  ['%', '%', 1],
  // Temperature. Degree sign, masculine ordinal (what several fonts and CSV
  // exporters emit), and the spelled-out form. Matching is case-insensitive, so
  // `°F` and `°f` are the same token here.
  ['°f', 'degF', 1], ['ºf', 'degF', 1], ['degf', 'degF', 1], ['deg f', 'degF', 1],
  ['°c', 'degC', 1], ['ºc', 'degC', 1], ['degc', 'degC', 1], ['deg c', 'degC', 1],
  // Duration, canonicalized to seconds.
  ['seconds', 'duration', 1], ['second', 'duration', 1], ['sec', 'duration', 1], ['s', 'duration', 1],
  ['minutes', 'duration', 60], ['minute', 'duration', 60], ['min', 'duration', 60],
  ['hours', 'duration', 3600], ['hour', 'duration', 3600], ['hrs', 'duration', 3600], ['hr', 'duration', 3600], ['h', 'duration', 3600],
  ['days', 'duration', 86400], ['day', 'duration', 86400],
]

/** Written spelling (lowercased) → `{ unit, factor }`. */
const UNIT_BY_SPELLING = new Map(UNIT_SPELLINGS.map(([spelling, unit, factor]) => [spelling, { unit, factor }]))

/** Canonical unit tokens, exported so a test and the prompt can name them. */
export const CANONICAL_UNITS = Object.freeze([...new Set(UNIT_SPELLINGS.map(([, u]) => u))])

const UNIT_ALT = UNIT_SPELLINGS
  .map(([spelling]) => spelling)
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
const FIGURE_RE = new RegExp(String.raw`([-+]?\d[\d,]*(?:\.\d+)?)\s*(${UNIT_ALT})(?![A-Za-z0-9])`, 'gi')

/**
 * The canonical form of a unit as the DATA spells it.
 *
 * Instrument exports carry whatever the vendor wrote. An unrecognized unit is
 * kept as its own trimmed, lowercased token rather than discarded: it then
 * matches itself and nothing else, which is the correct behavior for a quantity
 * this module has no rule for.
 */
export function canonicalUnit(raw) {
  if (!isStr(raw)) return null
  const key = raw.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!key) return null
  const known = UNIT_BY_SPELLING.get(key)
  return known ? known.unit : key
}

const decimalsOf = (text) => {
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
const roundTo = (v, d) => {
  const f = 10 ** d
  return Math.round(v * f) / f
}

// Keys whose number is an INSTANT rather than a quantity. Nothing should
// restate one as a figure, and admitting them would let almost any large
// number through.
const INSTANT_KEYS = /^(t|startts|endts|peakat|maxat|minat|daystartts|createdat)$/i
// Keys already denominated in seconds.
const SECONDS_KEYS = /^(durationsec|timeabovesec|timeoutsidesec|longestgapsec|intervalsec|overlapslacksec)$/i
// Keys denominated in whole days — a cycle observed over four days supports
// "four days", and that is the same quantity, not a new one.
const DAYS_KEYS = /^(daysobserved|daysagreeing|daysrequired)$/i
// Keys that are already percentages whatever the parameter is measured in.
const PERCENT_KEYS = /^(pctabove|pctinband|coveragepct)$/i
// Dimensionless. A correlation coefficient, a count of things, a clock hour and
// a timezone offset are not quantities in the parameter's unit, and letting
// them inherit it would have `r = 0.82` support "0.82 ppm".
const COUNT_KEYS = /^(n|expected|gapcount|samples|pairedsamples|windows|comparisonzones|zonescompared|zoneswithoutcoverage|outdooreventsinwindow|peakhour|utcoffsetmin|r)$/i

/**
 * Walk a block of the bundle, emitting every number with the unit it carries.
 *
 * `unit` is the block's own unit — an event and a parameter block both declare
 * one — and is what a number falls back to when no key rule claims it.
 */
function collectFigures(node, ctx, out, key) {
  if (Array.isArray(node)) { node.forEach((n) => collectFigures(n, ctx, out, key)); return }
  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([k, v]) => collectFigures(v, ctx, out, k))
    return
  }
  if (!isNum(node)) return
  const k = String(key || '')
  if (INSTANT_KEYS.test(k)) return
  const push = (value, unit) => out.push({ value, unit, sourceId: ctx.sourceId || null })
  if (SECONDS_KEYS.test(k)) push(node, 'duration')
  else if (DAYS_KEYS.test(k)) push(node * 86400, 'duration')
  else if (PERCENT_KEYS.test(k)) push(node, '%')
  else if (COUNT_KEYS.test(k)) push(node, null)
  else push(node, ctx.unit ?? null)
}

/** The unit the scoped parameter blocks agree on, or null when they do not. */
function agreedUnit(parameters) {
  const units = new Set(arr(parameters).map((p) => canonicalUnit(obj(p).unit)))
  return units.size === 1 ? [...units][0] : null
}

/** Figures from one dataset block, restricted to the parameters in scope. */
function datasetFigures(dataset, params, out) {
  const d = obj(dataset)
  const ctx = { unit: null, sourceId: d.id || null }
  const cov = obj(d.coverage)
  Object.keys(cov).forEach((p) => { if (!params || params.has(p)) collectFigures(cov[p], ctx, out, 'coverage') })
  collectFigures(d.intervalSec, ctx, out, 'intervalSec')
}

/**
 * Every figure the deterministic layer produced for this bundle, with its unit.
 *
 * The whole-session projection. The gate itself uses the PATTERN-SCOPED one —
 * see `evidenceScopeForPattern` — because a number that is real somewhere in
 * the session is not thereby evidence for the interpretation citing it.
 */
export function supportedFigures(bundle) {
  const b = obj(bundle)
  const out = []
  const paramsByDataset = new Map()
  arr(b.parameters).forEach((p) => {
    const o = obj(p)
    collectFigures(o.stats, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, out, 'stats')
    collectFigures(o.reference, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, out, 'reference')
    if (!paramsByDataset.has(o.datasetId)) paramsByDataset.set(o.datasetId, new Set())
    paramsByDataset.get(o.datasetId).add(o.param)
  })
  arr(b.events).forEach((e) => {
    const o = obj(e)
    collectFigures(o, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, out, 'event')
  })
  arr(b.patterns).forEach((p) => {
    const o = obj(p)
    const scoped = arr(b.parameters).filter((q) => arr(o.datasetIds).includes(obj(q).datasetId) && arr(o.params).includes(obj(q).param))
    collectFigures(o.summary, { unit: agreedUnit(scoped), sourceId: o.id || null }, out, 'summary')
  })
  arr(b.datasets).forEach((d) => datasetFigures(d, paramsByDataset.get(obj(d).id) || null, out))
  collectFigures(obj(b.context).available, { unit: null, sourceId: 'context' }, out, 'available')
  return out
}

/**
 * Exactly which evidence may support an interpretation of ONE pattern.
 *
 * Without this the gate resolves ids against the whole registry, so a CO₂
 * interpretation could cite a perfectly real TVOC event and pass — and a
 * perfectly real PM figure from a parameter this pattern never touches could
 * support a number in its prose. Both are the same defect: a claim checked
 * against the session rather than against the thing it is a claim about.
 *
 * The projection is deterministic and reads only what the detector already
 * declared — the pattern's own datasets, parameters, member events, annotations
 * and context gaps. It never re-derives membership, for the reason
 * `bundleEvidence` states: a validator that rebuilt the analysis to decide what
 * belongs would be a second opinion about the evidence, and the two could
 * disagree.
 *
 * @param {object} bundle
 * @param {string} patternId
 * @returns {{found:boolean, patternId:string|null, pattern:object|null, ids:Set<string>,
 *   contextGapIds:Set<string>, datasetIds:Set<string>, params:Set<string>,
 *   eventIds:Set<string>, parameterIds:Set<string>, annotationIds:Set<string>,
 *   figures:Array<{value:number, unit:string|null, sourceId:string|null}>}}
 */
export function evidenceScopeForPattern(bundle, patternId) {
  const b = obj(bundle)
  const pattern = arr(b.patterns).find((p) => obj(p).id === patternId) || null
  const blank = {
    found: false, patternId: isStr(patternId) ? patternId : null, pattern: null,
    ids: new Set(), contextGapIds: new Set(), datasetIds: new Set(), params: new Set(),
    eventIds: new Set(), parameterIds: new Set(), annotationIds: new Set(), figures: [],
  }
  if (!pattern) return blank

  const datasetIds = new Set(arr(pattern.datasetIds).filter(isStr))
  const params = new Set(arr(pattern.params).filter(isStr))
  const eventIds = new Set(arr(pattern.eventIds).filter(isStr))
  // Declared by the detector, not recovered by matching timestamps.
  const annotationIds = new Set(arr(obj(pattern.summary).annotationIds).filter(isStr))

  const parameters = arr(b.parameters).filter((p) => datasetIds.has(obj(p).datasetId) && params.has(obj(p).param))
  const events = arr(b.events).filter((e) => eventIds.has(obj(e).id))
  const datasets = arr(b.datasets).filter((d) => datasetIds.has(obj(d).id))
  const annotations = arr(obj(b.context).annotations).filter((a) => annotationIds.has(obj(a).id))
  const contextGapIds = new Set(arr(pattern.missingContext).map((m) => obj(m).id).filter(isStr))

  const figures = []
  parameters.forEach((p) => {
    const o = obj(p)
    collectFigures(o.stats, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, figures, 'stats')
    collectFigures(o.reference, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, figures, 'reference')
  })
  events.forEach((e) => {
    const o = obj(e)
    collectFigures(o, { unit: canonicalUnit(o.unit), sourceId: o.id || null }, figures, 'event')
  })
  collectFigures(pattern.summary, { unit: agreedUnit(parameters), sourceId: pattern.id || null }, figures, 'summary')
  datasets.forEach((d) => datasetFigures(d, params, figures))
  // An annotation carries no measurement — it is an instant and a label — so it
  // contributes an id to cite and no figure to quote.

  const parameterIds = new Set(parameters.map((p) => obj(p).id).filter(isStr))
  const ids = new Set([
    ...(isStr(pattern.id) ? [pattern.id] : []),
    ...eventIds, ...datasetIds, ...parameterIds,
    ...annotations.map((a) => obj(a).id).filter(isStr),
  ])

  return {
    found: true, patternId: pattern.id, pattern, ids, contextGapIds,
    datasetIds, params, eventIds, parameterIds,
    annotationIds: new Set(annotations.map((a) => obj(a).id).filter(isStr)),
    figures,
  }
}

/**
 * Figures in `text` that the supplied evidence cannot account for.
 *
 * A figure matches when a supported value CARRYING THE SAME UNIT, rounded to
 * the precision the model wrote, equals it. So a 1451.83 ppm reading may be
 * written "1452 ppm" or "1450 ppm" at zero decimals, but not "1500 ppm", and
 * not "1452 µg/m³".
 *
 * Sign is compared only when the model WROTE one. Prose routinely states a
 * magnitude and puts the direction in words — "a drop of 240 ppm" — and
 * demanding a signed match there would reject correct writing. But "-240 ppm"
 * is an explicit claim about direction, and a deterministic +240 does not
 * support it. A leading dash that follows a digit is a range ("400-500 ppm"),
 * not a sign, and is read as one.
 */
export function unsupportedFigures(text, supported) {
  const out = []
  const s = isStr(text) ? text : ''
  const pool = supported == null ? [] : [...supported]
  FIGURE_RE.lastIndex = 0
  let m
  while ((m = FIGURE_RE.exec(s)) !== null) {
    const written = m[1]
    const raw = written.replace(/,/g, '')
    const value = Number(raw)
    if (!isNum(value)) continue
    const spelled = UNIT_BY_SPELLING.get(m[2].replace(/\s+/g, ' ').trim().toLowerCase())
    // Matched the alternation, so it is always a known spelling; the guard is
    // for the case where the table and the pattern are edited out of step.
    if (!spelled) continue

    const prev = m.index > 0 ? s[m.index - 1] : ''
    const signWritten = /^[-+]/.test(written) && !/[\d.]/.test(prev)
    const d = decimalsOf(raw)
    const target = signWritten ? value : Math.abs(value)

    let ok = false
    for (const f of pool) {
      const e = obj(f)
      if (e.unit !== spelled.unit) continue
      if (!isNum(e.value)) continue
      const candidate = e.value / spelled.factor
      if (roundTo(signWritten ? candidate : Math.abs(candidate), d) === target) { ok = true; break }
    }
    // Quote it back exactly as the model wrote it, spacing included, so the
    // rejection detail can be searched for in the response it came from.
    if (!ok) out.push(m[0].trim())
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
 * @returns {{ok:boolean, status:string, interpretations:Array, rejected:Array,
 *   fingerprint:string|null}} `ok` is true unless the outcome is `rejected`;
 *   `status` is one of `INTERPRETATION_STATUSES`
 */
export function validateForensicOutput(raw, bundle, opts = {}) {
  const fingerprint = isStr(obj(bundle).fingerprint) ? bundle.fingerprint : null
  // An envelope failure is `rejected`, never `empty`: nothing about the model's
  // reading was established, so the record must not read as "found nothing".
  const refuse = (reason, detail) => ({
    ok: false, status: 'rejected', interpretations: [], fingerprint,
    rejected: [{ reason, ...(detail == null ? {} : { detail }) }],
  })

  if (!bundle || typeof bundle !== 'object' || !fingerprint) return refuse('no_bundle')
  if (opts.expectFingerprint && opts.expectFingerprint !== fingerprint) {
    return refuse('fingerprint_mismatch', `${opts.expectFingerprint} != ${fingerprint}`)
  }

  // Gate 1 — structure. Fail closed: an object that cannot be parsed is an
  // object that cannot be bounded.
  let parsed = raw
  if (isStr(raw)) {
    try { parsed = JSON.parse(raw) } catch { return refuse('unparseable_output') }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return refuse('malformed_output')
  if (!Array.isArray(parsed.interpretations)) {
    return refuse('malformed_output', 'interpretations must be an array')
  }

  const evidence = obj(bundle.evidence).patternIds ? bundle.evidence : bundleEvidence(bundle)
  const patternById = new Map(arr(bundle.patterns).map((p) => [p.id, p]))
  const knownIds = new Set([
    ...arr(evidence.eventIds), ...arr(evidence.patternIds), ...arr(evidence.datasetIds),
    ...arr(evidence.parameterIds), ...arr(evidence.annotationIds),
  ])
  const knownGaps = new Set(arr(evidence.contextGapIds))

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

    // Everything this interpretation is allowed to rest on. Resolving against
    // the whole registry instead would let a CO2 reading cite a real but
    // unrelated PM event and pass the gate.
    const scope = evidenceScopeForPattern(bundle, c.pattern_id)

    // Evidence ids, when cited, must resolve — and must resolve TO THIS PATTERN.
    // The two failures are reported separately because they are different
    // faults: the first is a model inventing an id, the second is a model
    // citing something real that has nothing to do with what it is claiming.
    const evidenceIds = arr(c.evidence_ids).filter(isStr)
    const mintedEvidence = evidenceIds.find((id) => !knownIds.has(id))
    if (mintedEvidence) { reject(rejected, item, 'unknown_evidence_id', mintedEvidence); continue }
    const foreignEvidence = evidenceIds.find((id) => !scope.ids.has(id))
    if (foreignEvidence) { reject(rejected, item, 'evidence_not_on_pattern', foreignEvidence); continue }

    // Context gaps must be real AND must belong to THIS pattern. A gap that is
    // real elsewhere in the session says nothing about this one, and the whole
    // point of the pattern-dependent design is that it is not a session-wide
    // checklist.
    const gapIds = arr(c.missing_context_ids).filter(isStr)
    const unknownGap = gapIds.find((id) => !knownGaps.has(id))
    if (unknownGap) { reject(rejected, item, 'unknown_context_gap_id', unknownGap); continue }
    const foreignGap = gapIds.find((id) => !scope.contextGapIds.has(id))
    if (foreignGap) { reject(rejected, item, 'context_gap_not_on_pattern', foreignGap); continue }

    // Gate 4 — arithmetic, over everything the model wrote, against the figures
    // available from THIS pattern's evidence and in the unit it was measured in.
    const prose = [title, interpretation, ...alternatives, ...reviews].join('\n')
    const bad = unsupportedFigures(prose, scope.figures)
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

  const status = interpretationStatus(interpretations.length, rejected.length)
  // `ok` now means "usable as it stands" rather than "the envelope parsed".
  // Wholly rejected output is not usable, and a caller that only reads `ok`
  // must not treat it as a clean, empty analysis.
  return { ok: status !== 'rejected', status, interpretations, rejected, fingerprint }
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

  // Prefer the validator's own verdict; derive it only for a caller that hand
  // built a result. `ok === false` alone can no longer distinguish a refused
  // envelope from a response whose every interpretation was thrown away, and
  // collapsing those into `empty` is exactly what this record must not do.
  const rejectedCodes = arr(validation.rejected).map((r) => obj(r).reason).filter(Boolean)
  const status = INTERPRETATION_STATUSES.includes(validation.status)
    ? validation.status
    : (validation.ok === false && !interpretations.length
      ? 'rejected'
      : interpretationStatus(interpretations.length, rejectedCount))

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
      reasons: rejectedCodes,
    },
  }
}
