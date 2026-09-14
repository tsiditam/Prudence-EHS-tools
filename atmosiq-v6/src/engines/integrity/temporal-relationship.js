/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Cross-evidence reconciliation: a reported complaint period against when
 * a logger pattern actually occurred.
 *
 * The question is narrow and entirely observational. Occupants report
 * feeling worst in the afternoon; a recurring pattern peaks in the
 * afternoon on five of six monitored days. Those two facts agree in time.
 * That is the whole claim, and this module makes no other.
 *
 * ── It does not guess which room the logger was in ─────────────────────
 * A complaint lives on a walkthrough zone and a pattern lives on a logger
 * dataset. Matching them on labels would close that gap and must not: a
 * silent wrong join attributes another room's pattern to this complaint
 * and reads as evidence rather than as the guess it is.
 *
 * A dataset may now carry an explicit `zoneId`, and association is resolved
 * PER DATASET rather than once for the run. Three datasets each linked to
 * their own zone is not ambiguous, it is three answers, and a session that
 * says so should get all three.
 *
 * The order is explicit, then legacy, and the two never mix:
 *
 *   • ANY dataset carrying a link puts the record in explicit mode, and the
 *     legacy rule is off. A record that has started naming associations is
 *     not a record we should still be inferring them for.
 *   • A pattern is reconciled against the zone its datasets are linked to.
 *     Datasets carrying no link contribute no zone, which is why an
 *     indoor/outdoor comparison is not a conflict: the outdoor baseline is
 *     not a room and never carries one.
 *   • Datasets linked to DIFFERENT zones make that ONE PATTERN
 *     `conflicting_zone_associations`. The rest of the run is unaffected.
 *   • A link naming a zone that no longer exists is dangling, and it
 *     SUPPRESSES the legacy fallback rather than falling through to it.
 *     Reattaching the dataset to whichever zone happens to survive would
 *     turn an explicit statement into a different one behind the
 *     assessor's back.
 *   • No link anywhere is a legacy record, where exactly one zone and
 *     exactly one indoor dataset is still treated as unambiguous.
 *
 * ── Eligibility is a property of the occurrences, not the kind ─────────
 * What makes a pattern comparable is whether its windows can discriminate
 * a time of day. A recurring cycle carries one window per agreeing day and
 * qualifies by construction. A window spanning a full day or more cannot
 * fall inside a part of the day at all, so it is dropped: an indoor/outdoor
 * comparison covering the whole run would otherwise "overlap" every period
 * ever reported, which is agreement with nothing behind it.
 *
 * `occupancy_comparison` is excluded by kind, and it is the one exclusion
 * that needs stating: its windows describe the occupancy SCHEDULE rather
 * than something that happened, so comparing them to a complaint period
 * tests the schedule against itself.
 *
 * ── The comparison is distributional ───────────────────────────────────
 * A complaint reports a habit and carries no date. So the question is not
 * whether one window overlaps one instant; it is on how many of the days a
 * pattern occurred, it occurred in the reported period. Majority agrees,
 * none disagrees, and anything between says so rather than rounding itself
 * toward whichever answer is closer.
 *
 * ── Temporal agreement is not relevance, and neither is causation ──────
 * Whether the parameter bears on an explanation the investigation is
 * actually entertaining is a SEPARATE axis, read off the live differentials
 * through the engine's own `RULE_PARAMETERS`. An overlap with no live
 * differential is equally real and is simply not elevated into an
 * explanation. Nothing here, on either axis, says one thing caused
 * another: two things happening at the same time of day is a fact about
 * two clocks.
 */

import { evidenceRelationship } from './relationship.js'
import { COMPLAINT_PERIOD_HOURS } from './forensic-evidence.js'
import { RULE_PARAMETERS, LIVE_HYPOTHESIS_STATUSES } from '../../engine/investigation.js'

/** Stable detector name. Part of every id this module mints. */
export const DETECTOR = 'complaint_period_vs_occurrences'

/** The `cx` value that means this zone has occupant complaints. */
export const COMPLAINTS_REPORTED = 'Yes — complaints reported'

/** The `sy_time` answers that name a period, from the shared vocabulary. */
export const TIME_LINKED_PERIODS = Object.freeze(Object.keys(COMPLAINT_PERIOD_HOURS))

/**
 * Kinds whose occurrence windows describe something other than an
 * observation, and so cannot be reconciled against a report of one.
 */
export const EXCLUDED_KINDS = Object.freeze(['occupancy_comparison'])

/**
 * A window this long carries no time-of-day information: it covers every
 * part of the day, so it agrees with every period by construction. Unitless
 * in the sense that matters — it is a property of the clock, not of any
 * measurement — and exported so a test can state it.
 */
export const MAX_DISCRIMINATING_WINDOW_MS = 24 * 3600_000

/**
 * Floors, both expressed in DAYS because a time-of-day claim is a claim
 * about repetition. One day cannot establish when something usually
 * happens, whatever else it shows.
 */
export const MIN_MONITORED_DAYS = 2
export const MIN_OCCURRENCE_DAYS = 2

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** Site-local calendar day for an instant. Offset-pure, never the host clock. */
const localDay = (t, offsetMin) => Math.floor((t + (offsetMin || 0) * 60000) / 86400000)
/** Site-local hour for an instant. */
const localHour = (t, offsetMin) => ((Math.floor((t + (offsetMin || 0) * 60000) / 3600000) % 24) + 24) % 24

/** Is this local hour inside a range that may wrap past midnight? */
function inRange(hour, range) {
  if (!isNum(hour) || !range) return false
  const [from, to] = range
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

/**
 * The LEGACY association, for a record that names none of its own.
 *
 * One zone and one indoor dataset leaves nothing to get wrong. Anything
 * else was a guess, and a guess here is indistinguishable from evidence
 * once it is rendered. Unchanged from the rule that shipped before
 * datasets could carry a link, and reached only when none of them does.
 */
export function resolveAssociation(zones, bundle) {
  const zs = arr(zones)
  const indoor = arr(obj(bundle).datasets).filter((d) => obj(d).role === 'indoor')
  if (zs.length !== 1 || indoor.length !== 1) return null
  return { zone: zs[0], zoneIndex: 0, datasetId: obj(indoor[0]).id || null }
}

/**
 * Roles that may name a zone. An outdoor baseline is not a room in the
 * building, so it never carries one and never contributes to a conflict.
 */
export const LINKABLE_ROLES = Object.freeze(['indoor', 'zone'])

/**
 * Every dataset's explicit link, resolved against the zones that exist.
 *
 * `explicit` is the mode switch: once ANY dataset names a zone, the record
 * is describing its own associations and the legacy inference is off for
 * all of it, including datasets that have not been linked yet. Mixing the
 * two would mean a half-linked record silently inferred the other half.
 *
 * @returns {{explicit:boolean, byDataset:Map<string,{zone:object|null, dangling:boolean}>}}
 */
export function datasetZoneLinks(zones, bundle) {
  const byId = new Map(arr(zones).filter((z) => str(obj(z).zid)).map((z) => [str(z.zid), z]))
  const byDataset = new Map()
  let explicit = false
  arr(obj(bundle).datasets).forEach((d) => {
    const ds = obj(d)
    const id = str(ds.id)
    const linked = str(ds.zoneId)
    if (!id || !linked || !LINKABLE_ROLES.includes(ds.role)) return
    explicit = true
    const zone = byId.get(linked) || null
    byDataset.set(id, { zone, dangling: !zone })
  })
  return { explicit, byDataset }
}

/**
 * The zone ONE pattern is about, or the reason it cannot be settled.
 *
 * Only the pattern's own datasets are consulted, which is what makes three
 * separately linked datasets three answers rather than one ambiguity.
 *
 * @returns {{zone:object}|{reason:string}}
 */
export function zoneForPattern(pattern, links, legacy) {
  const datasetIds = arr(obj(pattern).datasetIds).map(str).filter(Boolean)
  if (!links || !links.explicit) {
    return legacy
      ? { zone: legacy.zone, datasetIds: [legacy.datasetId].filter(Boolean) }
      : { reason: 'no_unambiguous_zone_dataset_association' }
  }

  const resolved = datasetIds
    .map((id) => ({ id, link: links.byDataset.get(id) }))
    .filter((r) => r.link)
  // A link pointing at a deleted zone is the assessor's statement with its
  // subject removed. It is never silently replaced by another zone.
  if (resolved.some((r) => r.link.dangling)) return { reason: 'associated_zone_no_longer_exists' }

  const zones = [...new Set(resolved.map((r) => r.link.zone).filter(Boolean))]
  if (zones.length === 1) {
    // The datasets that CARRIED the association, which is what a parameter id
    // may be drawn from. An outdoor baseline holds no link and so is absent
    // here, exactly as it was under the legacy rule.
    return { zone: zones[0], datasetIds: resolved.filter((r) => r.link.zone === zones[0]).map((r) => r.id) }
  }
  // More than one room, so no single reported period applies to it.
  if (zones.length > 1) return { reason: 'conflicting_zone_associations' }
  // Explicit mode, but nothing this pattern rests on has been linked yet.
  return { reason: 'no_unambiguous_zone_dataset_association' }
}

/**
 * Parameters that bear on at least one differential still in play.
 *
 * Read through the engine's own rule-to-parameter map. Returns null when
 * there is no investigation state to ask, which is `unknown` rather than
 * `not_linked` — no differential is not the same as a differential that
 * does not name this parameter.
 */
export function liveDifferentialParameters(investigation) {
  const hyps = arr(obj(investigation).hypotheses)
  if (!obj(investigation).hypotheses) return null
  const live = new Set(LIVE_HYPOTHESIS_STATUSES)
  const out = new Set()
  hyps.forEach((h) => {
    if (!live.has(obj(h).status)) return
    arr(RULE_PARAMETERS[obj(h).ruleKey]).forEach((p) => out.add(p))
  })
  return out
}

/** The windows of one pattern that can discriminate a time of day. */
function discriminatingWindows(pattern) {
  if (EXCLUDED_KINDS.includes(obj(pattern).kind)) return []
  return arr(obj(pattern).occurrenceWindows).filter((w) => {
    if (!w || !isNum(w.start)) return false
    const end = isNum(w.end) ? w.end : w.start
    return end - w.start < MAX_DISCRIMINATING_WINDOW_MS
  })
}

/** How many distinct local days the run covered. */
function monitoredDays(bundle, offsetMin) {
  const p = obj(obj(bundle).period)
  if (!isNum(p.start) || !isNum(p.end)) return 0
  return localDay(p.end, offsetMin) - localDay(p.start, offsetMin) + 1
}

/**
 * Reconcile every eligible pattern against the complaint period of the zone
 * that PATTERN's own datasets are associated with.
 *
 * Pure and synchronous. Returns [] when no zone reports complaints — a
 * session with no occupant reports has no question to answer, and emitting
 * "insufficient" for it would be noise rather than information.
 *
 * A pattern resolving to a zone that reports NOTHING is skipped for the same
 * reason, which is a consequence of per-dataset association rather than a new
 * rule: once three loggers name three rooms, a pattern in a quiet room is
 * simply not part of this question. A pattern whose zone cannot be settled
 * still gets a row, because the session does carry complaints and the
 * unresolved link is the thing worth knowing about it.
 *
 * @param {object} input
 * @param {Array} input.zones the walkthrough zones
 * @param {object|null} input.forensics a BUILT forensic bundle, read-only
 * @param {object|null} [input.investigation] the derived investigation state
 * @param {string} [input.generatedAt] ISO. Provenance only, never identity.
 * @returns {object[]} at most one relationship per pattern
 */
export function detectTemporalRelationships(input = {}) {
  const zones = arr(input.zones)
  const bundle = obj(input.forensics)
  const patterns = arr(bundle.patterns)
  if (!patterns.length) return []

  // Nothing to reconcile without a complaint. Not an insufficiency: there
  // is no question here, rather than a question we cannot answer.
  const hasComplaint = (z) => str(obj(z).cx) === COMPLAINTS_REPORTED
  if (!zones.some(hasComplaint)) return []

  const offsetMin = isNum(obj(bundle.context).utcOffsetMin) ? obj(bundle.context).utcOffsetMin : 0
  const livingParams = liveDifferentialParameters(input.investigation)
  const fingerprint = str(bundle.fingerprint) || null
  const monitored = monitoredDays(bundle, offsetMin)

  const relevanceFor = (param) => {
    if (livingParams === null) return 'unknown'
    return livingParams.has(param) ? 'linked_to_live_differential' : 'not_linked_to_live_differential'
  }

  // Explicit links decide the whole record once any dataset carries one. The
  // legacy inference is BUILT only when none does, so it cannot be reached by
  // accident from a half-linked session.
  const links = datasetZoneLinks(zones, bundle)
  const legacy = links.explicit ? null : resolveAssociation(zones, bundle)

  const out = []
  patterns.forEach((p) => {
    const param = arr(obj(p).params)[0] || null
    const association = zoneForPattern(p, links, legacy)

    if (!association.zone) {
      out.push(evidenceRelationship({
        detector: DETECTOR,
        subject: obj(p).id,
        relationship: 'insufficient_temporal_evidence',
        reason: association.reason,
        relevance: relevanceFor(param),
        param,
        // No period is quoted: without knowing which zone the logger
        // describes, naming one zone's reported period beside another zone's
        // pattern is the association guess by other means.
        reported_period: null,
        zone_ids: [],
        evidence_ids: [obj(p).id],
        inputs_fingerprint: fingerprint,
        generated_at: input.generatedAt,
      }))
      return
    }

    const zone = obj(association.zone)
    // This pattern's room reports nothing. There is no question about it, so
    // it gets no answer rather than an insufficiency about a question that
    // was never asked.
    if (!hasComplaint(zone)) return

    const zoneId = str(zone.zid) || 'zone-1'
    const period = str(zone.sy_time)
    const complaintEvidence = [`fld-${zoneId}-cx`, `fld-${zoneId}-sy_time`]

    if (!TIME_LINKED_PERIODS.includes(period)) {
      out.push(evidenceRelationship({
        detector: DETECTOR,
        subject: obj(p).id,
        relationship: 'insufficient_temporal_evidence',
        reason: 'complaint_has_no_specific_period',
        relevance: relevanceFor(param),
        param,
        reported_period: null,
        zone_ids: [zoneId],
        evidence_ids: [...complaintEvidence, obj(p).id],
        inputs_fingerprint: fingerprint,
        generated_at: input.generatedAt,
      }))
      return
    }

    const range = COMPLAINT_PERIOD_HOURS[period]
    const windows = discriminatingWindows(p)
    // Drawn only from the datasets that carry the association, so an
    // indoor/outdoor comparison never files the outdoor baseline's parameter
    // under the room's complaint.
    const zoneDatasetIds = arr(association.datasetIds)
    const parameterIds = arr(bundle.parameters)
      .filter((q) => obj(q).param === param && zoneDatasetIds.includes(obj(q).datasetId))
      .map((q) => obj(q).id)
      .filter(Boolean)

    const base = {
      detector: DETECTOR,
      subject: obj(p).id,
      relevance: relevanceFor(param),
      param,
      reported_period: period,
      zone_ids: [zoneId],
      parameter_ids: parameterIds,
      evidence_ids: [...complaintEvidence, obj(p).id, ...windows.map((w) => w.id).filter(Boolean)],
      inputs_fingerprint: fingerprint,
      generated_at: input.generatedAt,
    }

    if (!windows.length) {
      out.push(evidenceRelationship({
        ...base,
        relationship: 'insufficient_temporal_evidence',
        reason: 'no_eligible_occurrences',
        observed_days: { monitored, withOccurrence: 0, inPeriod: 0 },
      }))
      return
    }

    // Distinct DAYS, not windows: two occurrences on one afternoon are one
    // day's worth of evidence about when this usually happens.
    const occurrenceDays = new Set()
    const inPeriodDays = new Set()
    windows.forEach((w) => {
      const end = isNum(w.end) ? w.end : w.start
      const day = localDay(w.start, offsetMin)
      occurrenceDays.add(day)
      // Either end inside the period counts, so a window straddling a
      // boundary is not forced out of the period by a minute.
      if (inRange(localHour(w.start, offsetMin), range) || inRange(localHour(end, offsetMin), range)) {
        inPeriodDays.add(day)
      }
    })

    const observed_days = {
      monitored,
      withOccurrence: occurrenceDays.size,
      inPeriod: inPeriodDays.size,
    }

    if (monitored < MIN_MONITORED_DAYS) {
      out.push(evidenceRelationship({ ...base, relationship: 'insufficient_temporal_evidence', reason: 'insufficient_monitored_days', observed_days }))
    } else if (occurrenceDays.size < MIN_OCCURRENCE_DAYS) {
      out.push(evidenceRelationship({ ...base, relationship: 'insufficient_temporal_evidence', reason: 'insufficient_occurrence_days', observed_days }))
    } else if (inPeriodDays.size === 0) {
      // None of the days it occurred fell in the reported period. Mismatch is
      // a strong word, so it takes none rather than few.
      out.push(evidenceRelationship({ ...base, relationship: 'temporal_mismatch', observed_days }))
    } else if (inPeriodDays.size * 2 > occurrenceDays.size) {
      // A strict majority, the same shape `requiredCycleDays` already uses for
      // deciding that a cycle recurs at all.
      out.push(evidenceRelationship({ ...base, relationship: 'temporal_overlap', observed_days }))
    } else {
      // Some days yes, some no, in no majority either way. Saying overlap
      // here would be rounding toward whichever answer is closer.
      out.push(evidenceRelationship({ ...base, relationship: 'insufficient_temporal_evidence', reason: 'indeterminate_period_distribution', observed_days }))
    }
  })

  return out
}

/** The relationships of a session, keyed by the pattern each is about. */
export function relationshipsByPattern(relationships) {
  const map = new Map()
  arr(relationships).forEach((r) => { if (obj(r).subject) map.set(r.subject, r) })
  return map
}
