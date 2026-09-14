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
import { detectComplaintContextGaps, asZoneGapLine } from './integrity/context-gaps.js'

/** The categories `sufficiency.js` declares requirements for. */
const CATEGORIES = ['Ventilation', 'Contaminants', 'HVAC', 'Complaints', 'Environment']

/**
 * Ordering. `required` first because the category cannot be assessed without
 * it; then the evidentiary rules, worst first; then what would merely
 * strengthen the record. Nothing here is a blocker — the assessor owns the
 * decision to leave, and this list never gates anything.
 */
const RANK = { required: 0, warn: 1, info: 2, optional: 3 }

/**
 * Should the zone-complete sheet interrupt with the gap list at all?
 *
 * A workflow question, not a gap question. `zoneGaps` is unchanged and still
 * returns every gap it found, `optional` ones included; the review surfaces
 * that read the record at the end — the Readiness panel, by its own
 * `buildReadinessVerdict` path — are untouched and still list them. This only
 * decides whether the list is worth stopping a walkthrough for.
 *
 * It is not, when the only thing left is `optional`. Those are the extras
 * that would strengthen an already-adequate record (an air-change rate, a
 * formaldehyde reading), and a thoroughly recorded zone still produces a
 * couple of them — so without this gate the sheet greets the assessor who
 * did everything right exactly as it greets the one who missed a required
 * reading, and stops meaning anything.
 *
 * Only `optional` is silent, rather than listing the kinds that speak. A kind
 * added later should interrupt until someone decides it shouldn't, the same
 * way `gapLabel` shows an unmapped rule rather than dropping it: the failure
 * that costs an assessor a reading is the one nobody saw.
 */
export function interruptsZoneCompletion(gaps) {
  return (gaps || []).some((g) => g && g.kind !== 'optional')
}

// By name or position, never by `zid`: the id is an opaque handle every
// zone carries, not a label.
const zoneName = (z, i) => (z && z.zn) || `Zone ${i + 1}`

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

  // The record sufficiency is evaluated against is `{ ...bldg, ...zone }`,
  // exactly as `scoreZone` builds it (scoring.js: `const d = { ...bldg, ...z }`).
  //
  // Several inputs sufficiency asks for are BUILDING-scoped — `od` (the OA
  // damper status that satisfies Ventilation's `altRequired`), `sa`, and
  // HVAC's `hm` / `fc`. Reading the bare zone made every one of them look
  // absent, so this panel would tell an assessor to record a damper status
  // the building record already held, while scoring counted it as present.
  // Two surfaces, one question, two answers — which is the failure this
  // module exists to avoid, committed by the module itself.
  const effective = { ...(assessment.bldg || assessment.building || {}), ...zone }

  // The rules read `assessment.building`; the live walkthrough draft carries
  // the same record as `bldg` and only the finalized report renames it
  // (`building: bldg`). Normalized here so a caller cannot pass the draft and
  // silently get a rule evaluated against an empty building.
  const forRules = { ...assessment, building: assessment.building || assessment.bldg || {} }

  // 1. Data completeness, per category, straight from the sufficiency engine.
  //
  // Its `missing` / `unmetOptional` are already reader-facing labels ("CO₂
  // reading"), and its `skipOptionalWhen` already suppresses the complaint
  // follow-ups when there are no complaints — which is the same suppression
  // the question list applies through `cond`, so the two agree without this
  // module restating either.
  for (const category of CATEGORIES) {
    const s = evaluateCategorySufficiency(category, effective)
    for (const label of s.missing || []) {
      out.push({
        id: `req:${category}:${label}`,
        label,
        // Not "cannot be assessed without it". This surface is advisory and
        // gates nothing; the assessor decides when a zone is done. Wording
        // that reads like a blocker on a screen that blocks nothing teaches
        // people to dismiss it.
        why: `Needed for a complete ${category.toLowerCase()} assessment.`,
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
  for (const g of detectDefensibilityGaps(forRules) || []) {
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

/**
 * Integrity findings for one zone, as lines for the same sheet.
 *
 * A SEPARATE list from `zoneGaps`, deliberately, and the separation is the
 * whole design rather than a tidiness preference.
 *
 * `interruptsZoneCompletion` treats every gap whose kind is not `optional`
 * as reason to stop the assessor, so folding an integrity finding into
 * `zoneGaps` would make an advisory finding gate zone completion — new
 * blocking behavior, on a surface that has none today, from a detector
 * whose whole point is that it is advisory. Returning it beside the gaps
 * lets the sheet show both while `interruptsZoneCompletion` keeps reading
 * exactly the list it always read.
 *
 * This file still composes rather than judges: the rule lives in
 * `integrity/context-gaps.js`, the same relationship `zoneGaps` has with
 * `sufficiency.js` and `defensibility-gaps.js`.
 *
 * @param {object} assessment the live draft
 * @param {number} zoneIndex
 * @param {object} [opts] forwarded to the detector; `forensics` is an
 *   optional built bundle, absent on the walkthrough path
 * @returns {Array<{ id, label, why }>}
 */
export function zoneIntegrityFindings(assessment, zoneIndex, opts = {}) {
  const zones = (assessment && assessment.zones) || []
  const zone = zones[zoneIndex]
  if (!zone) return []
  // The detector reads the whole assessment and tags each finding with the
  // zone it concerns, the same shape `detectDefensibilityGaps` returns and
  // the same reason: a rule may need to see the other zones to judge one.
  const key = (zone.zid && String(zone.zid)) || `zone-${zoneIndex + 1}`
  return detectComplaintContextGaps(assessment, { onSite: true, ...opts })
    .filter((f) => (f.zone_ids || []).includes(key))
    .map(asZoneGapLine)
}
