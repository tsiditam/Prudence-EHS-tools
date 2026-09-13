/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * What is still worth recording in THIS zone, while the assessor is standing
 * in it.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * AtmosFlow already knew all of this. `evaluateCategorySufficiency` returns
 * the missing inputs per category per zone, and `detectDefensibilityGaps`
 * returns eight evidentiary rules, several of which read raw zone data and
 * need no scoring. Both converge in `buildReadinessVerdict`, which the
 * Readiness panel renders — and that panel mounts only under the Report tab
 * of the results view.
 *
 * So the platform computed "the comparison zone is missing" and "no occupant
 * count was captured" at the moment the assessor could no longer do anything
 * about it: after the visit, at review. The evidence was identified too late
 * to be collected. That is a workflow defect, not a detection one.
 *
 * ── The one rule this module follows ───────────────────────────────────
 * It COMPOSES the existing deterministic layers and adds no judgement of its
 * own. There is no rule here that decides something is missing; every item
 * traces to `sufficiency.js` or `defensibility-gaps.js`, and the `source`
 * field on each item says which. If this file ever starts deciding what
 * counts as a gap, it has become a second opinion beside the two that
 * already exist, and the assessor gets two different answers about
 * completeness on two different screens.
 *
 * That constraint is also what makes a later AI layer safe: an agent that
 * ranks or phrases these items is working from the engine's list, not
 * building its own.
 *
 * Pure, synchronous, and offline — a walkthrough happens inside a building,
 * and an assistant that needs the network is an assistant that is absent
 * exactly when it is needed.
 */

import { evaluateCategorySufficiency } from './sufficiency.js'
import { detectDefensibilityGaps } from './defensibility-gaps.js'

/** The categories `sufficiency.js` declares requirements for. */
const CATEGORIES = ['Ventilation', 'Contaminants', 'HVAC', 'Complaints', 'Environment']

/**
 * Ordering. `required` first because the category cannot be assessed without
 * it; then the evidentiary rules, worst first; then what would merely
 * strengthen the record. Nothing here is a blocker — the assessor owns the
 * decision to leave, and this list never gates anything.
 */
const RANK = { required: 0, warn: 1, info: 2, optional: 3 }

const zoneName = (z, i) => (z && (z.zn || z.zid)) || `Zone ${i + 1}`

/**
 * Gaps for one zone.
 *
 * @param {object} assessment  the live draft: { zones, presurvey, bldg, ... }
 * @param {number} zoneIndex   which zone the assessor is in
 * @returns {Array<{ id, label, why, kind, source, rank }>}
 */
export function zoneGaps(assessment, zoneIndex) {
  const zones = (assessment && assessment.zones) || []
  const zone = zones[zoneIndex]
  if (!zone) return []
  const name = zoneName(zone, zoneIndex)
  const out = []

  // 1. Data completeness, per category, straight from the sufficiency engine.
  //
  // Its `missing` / `unmetOptional` are already reader-facing labels ("CO₂
  // reading"), and its `skipOptionalWhen` already suppresses the complaint
  // follow-ups when there are no complaints — which is the same suppression
  // the question list applies through `cond`, so the two agree without this
  // module restating either.
  for (const category of CATEGORIES) {
    const s = evaluateCategorySufficiency(category, zone)
    for (const label of s.missing || []) {
      out.push({
        id: `req:${category}:${label}`,
        label,
        why: `${category} cannot be assessed without it.`,
        kind: 'required',
        source: 'sufficiency',
        rank: RANK.required,
      })
    }
    for (const label of s.unmetOptional || []) {
      out.push({
        id: `opt:${category}:${label}`,
        label,
        why: `Would strengthen the ${category.toLowerCase()} record.`,
        kind: 'optional',
        source: 'sufficiency',
        rank: RANK.optional,
      })
    }
  }

  // 2. The evidentiary rules, filtered to this zone.
  //
  // `detectDefensibilityGaps` takes the whole assessment and is called with
  // the live draft. The rules that need `zoneScores` simply produce nothing
  // before scoring has run, which is the correct answer mid-walkthrough
  // rather than a special case to write here.
  for (const g of detectDefensibilityGaps(assessment) || []) {
    if (!Array.isArray(g.zones) || !g.zones.includes(name)) continue
    out.push({
      id: `gap:${g.kind}`,
      label: gapLabel(g.kind),
      why: g.why,
      kind: g.severity === 'warn' ? 'warn' : 'info',
      source: 'defensibility',
      rank: g.severity === 'warn' ? RANK.warn : RANK.info,
    })
  }

  const seen = new Set()
  return out
    .filter((g) => (seen.has(g.id) ? false : seen.add(g.id)))
    .sort((a, b) => a.rank - b.rank)
}

/**
 * A short label for a defensibility rule.
 *
 * The rule's own `why` is a paragraph written for the review panel, which is
 * the right length when a reader is deciding whether to issue and the wrong
 * length on a phone in a mechanical room. The `why` is still carried and
 * still shown — this is the line above it.
 *
 * An unmapped kind falls back to the rule id rather than being dropped: a
 * new rule should appear here looking unfinished, not vanish.
 */
function gapLabel(kind) {
  return {
    missing_outdoor_co2: 'Outdoor CO₂ baseline not recorded',
    missing_hvac_status: 'HVAC operating status not recorded',
    missing_occupancy_duration: 'Occupancy and duration not recorded',
    mold_concern_without_moisture: 'Moisture condition not documented',
    complaint_zone_without_comparison: 'No comparison area recorded',
    logger_without_deployment: 'Logger deployment not documented',
    recommendation_without_location: 'Immediate action has no location',
  }[kind] || kind
}

/** How many gaps each zone has, for a list badge. */
export function zoneGapCounts(assessment) {
  const zones = (assessment && assessment.zones) || []
  return zones.map((_, i) => zoneGaps(assessment, i).length)
}
