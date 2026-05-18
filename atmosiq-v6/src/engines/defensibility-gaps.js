/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow Defensibility Gap Detector
 *
 * Pure inspector function — walks the assessment state and emits a
 * list of soft "evidentiary-context" gaps the existing engine doesn't
 * already flag as findings. Distinct from the finalization gate in
 * validation.js (which blocks finalization on hard completeness rules)
 * and from CIH report-content validation (which checks the rendered
 * report). This layer catches things that don't block finalization
 * but DO reduce the defensibility of an interpretation under review.
 *
 * Engine-sacred boundary: this file is new alongside validation.js;
 * it imports nothing from src/engine/* or src/engines/scoring.js,
 * does not modify scoring contracts, and emits no findings. The
 * gap entries it returns are advisory — surfaced in the Readiness
 * panel for the assessor to resolve or disclose as limitations.
 *
 * Each gap has the shape:
 *   {
 *     kind: string,           // stable id, used by the UI to render copy
 *     severity: 'info' | 'warn',
 *     zones?: string[],       // zones affected (if zone-scoped)
 *     count?: number,         // count of items (if quantitative)
 *     why: string,            // short defensibility rationale + citation
 *   }
 *
 * Adding a rule: write a small pure helper that returns 0..1 gap
 * objects, register it in the GAP_RULES array. No threshold constants
 * — defensibility rules are binary (present or missing), not graded.
 */

// ── Internal helpers ───────────────────────────────────────────────

function isEmpty(value) {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function zonesWith(zones, predicate) {
  const out = []
  for (const z of zones || []) {
    if (predicate(z)) out.push(z.zn || z.zid || '(unnamed zone)')
  }
  return out
}

function moldComplaintFlagged(zone) {
  if (!zone) return false
  // Mold indicator field non-empty and not a "none" answer; OR a musty
  // odor type was selected.
  const mi = (zone.mi || '').toString().trim().toLowerCase()
  if (mi && mi !== 'none' && mi !== 'no' && !mi.startsWith('not ')) return true
  const ot = Array.isArray(zone.ot) ? zone.ot : []
  if (ot.some((t) => /must|earth|mold|mildew/i.test(String(t)))) return true
  return false
}

function moistureEvidencePresent(zone, presurvey) {
  if (!zone) return false
  const wd = (zone.wd || '').toString().trim().toLowerCase()
  if (wd && wd !== 'none' && wd !== 'no' && !wd.startsWith('not ')) return true
  const wl = Array.isArray(zone.wl) ? zone.wl : []
  if (wl.length > 0) return true
  // Building-wide water detail recorded in presurvey is also evidence.
  const psw = presurvey ? (presurvey.ps_water_detail || '').toString().trim() : ''
  if (psw.length > 0) return true
  return false
}

function symptomaticZone(zoneScore) {
  if (!zoneScore || !zoneScore.cats) return false
  return zoneScore.cats.some((c) =>
    (c.r || []).some(
      (r) =>
        typeof r.t === 'string' &&
        /symptom|occupant|complaint|headache|irritation|fatigue/i.test(r.t),
    ),
  )
}

// ── Individual gap rules ───────────────────────────────────────────

function ruleMissingOutdoorCo2(assessment) {
  const zones = assessment.zones || []
  const affected = zonesWith(zones, (z) => !isEmpty(z.co2) && isEmpty(z.co2o))
  if (affected.length === 0) return []
  return [
    {
      kind: 'missing_outdoor_co2',
      severity: 'warn',
      zones: affected,
      why:
        'Indoor CO₂ was recorded without a paired outdoor baseline. The diagnostic ' +
        'indicator for under-ventilation is the indoor-outdoor differential, not the ' +
        'absolute number — interpretation without a baseline carries reduced ' +
        'evidentiary weight (ASHRAE 62.1-2025 §7.2.2; Persily 2021).',
    },
  ]
}

function ruleMissingHvacStatus(assessment) {
  const zones = assessment.zones || []
  const anyCo2 = zones.some((z) => !isEmpty(z.co2))
  if (!anyCo2) return []
  const building = assessment.building || {}
  // No HVAC type captured at the building level means we can't reason
  // about whether the CO₂ reading reflects equipment status. Operating-
  // status notes can also be in per-zone `meas_conditions`; require at
  // least one of: building.ht OR every CO₂-bearing zone has meas_conditions.
  const buildingHasHvac = !isEmpty(building.ht)
  if (buildingHasHvac) {
    const co2Zones = zones.filter((z) => !isEmpty(z.co2))
    const missingMeasConditions = co2Zones
      .filter((z) => isEmpty(z.meas_conditions))
      .map((z) => z.zn || z.zid || '(unnamed zone)')
    if (missingMeasConditions.length === 0) return []
    return [
      {
        kind: 'missing_hvac_status',
        severity: 'info',
        zones: missingMeasConditions,
        why:
          'CO₂ readings were recorded but the HVAC operating-status note ' +
          '(meas_conditions) for these zones is blank. Under review, ' +
          'an examiner can\'t tell whether the reading was taken with the ' +
          'system in normal operation, on bypass, or off.',
      },
    ]
  }
  // Building-level HVAC type itself missing — broader gap, applies to all CO₂ zones.
  return [
    {
      kind: 'missing_hvac_status',
      severity: 'warn',
      zones: zones.filter((z) => !isEmpty(z.co2)).map((z) => z.zn || z.zid || '(unnamed zone)'),
      why:
        'Indoor CO₂ readings were taken without recording the building HVAC ' +
        'system type (presurvey.ht). Without operating-status context the ' +
        'CO₂ value can\'t be tied back to ventilation performance — a ' +
        'reviewer can\'t reconstruct whether the system was running normally ' +
        'or not.',
    },
  ]
}

function ruleMissingOccupancyDuration(assessment) {
  const zones = assessment.zones || []
  const zoneScores = assessment.zoneScores || []
  const out = []
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i]
    if (!symptomaticZone(zoneScores[i])) continue
    const missingDuration = isEmpty(z.meas_duration)
    const missingOcc = isEmpty(z.meas_occ)
    if (missingDuration || missingOcc) {
      out.push(z.zn || z.zid || `zone ${i + 1}`)
    }
  }
  if (out.length === 0) return []
  return [
    {
      kind: 'missing_occupancy_duration',
      severity: 'warn',
      zones: out,
      why:
        'These zones reported occupant symptoms but the measurement duration ' +
        'and/or occupancy condition (meas_duration / meas_occ) was not recorded. ' +
        'Without dwell time and occupancy density, exposure-to-symptom inference ' +
        'is qualitative-only and weakens under review.',
    },
  ]
}

function ruleMoldConcernWithoutMoisture(assessment) {
  const zones = assessment.zones || []
  const presurvey = assessment.presurvey || null
  const flagged = []
  for (const z of zones) {
    if (!moldComplaintFlagged(z)) continue
    if (moistureEvidencePresent(z, presurvey)) continue
    flagged.push(z.zn || z.zid || '(unnamed zone)')
  }
  if (flagged.length === 0) return []
  return [
    {
      kind: 'mold_concern_without_moisture',
      severity: 'warn',
      zones: flagged,
      why:
        'Mold or musty-odor indicators were captured for these zones but no ' +
        'moisture source, leak history, or water-damage location was recorded. ' +
        'IICRC S520 expects moisture-pathway documentation alongside mold ' +
        'observations; absence of either creates a gap an examiner will flag.',
    },
  ]
}

function ruleRecommendationWithoutLocation(assessment) {
  const recs = assessment.recs || {}
  const imm = Array.isArray(recs.imm) ? recs.imm : []
  const offenders = imm.filter((r) => {
    if (!r || typeof r !== 'object') return true
    // Per the platform's defensibility primitive: every Immediate-priority
    // recommendation must populate at least one of zone / system /
    // surface_or_asset / free_text. The shipped recs shape uses `zone`
    // for the location string; system / surface / free_text are
    // forward-compat fields. A rec with all of them empty is a gap.
    const hasZone = !isEmpty(r.zone)
    const hasSystem = !isEmpty(r.system)
    const hasSurface = !isEmpty(r.surface_or_asset)
    const hasFreeText = !isEmpty(r.free_text)
    return !(hasZone || hasSystem || hasSurface || hasFreeText)
  })
  if (offenders.length === 0) return []
  return [
    {
      kind: 'recommendation_without_location',
      severity: 'warn',
      count: offenders.length,
      why:
        'Immediate-priority recommendations should each name a location (zone, ' +
        'system, surface/asset, or a free-text scope). Unlocated immediate ' +
        'actions are ambiguous on remediation and erode the defensibility of ' +
        'the action set under review.',
    },
  ]
}

function ruleQualitativeOnlyPropagated(assessment) {
  const zoneScores = assessment.zoneScores || []
  let count = 0
  for (const zs of zoneScores) {
    for (const c of zs.cats || []) {
      for (const r of c.r || []) {
        if (r && r.qualitative_only === true) count++
        else if (r && r.confidenceTier === 'qualitative_only') count++
      }
    }
  }
  if (count === 0) return []
  return [
    {
      kind: 'qualitative_only_propagated',
      severity: 'info',
      count,
      why:
        'These findings are flagged qualitative-only — they were derived from ' +
        'instruments that aren\'t in the accuracy database or are missing a ' +
        'calibration record. The flag is informational, not a blocker, but the ' +
        'rendered report carries it forward into each finding\'s presentation.',
    },
  ]
}

const GAP_RULES = [
  ruleMissingOutdoorCo2,
  ruleMissingHvacStatus,
  ruleMissingOccupancyDuration,
  ruleMoldConcernWithoutMoisture,
  ruleRecommendationWithoutLocation,
  ruleQualitativeOnlyPropagated,
]

/**
 * detectDefensibilityGaps(assessment) -> Array<Gap>
 *
 * Pure: same input → same output. No I/O, no engine writes. Safe to
 * call repeatedly from the Readiness panel and from the chat agent's
 * context builder.
 */
export function detectDefensibilityGaps(assessment) {
  if (!assessment || typeof assessment !== 'object') return []
  const out = []
  for (const rule of GAP_RULES) {
    try {
      const gaps = rule(assessment) || []
      for (const g of gaps) out.push(g)
    } catch {
      // A defensive guard so one malformed assessment field can't crash
      // the whole readiness pipeline. The Readiness panel surfaces a
      // generic "couldn't fully analyze" hint at a layer above.
      continue
    }
  }
  return out
}

// Test hook — export individual rule fns so test fixtures can target
// one rule at a time without having to satisfy every other rule's
// happy path.
export const __test = {
  ruleMissingOutdoorCo2,
  ruleMissingHvacStatus,
  ruleMissingOccupancyDuration,
  ruleMoldConcernWithoutMoisture,
  ruleRecommendationWithoutLocation,
  ruleQualitativeOnlyPropagated,
}
