/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * An EVIDENCE RELATIONSHIP — how two pieces of evidence sit relative to
 * each other, and nothing about what that means.
 *
 * ── Why this is not an integrity finding ───────────────────────────────
 * A finding says something is WRONG with the record. It carries an
 * actionability, because somebody can do something about it, and a
 * resolution, because it can stop being true. A relationship says two
 * things line up, or do not. Nothing is wrong, there is nothing to
 * resolve, and `resolution_status: 'open'` on a statement of agreement
 * would be meaningless. So it is its own type, sharing this family's id
 * and provenance discipline and none of its verbs.
 *
 * ── It carries no prose, by construction ───────────────────────────────
 * Every field is an enum from a frozen vocabulary, an id, or a count.
 * There is no title, no description, no sentence. That is the strongest
 * available form of "it never asserts causation": with no free text there
 * is no free text to inspect, and a presenter that later renders these has
 * to build its wording from the vocabulary rather than pass one through.
 *
 * ── Two axes, kept apart ───────────────────────────────────────────────
 * WHETHER two time patterns line up is observational and independent of
 * any hypothesis. WHETHER the parameter involved bears on an explanation
 * the investigation is actually entertaining is a separate question with a
 * separate answer. Collapsing them would let a temporal coincidence read
 * as support for a cause, which is the one thing this layer exists to
 * prevent: an afternoon pattern and an afternoon complaint agree in time
 * whether or not anything connects them.
 */

import { fnv1aHex } from '../../utils/forensicEvents.js'

/** Bumped when the relationship shape changes. */
export const RELATIONSHIP_CONTRACT_VERSION = 1

/**
 * How two time patterns sit relative to each other. Three values, and the
 * third is not a failure: "we looked and cannot say" is an answer, and
 * having a word for it is what keeps the other two honest.
 */
export const TEMPORAL_RELATIONSHIPS = Object.freeze([
  'temporal_overlap',
  'temporal_mismatch',
  'insufficient_temporal_evidence',
])

/**
 * WHY a comparison could not be made, machine-readable so a consumer never
 * has to reverse-engineer it from an absence. Each names a different fix,
 * which is the point: one of these is answered by an explicit dataset link,
 * another by asking the assessor a question, another by a longer
 * deployment, and nothing about the record can distinguish them after the
 * fact if the reason is thrown away.
 */
export const INSUFFICIENT_REASONS = Object.freeze([
  // Which room the logger describes is not in the record: no dataset
  // carries an explicit link and the legacy one-zone rule cannot apply.
  // Resolved by linking the dataset, never by matching names.
  'no_unambiguous_zone_dataset_association',
  // The dataset names a zone that no longer exists. An explicit statement
  // whose target was deleted must not quietly become a different one, so
  // this suppresses the legacy fallback rather than reattaching the
  // dataset to whichever zone happens to survive.
  'associated_zone_no_longer_exists',
  // The pattern rests on datasets linked to DIFFERENT zones, so it
  // describes more than one room and no single complaint period applies.
  // Per-pattern rather than per-session: the other patterns in the same
  // run are unaffected.
  'conflicting_zone_associations',
  // Complaints are reported, but not against a part of the day, so there is
  // no period to compare anything to.
  'complaint_has_no_specific_period',
  // Too little of the clock was observed for a time-of-day claim.
  'insufficient_monitored_days',
  // The pattern occurred on too few days to say when it usually occurs.
  'insufficient_occurrence_days',
  // Nothing this pattern carries can discriminate a time of day — no
  // windows, or only windows too long to fall inside one.
  'no_eligible_occurrences',
  // It occurred in the reported period on some days and not others, in no
  // majority either way. Not an overlap, and not a mismatch.
  'indeterminate_period_distribution',
])

/**
 * Whether the parameter is already connected to an explanation the
 * investigation is entertaining.
 *
 * Read off the live differentials through the engine's own
 * `RULE_PARAMETERS`, never through a symptom-to-parameter table invented
 * here — that would be a second opinion beside the hypothesis engine.
 *
 * `not_linked_to_live_differential` does not diminish the relationship.
 * The overlap is equally real; it simply may not be elevated into an
 * explanation, which is a presentation rule rather than a fact about the
 * data. `unknown` is for when no investigation state exists to ask.
 */
export const PARAMETER_RELEVANCE = Object.freeze([
  'linked_to_live_differential',
  'not_linked_to_live_differential',
  'unknown',
])

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const ids = (v) => [...new Set(arr(v).filter((x) => typeof x === 'string' && x))].sort()
const count = (v) => (isNum(v) && v >= 0 ? Math.round(v) : 0)

/**
 * A deterministic relationship id.
 *
 * Identity is the QUESTION, not the answer: the detector, the subject it
 * is about, the zone and the parameter. The outcome, the relevance and the
 * day counts are deliberately outside it, so the same pairing keeps one id
 * while the data under it changes. A consumer keyed by this id follows one
 * row as it moves between overlap and insufficient rather than watching
 * rows appear and vanish.
 */
export function relationshipId(detector, scope = {}) {
  const sig = [
    str(detector),
    str(scope.subject),
    ids(scope.zone_ids).join(','),
    str(scope.param),
    str(scope.reported_period),
  ].join('::')
  return `rel-${str(detector) || 'x'}-${fnv1aHex(sig)}`
}

/**
 * Build one relationship.
 *
 * @param {object} input
 * @param {string} input.detector
 * @param {string} input.subject          what the relationship is about; the
 *   pattern id here, and part of identity
 * @param {string} input.relationship     one of TEMPORAL_RELATIONSHIPS
 * @param {string|null} [input.reason]    one of INSUFFICIENT_REASONS, and
 *   REQUIRED when the relationship is insufficient. Null otherwise: a
 *   reason beside a conclusive answer would read as a caveat on it.
 * @param {string} input.relevance        one of PARAMETER_RELEVANCE
 * @param {string|null} [input.param]     parameter key, when there is one
 * @param {string|null} [input.reported_period] the `sy_time` value verbatim
 * @param {string[]} [input.zone_ids]
 * @param {string[]} [input.parameter_ids]
 * @param {string[]} [input.evidence_ids]
 * @param {{monitored:number, withOccurrence:number, inPeriod:number}} [input.observed_days]
 * @param {string|null} [input.inputs_fingerprint]
 * @param {string|null} [input.generated_at] never part of identity
 * @returns {object} frozen relationship
 */
export function evidenceRelationship(input = {}) {
  const relationship = str(input.relationship)
  const days = input.observed_days && typeof input.observed_days === 'object' ? input.observed_days : {}
  return Object.freeze({
    id: relationshipId(input.detector, {
      subject: input.subject,
      zone_ids: input.zone_ids,
      param: input.param,
      reported_period: input.reported_period,
    }),
    subject: str(input.subject) || null,
    relationship,
    // Carried only where it explains something. A reason on a conclusive
    // answer would read as a hedge on it.
    reason: relationship === 'insufficient_temporal_evidence' ? (str(input.reason) || null) : null,
    relevance: str(input.relevance) || 'unknown',
    param: str(input.param) || null,
    reported_period: str(input.reported_period) || null,
    zone_ids: Object.freeze(ids(input.zone_ids)),
    parameter_ids: Object.freeze(ids(input.parameter_ids)),
    evidence_ids: Object.freeze(ids(input.evidence_ids)),
    // Counts of DAYS, never a percentage. The underlying quantity is a
    // small integer, and a percentage over it manufactures precision the
    // record does not have: two days out of three is not sixty-seven
    // percent of anything.
    observed_days: Object.freeze({
      monitored: count(days.monitored),
      withOccurrence: count(days.withOccurrence),
      inPeriod: count(days.inPeriod),
    }),
    provenance: Object.freeze({
      contract_version: RELATIONSHIP_CONTRACT_VERSION,
      detector: str(input.detector),
      inputs_fingerprint: str(input.inputs_fingerprint) || null,
      generated_at: str(input.generated_at) || null,
    }),
  })
}

/** Everything about a relationship except when it was produced. */
export function relationshipIdentity(rel) {
  const r = rel && typeof rel === 'object' ? rel : {}
  return JSON.stringify([
    r.id, r.subject, r.relationship, r.reason, r.relevance, r.param,
    r.reported_period, arr(r.zone_ids), arr(r.parameter_ids), arr(r.evidence_ids),
    r.observed_days || null,
  ])
}
