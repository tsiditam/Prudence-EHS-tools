/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The assessor's decision about a reading — the third record, and the only one
 * that can put anything into a deliverable.
 *
 * Three facts, deliberately stored apart, because they are answers to three
 * different questions and only one of them is a person's:
 *
 *   the ANALYSIS      what the detector found. A fact about the data.
 *                     Re-derived from the envelope every time; stored nowhere.
 *   the INTERPRETATION a model's reading of it, validated.
 *                     `sensorData.forensicInterpretation`.
 *   the REVIEW         whether a credentialed assessor accepts that reading
 *                     for a professional deliverable. THIS module.
 *                     `sensorData.forensicReview`.
 *
 * A validated interpretation means "the model produced this and the gates
 * passed it". It does not mean anyone agreed with it, and it must never be
 * read that way — an AI reading that reached a client report because nobody
 * objected is the failure this whole layer exists to prevent.
 *
 * ── What a decision freezes, and why ───────────────────────────────────
 * Accepting stores the PROSE, not a pointer to it. The precedent is
 * `applyOverride` in `aiSections.js`, which freezes the findings onto the
 * override "so a later pass cannot rewrite what was disclosed", and the
 * reasoning carries exactly: a regeneration that quietly changed accepted
 * report language would put words in the assessor's mouth. The fingerprint of
 * the inputs rides along, so the decision also knows WHICH session it was
 * about.
 *
 * ── The three ways a decision stops counting ───────────────────────────
 *   stale       the session's inputs changed since the decision, so the
 *               fingerprint no longer matches. The reading describes a
 *               session that no longer exists.
 *   superseded  the stored interpretation for that pattern is no longer the
 *               content that was accepted — the model was asked again and said
 *               something else, or no longer raises the pattern at all.
 *               Without this the panel would show one wording and the report
 *               would carry another, which is the surfaces-disagreeing defect
 *               this codebase has shipped three times.
 *
 *               The first cut compared the main interpretation string ALONE,
 *               which is the same defect one level down: a regeneration could
 *               keep that sentence and rewrite an alternative explanation or a
 *               recommended review, and supersession stayed false while the
 *               panel and the report disagreed about the very fields the
 *               report renders. `freeze` and `acceptedSignature` are now one
 *               projection used by both halves — what is stored and what is
 *               compared cannot describe different things.
 *   digits      the frozen prose carries a number. The validator refuses
 *               those at generation, so this can only be a hand-built record —
 *               and the check runs again at the deliverable boundary because
 *               that is the boundary that matters. Deterministic layer owns
 *               numbers; a reading never introduces one.
 *
 * Any of the three excludes the row from the report, whatever the assessor
 * decided. Acceptance is permission, not an override of the gates.
 */

import { proseDigits } from './forensicValidate'
import { patternTitle, patternEvidence } from './forensicPresent'

/** Bumped when the review record's shape changes. */
export const FORENSIC_REVIEW_VERSION = 1

/**
 * `unreviewed` is the ABSENCE of a decision, never a stored one. Reopening
 * deletes the entry rather than writing a third state, so "nobody has decided"
 * and "somebody decided and then undecided" cannot drift apart.
 */
export const REVIEW_STATUSES = Object.freeze(['unreviewed', 'accepted', 'dismissed'])

/** Why an accepted decision is not eligible for the report. */
export const INELIGIBLE_REASONS = Object.freeze(['stale', 'superseded', 'digits_in_prose'])

const isStr = (v) => typeof v === 'string'
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const text = (v) => (isStr(v) ? v.trim() : '')
const list = (v) => arr(v).filter(isStr).map((s) => s.trim()).filter(Boolean)

/** An empty review record. */
export function emptyForensicReview() {
  return { version: FORENSIC_REVIEW_VERSION, decisions: {} }
}

const normalize = (review) => {
  const r = obj(review)
  return {
    version: Number.isFinite(r.version) ? r.version : FORENSIC_REVIEW_VERSION,
    decisions: obj(r.decisions),
  }
}

/**
 * THE projection of a model's content — the one thing a decision is about.
 *
 * Every model-authored field that can reach the panel or the report is here,
 * and nothing that cannot. `evidence_ids` and `missing_context_ids` are
 * deliberately absent: they are pointers into a bundle, and a pointer frozen
 * against a session that has since changed is worse than no pointer — the
 * evidence line is rebuilt from the live bundle instead.
 *
 * Idempotent, so it normalizes a raw interpretation and a stored decision
 * identically. That is what lets one function both FREEZE what was accepted
 * and decide whether the current reading still matches it; two projections
 * would eventually disagree about which fields matter, and the half that
 * mattered less would silently win.
 */
export function acceptedContent(interpretation) {
  const i = obj(interpretation)
  return {
    title: text(i.title),
    importance: text(i.importance),
    interpretation: text(i.interpretation),
    alternative_explanations: list(i.alternative_explanations),
    recommended_reviews: list(i.recommended_reviews),
  }
}
const freeze = acceptedContent

/**
 * A comparable signature over that projection.
 *
 * ARRAY ORDER IS SIGNIFICANT, deliberately. The order the alternatives and the
 * recommended reviews are written in is the order the assessor read them and
 * the order the report prints them, so a reordering is a different document
 * even when the set is identical — and "we only reordered it" is exactly the
 * change nobody would think to re-read.
 */
export function acceptedSignature(interpretation) {
  const a = acceptedContent(interpretation)
  return JSON.stringify([
    a.title, a.importance, a.interpretation,
    a.alternative_explanations, a.recommended_reviews,
  ])
}

/**
 * Every string a decision would publish, as one block.
 *
 * Read off the same projection, so the digit scan covers exactly the set that
 * can be published — no more, and no less.
 */
const decisionProse = (d) => {
  const x = acceptedContent(d)
  return [x.title, x.interpretation, ...x.alternative_explanations, ...x.recommended_reviews].join('\n')
}

/**
 * Record an acceptance.
 *
 * Every field is optional because every field is read defensively, and a call
 * with no pattern is a no-op rather than a throw — a decision about nothing is
 * not a decision, and storing a nameless one would be worse than dropping it.
 *
 * @param {object} [review] the current review record (or null)
 * @param {object} [input]
 * @param {string} [input.patternId] required in practice; absent is a no-op
 * @param {object} [input.interpretation] the validated entry being accepted
 * @param {string} [input.fingerprint] the bundle's forensic input fingerprint
 * @param {string} [input.reviewedAt] ISO; defaults to now
 * @param {string} [input.note] the assessor's own note, if any
 * @param {number} [input.interpretationVersion] the record's `version`
 */
export function acceptInterpretation(review, input = {}) {
  const r = normalize(review)
  const patternId = text(input.patternId)
  if (!patternId) return r
  return {
    ...r,
    decisions: {
      ...r.decisions,
      [patternId]: {
        status: 'accepted',
        reviewedAt: isStr(input.reviewedAt) ? input.reviewedAt : new Date().toISOString(),
        fingerprint: isStr(input.fingerprint) ? input.fingerprint : null,
        interpretationVersion: Number.isFinite(input.interpretationVersion) ? input.interpretationVersion : null,
        note: text(input.note) || null,
        accepted: freeze(input.interpretation),
      },
    },
  }
}

/**
 * Record a dismissal.
 *
 * The prose is frozen here too, even though nothing renders it. A dismissal
 * that does not say WHAT was dismissed cannot be told apart from one made
 * about different wording after a regeneration, and the assessor would be
 * shown "dismissed" over a reading they never saw.
 *
 * Same optionality as `acceptInterpretation`, for the same reason.
 *
 * @param {object} [review]
 * @param {object} [input] as `acceptInterpretation`
 */
export function dismissInterpretation(review, input = {}) {
  const r = normalize(review)
  const patternId = text(input.patternId)
  if (!patternId) return r
  return {
    ...r,
    decisions: {
      ...r.decisions,
      [patternId]: {
        status: 'dismissed',
        reviewedAt: isStr(input.reviewedAt) ? input.reviewedAt : new Date().toISOString(),
        fingerprint: isStr(input.fingerprint) ? input.fingerprint : null,
        note: text(input.note) || null,
        accepted: freeze(input.interpretation),
      },
    },
  }
}

/** Undo a decision. The entry is removed, so the pattern is `unreviewed` again. */
export function reopenInterpretation(review, patternId) {
  const r = normalize(review)
  const id = text(patternId)
  if (!id || !(id in r.decisions)) return r
  const decisions = { ...r.decisions }
  delete decisions[id]
  return { ...r, decisions }
}

/** The stored decision for one pattern, or null. */
export function reviewDecision(review, patternId) {
  const d = obj(normalize(review).decisions[text(patternId)])
  return REVIEW_STATUSES.includes(d.status) ? d : null
}

/** `accepted` / `dismissed` / `unreviewed`. */
export function reviewStatusFor(review, patternId) {
  const d = reviewDecision(review, patternId)
  return d ? d.status : 'unreviewed'
}

/**
 * The full per-pattern picture the panel renders from: what the detector
 * found, what the model said about it, what the assessor decided, and whether
 * that decision still counts.
 *
 * One row per pattern IN THE BUNDLE, so a decision about a pattern the current
 * data no longer produces simply does not appear — it cannot reach a report
 * either, because the report reads this same list.
 *
 * @param {object} input
 * @param {object} input.bundle
 * @param {object} [input.record] the stored `forensicInterpretation`
 * @param {object} [input.review] the stored `forensicReview`
 * @returns {Array<{patternId, pattern, interpretation, decision, status, stale,
 *   superseded, ineligible, eligible}>}
 */
export function reviewedPatterns(input = {}) {
  const bundle = obj(input.bundle)
  const record = obj(input.record)
  const review = normalize(input.review)
  const fingerprint = isStr(bundle.fingerprint) ? bundle.fingerprint : null

  const byPattern = new Map()
  arr(record.interpretations).forEach((i) => { if (text(obj(i).pattern_id)) byPattern.set(obj(i).pattern_id, i) })

  return arr(bundle.patterns).map((pattern) => {
    const patternId = obj(pattern).id
    const interpretation = byPattern.get(patternId) || null
    const decision = reviewDecision(review, patternId)
    const status = decision ? decision.status : 'unreviewed'

    const stale = !!decision && (!fingerprint || decision.fingerprint !== fingerprint)
    // Is the accepted CONTENT — every field the panel or the report renders —
    // still the content on offer? A record that no longer carries this pattern
    // supersedes the decision too: the assessor approved a reading the current
    // analysis does not make.
    const superseded = !!decision && (
      !interpretation || acceptedSignature(interpretation) !== acceptedSignature(decision.accepted)
    )
    const digits = !!decision && proseDigits(decisionProse(decision.accepted)).length > 0

    const ineligible = []
    if (stale) ineligible.push('stale')
    if (superseded) ineligible.push('superseded')
    if (digits) ineligible.push('digits_in_prose')

    return {
      patternId,
      pattern,
      interpretation,
      decision,
      status,
      stale,
      superseded,
      ineligible,
      eligible: status === 'accepted' && ineligible.length === 0,
    }
  })
}

/**
 * The rows the monitoring report's optional "Monitoring Pattern Review"
 * section renders, or an empty array.
 *
 * Every figure on a row comes from `patternEvidence`, which reads the bundle;
 * the model's prose contributes words only, and a row whose prose carries a
 * digit is dropped here as well as at generation. An empty array means the
 * section does not exist in the document — never an empty heading.
 *
 * Serializable by construction, because it rides in the report `opts` that
 * `monitoringReport` stores, and the contract for that record is that
 * `session + opts` re-derive the issued document exactly.
 */
export function monitoringPatternReview(input = {}) {
  const bundle = obj(input.bundle)
  return reviewedPatterns(input)
    .filter((row) => row.eligible)
    .map((row) => ({
      patternId: row.patternId,
      kind: obj(row.pattern).kind || null,
      title: patternTitle(row.pattern),
      // Deterministic. Read off the bundle, never off the prose.
      evidence: patternEvidence(row.pattern, bundle),
      reading: obj(row.decision.accepted).interpretation,
      alternatives: arr(obj(row.decision.accepted).alternative_explanations),
      reviews: arr(obj(row.decision.accepted).recommended_reviews),
      importance: obj(row.decision.accepted).importance || null,
      reviewedAt: row.decision.reviewedAt || null,
    }))
}
