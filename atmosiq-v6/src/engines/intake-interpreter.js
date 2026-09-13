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
 * 3. ATTESTATION. Every proposed fact carries a `quote`, and the quote must
 *    appear VERBATIM in the assessor's own text. This is the structural
 *    answer to "never infer a value that was not actually stated": a model
 *    that wants to record a fact has to point at the words, and the words
 *    are checked. For a numeric field the number itself must be present in
 *    that quote, in digits or in words.
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
import { evalCondition } from '../utils/conditions.js'
import { Q_ZONE } from '../constants/questions.js'
import { zoneGaps } from './zone-gaps.js'

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

/** Is this number actually present in the words the assessor wrote? */
function numberAttested(value, quote) {
  const n = Number(value)
  if (!Number.isFinite(n)) return false
  const q = flatten(quote)
  // Digits, with or without a decimal tail the model may have normalized.
  if (new RegExp(`(^|[^0-9.])${n}([^0-9]|$)`).test(q)) return true
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (num === n && new RegExp(`\\b${word}\\b`).test(q)) return true
  }
  return false
}

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
  return Q_ZONE
    .filter((q) => SIMPLE_TYPES.has(q.t))
    .filter((q) => evalCondition(q.cond, zone))
    .filter((q) => !hasValue(zone[q.id]))
    .map((q) => ({
      id: q.id,
      question: q.q,
      type: q.t,
      // A deterministic gap naming this field is a stronger reason to ask
      // than the model's reading of a sentence.
      deterministic: gapLabels.has(q.q) || [...gapLabels].some((l) => q.q && String(q.q).includes(l)),
    }))
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
  const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : []
  for (const f of rawFacts) {
    const item = { field: f && f.field, value: f && f.value, quote: f && f.quote }
    if (!f || typeof f !== 'object' || typeof f.field !== 'string') {
      reject(rejected, item, 'malformed_fact'); continue
    }
    // Gate 3a — the words have to exist.
    if (typeof f.quote !== 'string' || !flatten(f.quote)) {
      reject(rejected, item, 'missing_quote'); continue
    }
    if (!flatten(text).includes(flatten(f.quote))) {
      reject(rejected, item, 'quote_not_in_text'); continue
    }
    // Gate 4 — never re-litigate an answer the assessor already gave.
    if (hasValue(zone[f.field])) {
      reject(rejected, item, 'field_already_answered'); continue
    }
    // Gate 2 — the same validator Jasper's record_zone_observation uses.
    const v = validateObservation(f.field, f.value)
    if (!v.ok) {
      reject(rejected, item, v.error, v.message); continue
    }
    // Gate 3b — a number must be in the words, not inferred from them.
    const contract = getObservableField(f.field)
    if (contract && contract.kind === 'number' && !numberAttested(v.value, f.quote)) {
      reject(rejected, item, 'number_not_stated'); continue
    }
    if (facts.length >= MAX_FACTS) { reject(rejected, item, 'over_fact_limit'); continue }
    facts.push({ field: contract.id, label: contract.label, value: v.value, quote: f.quote })
  }

  // ── Questions ────────────────────────────────────────────────────────
  const eligible = eligibleQuestions(assessment, zoneIndex)
  const byId = new Map(eligible.map((q) => [q.id, q]))
  const rawQs = Array.isArray(parsed.questions) ? parsed.questions : []
  for (const q of rawQs) {
    const id = q && (q.question_id || q.id)
    const item = { question_id: id, reason: q && q.reason }
    if (!id || typeof id !== 'string') { reject(rejected, item, 'malformed_question'); continue }
    // Gate 1 — the catalog and the condition decide, not the model.
    if (!byId.has(id)) { reject(rejected, item, 'not_eligible'); continue }
    if (questions.some((x) => x.question_id === id)) { reject(rejected, item, 'duplicate'); continue }
    // A fact proposal for the same field makes the question redundant: the
    // assessor is about to be offered the answer itself.
    if (facts.some((x) => x.field === id)) { reject(rejected, item, 'superseded_by_fact'); continue }
    if (questions.length >= MAX_QUESTIONS) { reject(rejected, item, 'over_question_limit'); continue }
    const e = byId.get(id)
    questions.push({
      question_id: id,
      question: e.question,
      deterministic: e.deterministic,
      reason: typeof q.reason === 'string' ? q.reason : null,
    })
  }

  return { facts, questions, rejected, ok: true }
}
