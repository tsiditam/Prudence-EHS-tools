/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The integrity finding — one shape for what several layers already say.
 *
 * AtmosFlow has four deterministic layers that each answer "what is wrong
 * with this record": `validation.js` (finalization blockers),
 * `defensibility-gaps.js` (evidentiary context), `investigation-gaps.js`
 * (untested differentials) and `preReviewValidator.js` (report package
 * consistency). Each grew its own vocabulary, so a finding cannot travel
 * between them, cannot cite the evidence that produced it, and cannot say
 * WHEN it applies.
 *
 * This module is the shared shape, and nothing else. It runs no rule and
 * detects nothing:
 *
 *   • it does not decide what is missing — detectors do;
 *   • it does not decide where a finding renders — surfaces do;
 *   • it does not decide whether an assessment is ready — `deriveStatus`
 *     in `readiness-verdict.js` does, and Phase 1 deliberately does not
 *     let a finding reach it.
 *
 * ── Why a contract and not a consolidation ─────────────────────────────
 * The four layers stay separate on purpose. They run at different moments
 * against different inputs: zone completion happens in a building with no
 * network, report QA happens at review against an assembled package.
 * Collapsing them into one execution path would put report checks on the
 * walkthrough's critical path. What they share is the shape of an answer,
 * so that is the only thing shared.
 *
 * ── Identity excludes time ─────────────────────────────────────────────
 * `generated_at` rides in provenance and is NEVER part of the id, the
 * fingerprint, or equality. Two runs a minute apart over an unchanged
 * record must produce byte-identical findings, or every test that asserts
 * one becomes a clock test.
 *
 * The id derivation is `patternId`'s, not a new one: sort the member sets,
 * join with a separator, hash with the same `fnv1aHex` the forensic layer
 * uses. Order-insensitive, never positional, so the same session
 * reproduces the same id and a changed session does not.
 */

import { fnv1aHex } from '../../utils/forensicEvents.js'

/** Bumped when the finding shape changes. */
export const INTEGRITY_CONTRACT_VERSION = 1

/**
 * How much of the reviewer's attention, in one vocabulary that both
 * existing ladders project into without loss.
 *
 *   defensibility / investigation gaps:  info → advisory, warn → warning
 *   preReviewValidator:  suggestion → advisory, warning → warning,
 *                        blocking → blocking
 *
 * `blocking` exists so the projection is lossless. NO detector composed in
 * Phase 1 may emit it, and `integrity-finding.test.ts` fails if one does:
 * blocking is what `validation.js` means by a finalization blocker, and
 * adding a second source of that would change what "Ready" means.
 */
export const INTEGRITY_SEVERITIES = Object.freeze(['advisory', 'warning', 'blocking'])

/**
 * What the assessor can actually do about it, which is the routing
 * decision the walkthrough assistant makes and the reason this field
 * exists at all. A finding with no actionability is a complaint.
 */
export const INTEGRITY_ACTIONABILITY = Object.freeze([
  'on_site_now',      // the assessor is in the building and can still record it
  'before_signoff',   // resolvable at review, before the report is issued
  'remote',           // needs somebody else, a document, or a phone call
  'informational',    // nothing to do; stated so the reader knows it was considered
])

/** What kind of problem this is. Frozen so a test can pin the vocabulary. */
export const INTEGRITY_ISSUE_TYPES = Object.freeze([
  'missing_context',        // an input that changes how existing evidence reads
  'contradiction',          // two sources of evidence disagree
  'unsupported_conclusion', // a statement the record does not carry
  'untested_alternative',   // a live explanation nothing measured against
])

/** Which layer produced it. The `source` idea `zone-gaps.js` already uses. */
export const INTEGRITY_SOURCE_LAYERS = Object.freeze([
  'field_integrity',   // walkthrough record checks, this phase
  'defensibility',     // defensibility-gaps.js
  'investigation',     // investigation-gaps.js
  'report_package',    // preReviewValidator.js, projected in a later phase
])

/**
 * Resolution, DERIVED in Phase 1 and never stored.
 *
 * A finding is recomputed from the record on every build, exactly as
 * `deriveInvestigation` is, so "resolved" is not a state anybody writes:
 * the assessor changes the record and the finding stops deriving. The
 * vocabulary is declared now because the moment a resolution is PERSISTED
 * it needs a fingerprint to stale against, and that is the design this
 * leaves room for rather than the one it ships.
 */
export const INTEGRITY_RESOLUTION = Object.freeze([
  'open',
  'documented_as_limitation', // reserved: needs persistence, not Phase 1
])

/**
 * Evidence id namespaces, because a finding that cites nothing is a
 * finding nobody can check.
 *
 *   forensic  the real minted ids. `pat-…` and `ev-…` resolve against
 *             `bundleEvidence()`; `occ-…` resolves against its own
 *             pattern's `occurrenceWindows`, which is where occurrence
 *             identity lives.
 *   field     `fld-<zone>-<fieldId>`, a structural pointer at the
 *             questionnaire field a finding rests on. There is no
 *             assessment-side evidence registry to resolve these against
 *             yet; the prefix is declared so that when one exists these
 *             do not have to be re-invented, and so a consumer can tell
 *             the two apart without guessing.
 */
export const fieldEvidenceId = (zoneId, fieldId) => `fld-${zoneId}-${fieldId}`

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const ids = (v) => [...new Set(arr(v).filter((x) => typeof x === 'string' && x))].sort()

/**
 * A deterministic finding id.
 *
 * Everything that makes the finding the one it is, and nothing that makes
 * it the run it is. Same construction as `patternId` in
 * `forensicPatterns.js`, down to the separator, so the two id schemes read
 * alike in a log and neither needs a serializer.
 */
export function integrityFindingId(detector, scope = {}) {
  const w = scope.time_window
  const win = w && isNum(w.start)
    ? `${Math.round(w.start)}-${isNum(w.end) ? Math.round(w.end) : Math.round(w.start)}`
    : ''
  const sig = [
    str(detector),
    str(scope.issue_type),
    ids(scope.zone_ids).join(','),
    ids(scope.parameter_ids).join(','),
    ids(scope.evidence_ids).join(','),
    // A discriminator for a detector that can raise more than one finding
    // about one zone. `patternId` carries the same field for the same
    // reason, and it is what lets a detector keep an id stable while
    // leaving supporting evidence out of identity.
    str(scope.subject),
    win,
  ].join('::')
  return `intg-${str(detector) || 'x'}-${fnv1aHex(sig)}`
}

/**
 * Build one finding.
 *
 * Every field is normalized here rather than by each detector, so two
 * detectors cannot disagree about whether `zone_ids` is sorted or whether
 * an absent window is `null` or omitted. Frozen, because a consumer that
 * mutated one would be editing what another consumer reads.
 *
 * @param {object} input
 * @param {string} input.detector      stable detector name, part of identity
 * @param {string} input.issue_type    one of INTEGRITY_ISSUE_TYPES
 * @param {string} input.severity      one of INTEGRITY_SEVERITIES
 * @param {string} input.source_layer  one of INTEGRITY_SOURCE_LAYERS
 * @param {string} input.actionability one of INTEGRITY_ACTIONABILITY
 * @param {string[]} [input.zone_ids]
 * @param {string[]} [input.evidence_ids]
 * @param {string[]} [input.parameter_ids]
 * @param {{start:number,end:number,basis:string}|null} [input.time_window]
 * @param {string} input.title
 * @param {string} input.description
 * @param {string} input.why_it_matters
 * @param {string|null} [input.inputs_fingerprint] the fingerprint of the
 *   evidence this rests on, when it rests on fingerprinted evidence. Written
 *   for a later phase to stale a PERSISTED resolution against; read by
 *   nothing today, because a derived finding cannot go stale.
 * @param {string|null} [input.generated_at] ISO. Never part of identity.
 * @param {object} [input.identity] explicit id scope, when the default is
 *   wrong. THE DEFAULT INCLUDES SUPPORTING EVIDENCE, which is right for a
 *   detector whose findings are distinguished by what they cite and wrong
 *   for one that raises a single finding per subject: attaching a logger
 *   file later would silently mint a new id for the same problem, and any
 *   resolution recorded against the old one would detach from it. Such a
 *   detector passes `{ issue_type, zone_ids, subject }` and keeps its ids
 *   stable across evidence that comes and goes.
 * @returns {object} frozen finding
 */
export function integrityFinding(input = {}) {
  const w = input.time_window
  const time_window = w && isNum(w.start)
    ? Object.freeze({
      start: w.start,
      end: isNum(w.end) ? w.end : w.start,
      basis: str(w.basis) || 'unspecified',
    })
    : null

  const scope = input.identity && typeof input.identity === 'object'
    ? input.identity
    : {
      issue_type: input.issue_type,
      zone_ids: input.zone_ids,
      parameter_ids: input.parameter_ids,
      evidence_ids: input.evidence_ids,
      time_window,
    }

  return Object.freeze({
    id: integrityFindingId(input.detector, scope),
    issue_type: str(input.issue_type),
    severity: str(input.severity),
    source_layer: str(input.source_layer),
    zone_ids: Object.freeze(ids(input.zone_ids)),
    evidence_ids: Object.freeze(ids(input.evidence_ids)),
    parameter_ids: Object.freeze(ids(input.parameter_ids)),
    time_window,
    title: str(input.title),
    description: str(input.description),
    why_it_matters: str(input.why_it_matters),
    actionability: str(input.actionability),
    // Derived, always. See INTEGRITY_RESOLUTION.
    resolution_status: 'open',
    provenance: Object.freeze({
      contract_version: INTEGRITY_CONTRACT_VERSION,
      detector: str(input.detector),
      inputs_fingerprint: str(input.inputs_fingerprint) || null,
      // Outside identity by construction: nothing above reads it.
      generated_at: str(input.generated_at) || null,
    }),
  })
}

/**
 * Everything about a finding except when it was produced.
 *
 * The equality two findings are compared by, and what a test asserts on.
 * Exported rather than inlined so a caller cannot accidentally compare
 * whole objects and pick up `generated_at`.
 */
export function integrityIdentity(finding) {
  const f = finding && typeof finding === 'object' ? finding : {}
  return JSON.stringify([
    f.id, f.issue_type, f.severity, f.source_layer,
    arr(f.zone_ids), arr(f.evidence_ids), arr(f.parameter_ids),
    f.time_window || null,
    f.title, f.description, f.why_it_matters,
    f.actionability, f.resolution_status,
  ])
}

/** `defensibility-gaps` / `investigation-gaps` severity, in this vocabulary. */
export const severityFromGap = (sev) => (sev === 'warn' ? 'warning' : 'advisory')

/**
 * `preReviewValidator` severity, in this vocabulary.
 *
 * Declared now and called by nothing: the report-package projection is a
 * later phase, and this is the half of it that has no judgement in it. It
 * is here so the mapping is written down beside the ladder it maps into
 * rather than rediscovered.
 */
export const severityFromPreReview = (sev) => (
  sev === 'blocking' ? 'blocking' : sev === 'warning' ? 'warning' : 'advisory'
)
