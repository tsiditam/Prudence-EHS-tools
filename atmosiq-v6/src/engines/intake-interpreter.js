/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Phase 2 — what a model is allowed to return after reading free text.
 *
 * ── The job, and only the job ──────────────────────────────────────────
 * An assessor types "musty odor near the west wall, usually worse after
 * rain". No predicate catches "after rain"; no engine reads free text. The
 * model's entire job is to map that sentence onto things the app ALREADY
 * has — a structured field it can offer to fill, and approved questions it
 * can offer to ask.
 *
 * It does not decide what is missing. `zoneGaps` does, from
 * `sufficiency.js` and `defensibility-gaps.js`, and it did so before any
 * model ran. It does not decide what a reading means; the criterion registry
 * does. It does not write anything; the assessor accepts or rejects.
 *
 * ── Why the envelope is here and not in the prompt ─────────────────────
 * A prompt is a request. This is the part that holds when the request is
 * ignored — a model that invents a field, quotes text nobody typed, or asks
 * a question the catalog does not contain gets its output dropped with a
 * reason, not repaired. Everything below is deterministic and runs with no
 * network, so the guarantees are testable without calling a model at all.
 *
 * ── The four gates ─────────────────────────────────────────────────────
 * 1. ELIGIBILITY. A question may be proposed only if the walkthrough itself
 *    would ask it right now: it is in the approved catalog, its `cond` says
 *    it is visible, and it is unanswered. The model cannot decide a question
 *    is relevant that the deterministic layer has already ruled out.
 *
 * 2. WRITABILITY. A fact is validated by `validateObservation`, the same
 *    gate Jasper's `record_zone_observation` already uses — so the option
 *    list comes from `questions.js` and the field must be one an engine
 *    reads. Fields deliberately excluded there stay excluded here.
 *
 * 3. ATTESTATION, in two parts, because the first alone is not enough.
 *    The `quote` must appear VERBATIM in the assessor's own text — and then
 *    the VALUE must be named in that quote. Quote attestation only proves a
 *    model cited real text; "there is a musty odor in here" is a real
 *    sentence, and `op = 'Strong / overpowering'` quoting it is a severity
 *    nobody gave. A number must be present in digits or in words, an option
 *    must be named in the vocabulary `option-aliases.js` derives from the
 *    schema, and every member of a multi-select stands on its own words.
 *
 * 4. NON-OVERWRITE. A field that already holds a value is never proposed.
 *    The assessor's own entry is not something to re-litigate from prose.
 *
 * Anything failing a gate lands in `rejected` with a reason rather than
 * vanishing, because a proposal silently dropped is indistinguishable from
 * a model that never made it — and the whole point of the spike is to find
 * out which is happening.
 */

import { validateObservation, getObservableField } from '../constants/observable-fields.js'
import { resolveOptions } from '../constants/option-aliases.js'
import { evalCondition } from '../utils/conditions.js'
import { Q_ZONE } from '../constants/questions.js'
import { zoneGaps } from './zone-gaps.js'

/**
 * SCOPE — the ZONE WALKTHROUGH only.
 *
 * `Q_ZONE` is the catalog, deliberately and explicitly. The pre-survey and
 * building questionnaires are a different interview: they are answered at a
 * desk from records rather than standing in a room, their fields are setup
 * rather than observation, and several are excluded from the writable
 * catalog for that reason. Widening this constant is a product decision, not
 * a refactor — `intake-interpreter.test.ts` fails if another questionnaire
 * appears here.
 */
const CATALOG = Q_ZONE

/** Interrupting a walkthrough is expensive; these are deliberately small. */
export const MAX_FACTS = 3
export const MAX_QUESTIONS = 3

/**
 * Input types that are a question an assessor can answer in place.
 *
 * The composite editors — the sensor grid, the source cards, the checks
 * list, the logger record — are screens, not questions. Proposing "answer
 * the logger deployment" as a one-line follow-up misdescribes what the
 * assessor would have to do.
 */
const SIMPLE_TYPES = new Set(['ch', 'multi', 'num', 'text', 'ta', 'time', 'date', 'combo'])

const hasValue = (v) => {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Whitespace- and case-insensitive containment, for quote attestation. */
const flatten = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s ]+/g, ' ').trim()

// Enough to cover a spoken count in a field note. A number a model cannot
// evidence in the assessor's own words is refused, so this list being finite
// fails in the safe direction.
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100,
}

/** Regex-escape an interpolated literal. A decimal point is not a wildcard. */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Is this number actually present in the words the assessor wrote? */
function numberAttested(value, quote) {
  const n = Number(value)
  if (!Number.isFinite(n)) return false
  const q = flatten(quote)
  // Digits, with or without a decimal tail the model may have normalized.
  // The value is ESCAPED: unescaped, `18.5` would match "18x5", so a quote
  // containing a different number entirely would attest the proposal.
  if (new RegExp(`(^|[^0-9.])${escapeRe(n)}([^0-9]|$)`).test(q)) return true
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (num === n && new RegExp(`\\b${escapeRe(word)}\\b`).test(q)) return true
  }
  return false
}

/**
 * Which options the quote supports — asked of the FIELD, not the proposal.
 *
 * The gap this closes: a real quote proves the model cited real text, not
 * that the value it picked was stated. "There's a musty odor in here" is a
 * true sentence, and `op = 'Strong / overpowering'` quoting it is a severity
 * the assessor never gave. The quote passes; the claim is invented.
 *
 * Asking "does this option have a matching alias?" cannot close it either,
 * because the aliases overlap: "No complaints were reported" contains the
 * word `complaints`. `resolveOptions` reads the words once and returns every
 * option they support, settling boundaries, specificity and negation in
 * `option-aliases.js` — application data, derived from the schema, which a
 * model cannot widen.
 */

/**
 * Value attestation, one rule per field KIND.
 *
 * Exhaustive by construction. A kind with no rule here is refused outright
 * rather than waved through, and `intake-interpreter.test.ts` fails if the
 * writable catalog grows a kind this map does not cover. Fail-closed is the
 * right default because the alternative fails silently: an un-gated kind is
 * indistinguishable from an attested one when you read the output.
 *
 * There is deliberately NO free-text rule. Every writable field resolves to
 * number, choice or multi today (`observable-fields.js`), so a rule for a
 * free-text field would be unreachable code validated by nothing — the shape
 * this codebase keeps finding embalmed. Refusing the kind is also STRICTER
 * than the extractive rule such a field would need: no generated prose can
 * enter the record at all. When a free-text field becomes writable the guard
 * test fails, and the rule gets written against a field that exists.
 */
export const ATTESTERS = Object.freeze({
  number: (fieldId, value, quote) => (numberAttested(value, quote) ? null : { reason: 'number_not_stated' }),
  // A single-select field holds ONE value, so two supported options are a
  // contradiction the words do not settle — and letting the model break the
  // tie is exactly the authority this envelope withholds. Fail closed; the
  // assessor gets asked the structured question, which is the better outcome
  // anyway.
  choice: (fieldId, value, quote) => {
    const supported = resolveOptions(fieldId, quote)
    if (supported.length > 1) return { reason: 'ambiguous_attestation', detail: supported.join(' | ') }
    return supported.includes(value) ? null : { reason: 'value_not_stated' }
  },
  // A multi-select HOLDS a set, so several supported options are the normal
  // case and not an ambiguity. Each proposed member still stands on its own
  // words: one attested member does not carry the rest of the list in with it.
  multi: (fieldId, value, quote) => {
    const supported = new Set(resolveOptions(fieldId, quote))
    const unattested = (Array.isArray(value) ? value : [value]).filter((opt) => !supported.has(opt))
    return unattested.length ? { reason: 'value_not_stated', detail: unattested.join(', ') } : null
  },
})

/**
 * The questions the walkthrough would ask in this zone right now.
 *
 * This IS the deterministic support for question selection. A question is
 * eligible when the catalog contains it, its condition makes it visible, and
 * it has no answer — the same three facts the walkthrough itself uses to
 * decide what to render. The model chooses among these; it does not add to
 * them, and it cannot revive one the condition has ruled out.
 *
 * `gaps` rides along so a caller can prioritize: an eligible question that a
 * deterministic gap already names is worth more than one that is merely
 * unanswered.
 */
export function eligibleQuestions(assessment, zoneIndex) {
  const zone = ((assessment && assessment.zones) || [])[zoneIndex]
  if (!zone) return []
  const gapLabels = new Set(zoneGaps(assessment, zoneIndex).map((g) => g.label))
  return eligibleInZone(zone).map((q) => ({
    ...q,
    // A deterministic gap naming this field is a stronger reason to ask
    // than the model's reading of a sentence.
    deterministic: gapLabels.has(q.question)
      || [...gapLabels].some((l) => q.question && String(q.question).includes(l)),
  }))
}

/**
 * The same eligibility, from the zone record ALONE.
 *
 * Gate 1 needs three facts and all three live on the zone: the catalog
 * contains the question, its condition makes it visible, and it has no
 * answer. The gap join above is PRIORITIZATION, not permission — so a caller
 * holding only the zone (Jasper's tool dispatcher, which receives
 * `current_zone` and not the assessment) runs the identical gate and simply
 * cannot rank. Splitting it this way is what keeps there being one gate
 * rather than a second, laxer copy grown server-side.
 */
export function eligibleInZone(zone) {
  if (!zone || typeof zone !== 'object') return []
  return CATALOG
    .filter((q) => SIMPLE_TYPES.has(q.t))
    .filter((q) => evalCondition(q.cond, zone))
    .filter((q) => !hasValue(zone[q.id]))
    .map((q) => ({ id: q.id, question: q.q, type: q.t }))
}

/**
 * Reader-facing text for a rejection, addressed to the MODEL.
 *
 * `validateObservation` already answers a bad value with a correctable
 * message naming the allowed values, and the attestation gates have to do
 * the same or they read as an outage. "Rejected" with no reason is what a
 * model retries blindly; a reason it can act on is what makes it ask the
 * assessor instead, which is the behavior this whole envelope is for.
 */
const REJECTION_MESSAGE = {
  missing_quote:
    'A proposed observation must carry `quote` — the assessor\'s own words that state this value. '
    + 'Nothing is recorded from an unquoted inference.',
  quote_not_in_text:
    'That quote does not appear in anything the assessor wrote in this conversation. '
    + 'Quote them verbatim, or ask rather than recording.',
  field_already_answered:
    'That field already holds a value the assessor entered. Do not re-litigate it from prose — '
    + 'if you believe it is wrong, say so and let them change it.',
  number_not_stated:
    'The number is not present in the quoted words. Ask for the figure rather than rounding one '
    + 'into an evidence record.',
  value_not_stated:
    'The quoted words do not state that value. A symptom is not a severity and a condition is not '
    + 'a grade — propose the structured question instead, and let the assessor pick.',
  ambiguous_attestation:
    'The quoted words support more than one value of this single-select field, so they do not settle '
    + 'it. Ask the assessor which applies rather than choosing for them.',
  unattestable_kind:
    'This field has no attestation rule, so a value for it cannot be evidenced. Ask the structured '
    + 'question instead.',
  not_eligible:
    'That question is not one the walkthrough would ask in this zone right now — it is outside the '
    + 'zone catalog, its display condition rules it out, or it is already answered.',
}

const rejection = (reason, detail, message) => ({
  ok: false,
  reason,
  ...(detail ? { detail } : {}),
  message: message || REJECTION_MESSAGE[reason] || 'Proposal rejected.',
})

/**
 * Screen ONE proposed fact against gates 2, 3 and 4.
 *
 * This is the whole implementation. `interpretProposals` batches it and adds
 * the caps; Jasper's `record_zone_observation` calls it per proposal. Two
 * callers, one gate — the alternative is a server-side copy that drifts, and
 * the copy that drifts is always the one in front of a user.
 *
 * @param {object} proposal { field, value, quote }
 * @param {object} ctx      { zone, text } — text is everything the ASSESSOR wrote
 */
export function screenFact(proposal, ctx = {}) {
  const { zone, text } = ctx
  const f = proposal || {}
  if (typeof f.field !== 'string' || !f.field) return rejection('malformed_fact', null, 'A proposal needs a field id.')
  // Gate 3a — the words have to exist, and be theirs.
  if (typeof f.quote !== 'string' || !flatten(f.quote)) return rejection('missing_quote')
  if (!flatten(text).includes(flatten(f.quote))) return rejection('quote_not_in_text')
  // Gate 4 — never re-litigate an answer the assessor already gave.
  if (zone && hasValue(zone[f.field])) return rejection('field_already_answered')
  // Gate 2 — the same validator Jasper's record_zone_observation already uses.
  const v = validateObservation(f.field, f.value)
  if (!v.ok) return { ok: false, reason: v.error, message: v.message, ...(v.allowed ? { allowed: v.allowed } : {}) }
  // Gate 3b — the VALUE must be in the words, not inferred from them.
  // `validateObservation` has already refused an id with no contract.
  const contract = getObservableField(f.field)
  const attest = ATTESTERS[contract.kind]
  if (!attest) return rejection('unattestable_kind', contract.kind)
  const unsupported = attest(f.field, v.value, f.quote)
  if (unsupported) return rejection(unsupported.reason, unsupported.detail)
  return {
    ok: true,
    fact: { field: contract.id, label: contract.label, value: v.value, quote: f.quote },
    contract,
  }
}

/**
 * Screen ONE proposed follow-up question against gate 1.
 *
 * `eligible` is passed in rather than recomputed so a batch caller pays for
 * the catalog walk once, and so the ranked and unranked forms of eligibility
 * both feed the same gate.
 */
export function screenQuestion(id, eligible) {
  if (!id || typeof id !== 'string') return rejection('malformed_question', null, 'A proposal needs a question id.')
  const hit = (eligible || []).find((q) => q.id === id)
  return hit ? { ok: true, question: hit } : rejection('not_eligible')
}

function reject(list, item, reason, detail) {
  list.push({ ...item, reason, ...(detail ? { detail } : {}) })
}

/**
 * Validate a model's proposals against the four gates.
 *
 * @param {object|string} raw  what the model returned
 * @param {object} ctx         { assessment, zoneIndex, text }
 * @returns {{ facts: Array, questions: Array, rejected: Array, ok: boolean }}
 */
export function interpretProposals(raw, ctx = {}) {
  const empty = { facts: [], questions: [], rejected: [], ok: false }
  const { assessment, zoneIndex, text } = ctx
  const zone = ((assessment && assessment.zones) || [])[zoneIndex]

  // Fail closed. A response that is not the agreed shape is not partially
  // trusted — an object we cannot parse is an object we cannot bound.
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return { ...empty, rejected: [{ reason: 'unparseable_output' }] } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...empty, rejected: [{ reason: 'malformed_output' }] }
  }
  if (!zone) return { ...empty, rejected: [{ reason: 'no_active_zone' }] }

  const rejected = []
  const facts = []
  const questions = []

  // ── Facts ────────────────────────────────────────────────────────────
  // Gates 2–4 live in `screenFact`, which Jasper's dispatcher calls for the
  // same proposals arriving one at a time. Only the CAP is the batch's own.
  const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : []
  for (const f of rawFacts) {
    const item = { field: f && f.field, value: f && f.value, quote: f && f.quote }
    if (!f || typeof f !== 'object') { reject(rejected, item, 'malformed_fact'); continue }
    const screened = screenFact(f, { zone, text })
    if (!screened.ok) { reject(rejected, item, screened.reason, screened.detail); continue }
    if (facts.length >= MAX_FACTS) { reject(rejected, item, 'over_fact_limit'); continue }
    facts.push(screened.fact)
  }

  // ── Questions ────────────────────────────────────────────────────────
  const eligible = eligibleQuestions(assessment, zoneIndex)
  const rawQs = Array.isArray(parsed.questions) ? parsed.questions : []
  for (const q of rawQs) {
    const id = q && (q.question_id || q.id)
    const item = { question_id: id, reason: q && q.reason }
    // Gate 1 — the catalog and the condition decide, not the model.
    const screened = screenQuestion(id, eligible)
    if (!screened.ok) { reject(rejected, item, screened.reason); continue }
    if (questions.some((x) => x.question_id === id)) { reject(rejected, item, 'duplicate'); continue }
    // A fact proposal for the same field makes the question redundant: the
    // assessor is about to be offered the answer itself.
    if (facts.some((x) => x.field === id)) { reject(rejected, item, 'superseded_by_fact'); continue }
    if (questions.length >= MAX_QUESTIONS) { reject(rejected, item, 'over_question_limit'); continue }
    questions.push({
      question_id: id,
      question: screened.question.question,
      deterministic: screened.question.deterministic,
      reason: typeof q.reason === 'string' ? q.reason : null,
    })
  }

  return { facts, questions, rejected, ok: true }
}
