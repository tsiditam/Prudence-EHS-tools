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
 * statistic, state a number at all, or reach a conclusion about cause,
 * compliance or health.
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
 *  4. DIGITS.     Prose carries no quantitative digits at all. The
 *     deterministic layer owns every number and the surface renders them on
 *     their own line; the model owns the reading beside them. See
 *     `proseDigits` for the four named forms that are not quantities.
 *  5. LANGUAGE.   The shared banned-language scan, unchanged, plus the
 *     forensics layer. A hit rejects the interpretation.
 *
 * ── Identity is scoped to the pattern being interpreted ────────────────
 * Gate 2 resolves against `evidenceScopeForPattern`, not against the session.
 * The bundle registry answers "is this id real"; it cannot answer "is this id
 * anything to do with the claim". Those came apart immediately: a CO₂
 * interpretation could cite a genuine TVOC event and pass a registry check.
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
  'digits_in_prose', 'prohibited_language',
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

const isStr = (v) => typeof v === 'string'
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** Trim, collapse whitespace, cap. Returns '' for anything that is not a string. */
const clean = (v, cap) => (isStr(v) ? v.replace(/\s+/g, ' ').trim().slice(0, cap) : '')

/** Keep only well-formed strings, capped in both length and count. */
const cleanList = (v, cap = MAX_ITEM_CHARS, max = MAX_LIST_ITEMS) =>
  arr(v).filter(isStr).map((x) => clean(x, cap)).filter(Boolean).slice(0, max)

// ── Digits ─────────────────────────────────────────────────────────────

/**
 * Every quantitative digit in `text`, quoted as written.
 *
 * ── The rule, and why it is this blunt ─────────────────────────────────
 * The model writes no numbers. Not a count of days, not a correlation
 * coefficient, not a concentration, not a duration, not a clock time. The
 * deterministic layer owns every figure, the surface renders them on their own
 * line beside the reading, and an interpretation that carries none cannot
 * restate one wrongly.
 *
 * Two earlier cuts tried to be cleverer and each was a hole. The first checked
 * only numbers carrying a unit, so "the correlation was 0.93" walked past it.
 * The second matched a bare number against every figure in the pattern's
 * scope, in any denomination — which meant a "4" was accepted whenever ANY
 * scoped quantity happened to equal four: days observed, zones compared, a gap
 * count. It could not tell which one the model meant, so it was not checking
 * the claim, only the digit. A rule that accepts a number because that
 * magnitude exists somewhere is a rule that accepts most small integers.
 *
 * Refusing digits outright is simpler and it is the guarantee the product
 * actually wants: deterministic layer owns numbers, model owns interpretation.
 * The cost lands on the contract, where it belongs — the prompt says so, gives
 * the wording to use instead, and a reading that states a quantity in words
 * ("on most of the recorded days", "roughly twice the overnight level") passes,
 * because words are not digits.
 *
 * ── The exemptions, each of which is not a quantity ────────────────────
 *   PM2.5 / CO2 / NO2 / S520 / MX1102   a digit glued to a letter before it is
 *                                       part of a NAME — a parameter, a
 *                                       standard's section, an instrument
 *   2026-03-02                          an ISO date is an instant, not a
 *                                       quantity; instants are excluded from
 *                                       the deterministic side too
 *   2nd / 3rd                           an ordinal
 *
 * Not exempt, deliberately: a clock time (the peak hour is the deterministic
 * layer's to state), a unit-bearing figure (same), and a numbered standard
 * designation such as "ASHRAE 62.1" — the prompt forbids naming one, this
 * analysis applies no criterion, and a gate that permitted what the prompt
 * forbids would be the writer and the gate disagreeing in the lenient
 * direction. If a designation is ever permitted, it is added to the prompt and
 * here in the same commit.
 *
 * @param {string} text
 * @returns {string[]} the offending tokens, in order, as the model wrote them
 */
export function proseDigits(text) {
  const out = []
  const s = isStr(text) ? text : ''
  // Priority order, so each digit run is classified once: an ISO date first,
  // then any numeric token with its optional sign and thousands separators.
  const re = /(\d{4}-\d{2}-\d{2})|([-+]?\d[\d,]*(?:\.\d+)?)/g
  let m
  while ((m = re.exec(s)) !== null) {
    if (m[1]) continue
    const before = m.index > 0 ? s[m.index - 1] : ''
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 3)
    if (/[A-Za-z]/.test(before)) continue          // glued to a name
    if (/^(?:st|nd|rd|th)\b/i.test(after)) continue // an ordinal
    out.push(m[0])
  }
  return out
}

/**
 * Exactly which evidence may support an interpretation of ONE pattern.
 *
 * Without this the gate resolves ids against the whole registry, so a CO₂
 * interpretation could cite a perfectly real TVOC event and pass: a claim
 * checked against the session rather than against the thing it is a claim
 * about.
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
 *   eventIds:Set<string>, parameterIds:Set<string>, annotationIds:Set<string>}}
 */
export function evidenceScopeForPattern(bundle, patternId) {
  const b = obj(bundle)
  const pattern = arr(b.patterns).find((p) => obj(p).id === patternId) || null
  const blank = {
    found: false, patternId: isStr(patternId) ? patternId : null, pattern: null,
    ids: new Set(), contextGapIds: new Set(), datasetIds: new Set(), params: new Set(),
    eventIds: new Set(), parameterIds: new Set(), annotationIds: new Set(),
  }
  if (!pattern) return blank

  const datasetIds = new Set(arr(pattern.datasetIds).filter(isStr))
  const params = new Set(arr(pattern.params).filter(isStr))
  const eventIds = new Set(arr(pattern.eventIds).filter(isStr))
  // Declared by the detector, not recovered by matching timestamps.
  const annotationIds = new Set(arr(obj(pattern.summary).annotationIds).filter(isStr))

  const parameters = arr(b.parameters).filter((p) => datasetIds.has(obj(p).datasetId) && params.has(obj(p).param))
  const annotations = arr(obj(b.context).annotations).filter((a) => annotationIds.has(obj(a).id))
  const contextGapIds = new Set(arr(pattern.missingContext).map((m) => obj(m).id).filter(isStr))

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
  }
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
/**
 * A validation result that refuses the whole output, with one reason.
 *
 * An envelope failure is `rejected`, never `empty`: nothing about the model's
 * reading was established, so the record must not read as "found nothing".
 * Exported because the handler parses the model's text server-side and cannot
 * ship the deterministic gate (see `src/engines/forensicInterpret.js`), so a
 * parse failure it reports has to become this same shape on the client — and
 * one function producing it means the two cannot drift.
 *
 * @param {object} bundle
 * @param {string} reason one of `REJECTION_REASONS`
 * @param {string} [detail]
 */
export function refuseForensicOutput(bundle, reason, detail) {
  const fingerprint = isStr(obj(bundle).fingerprint) ? bundle.fingerprint : null
  return {
    ok: false, status: 'rejected', interpretations: [], fingerprint,
    rejected: [{ reason: REJECTION_REASONS.includes(reason) ? reason : 'malformed_output', ...(detail == null ? {} : { detail }) }],
  }
}

export function validateForensicOutput(raw, bundle, opts = {}) {
  const fingerprint = isStr(obj(bundle).fingerprint) ? bundle.fingerprint : null
  const refuse = (reason, detail) => refuseForensicOutput(bundle, reason, detail)

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

    // Gate 4 — digits, over everything the model wrote. The deterministic
    // layer owns every number; the reading beside them owns none.
    const prose = [title, interpretation, ...alternatives, ...reviews].join('\n')
    const digits = proseDigits(prose)
    if (digits.length) { reject(rejected, item, 'digits_in_prose', digits.join(', ')); continue }

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
