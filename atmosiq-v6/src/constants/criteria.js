/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * criteria — what a published threshold MEANS, not just what it equals.
 *
 * `standards.js` holds the numbers. This holds everything a number needs in
 * order to be compared honestly: the averaging period it is defined over, the
 * kinds of measurement that can legitimately evaluate it, the class of
 * criterion it is, and its citation. Threshold, averaging period, source and
 * applicability travel together or not at all.
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * Scoring compared raw numbers and hard-coded a severity at each branch. Three
 * defects followed from that single omission, and they are the same defect:
 *
 *   1. An 8-hour TWA was compared against a grab reading and reported as an
 *      exceedance. A PEL cannot be exceeded by an instantaneous measurement —
 *      the comparison is a category error, not a conservative approximation.
 *   2. Short-duration criteria that a walkthrough CAN legitimately evaluate —
 *      the NIOSH CO ceiling, the OSHA formaldehyde STEL — were absent, because
 *      nothing recorded that a ceiling is instantaneous by definition.
 *   3. CO₂ at 1,500 ppm was rated `critical`, the same severity as an
 *      explosive-limit hydrogen reading, because severity was a literal at the
 *      comparison site rather than a property of the criterion's class.
 *
 * ── Relationship to the rest of the system ─────────────────────────────
 * This is the shared layer under two consumers that previously had no common
 * ground: `engines/scoring.js` (walkthrough grab readings) and
 * `utils/referenceProfiles.js` (Logger Studio time series). It introduces no
 * new values — every `resolve` reads `STD` — and no new averaging vocabulary:
 * `evaluableBy` is expressed in the engine's own `EvidenceBasisKind` terms.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { STD } from './standards'

// ── Averaging periods ──────────────────────────────────────────────────
//
// `determinativeFrom` lists the evidence bases that can SETTLE the comparison.
// `indicativeFrom` lists those where an exceedance is meaningful but not
// determinative — a single reading over a 15-minute STEL is strong evidence
// the STEL was exceeded, and still is not a STEL measurement.

export const AVERAGING = {
  ceiling: {
    id: 'ceiling',
    label: 'ceiling',
    phrase: 'a ceiling value, not to be exceeded at any time',
    determinativeFrom: ['screening_grab', 'screening_continuous', 'documented_8hr_twa'],
    indicativeFrom: [],
  },
  instantaneous: {
    id: 'instantaneous',
    label: 'instantaneous',
    phrase: 'an instantaneous value',
    determinativeFrom: ['screening_grab', 'screening_continuous', 'documented_8hr_twa'],
    indicativeFrom: [],
  },
  min15: {
    id: 'min15',
    label: '15-minute',
    phrase: 'a 15-minute short-term exposure limit',
    determinativeFrom: ['screening_continuous', 'documented_8hr_twa'],
    indicativeFrom: ['screening_grab'],
  },
  min30: {
    id: 'min30',
    label: '30-minute',
    phrase: 'a 30-minute average',
    determinativeFrom: ['screening_continuous', 'documented_8hr_twa'],
    indicativeFrom: ['screening_grab'],
  },
  hour1: {
    id: 'hour1',
    label: '1-hour',
    phrase: 'a 1-hour average',
    determinativeFrom: ['screening_continuous', 'documented_8hr_twa'],
    indicativeFrom: ['screening_grab'],
  },
  hour8: {
    id: 'hour8',
    label: '8-hour TWA',
    phrase: 'an 8-hour time-weighted average',
    determinativeFrom: ['documented_8hr_twa'],
    indicativeFrom: ['screening_continuous'],
  },
  hour10: {
    id: 'hour10',
    label: '10-hour TWA',
    phrase: 'a 10-hour time-weighted average',
    determinativeFrom: ['documented_8hr_twa'],
    indicativeFrom: ['screening_continuous'],
  },
  hour24: {
    id: 'hour24',
    label: '24-hour',
    phrase: 'a 24-hour average',
    determinativeFrom: ['documented_8hr_twa'],
    indicativeFrom: ['screening_continuous'],
  },
  annual: {
    id: 'annual',
    label: 'annual',
    phrase: 'an annual mean',
    determinativeFrom: [],
    indicativeFrom: [],
  },
}

// ── Criterion classes ──────────────────────────────────────────────────
//
// `maxSeverity` is the ceiling a criterion of this class may ever produce.
// It is what stops a ventilation indicator being rated like a combustion
// hazard: CO₂ indexes outdoor-air delivery per occupant and is not a
// contaminant measure, so no CO₂ concentration alone is a critical finding.

export const CRITERION_CLASS = {
  physical_hazard: {
    id: 'physical_hazard',
    label: 'physical hazard threshold',
    maxSeverity: 'critical',
    framing: 'A physical hazard threshold (flammability, oxygen displacement). Exceedance is an immediate life-safety concern.',
  },
  regulatory_oel: {
    id: 'regulatory_oel',
    label: 'occupational exposure limit',
    maxSeverity: 'critical',
    framing: 'An occupational exposure limit, written for healthy adult workers over a defined shift. It is not an indoor air quality criterion for general occupancy.',
  },
  health_indoor: {
    id: 'health_indoor',
    label: 'health-based indoor guideline',
    maxSeverity: 'high',
    framing: 'A health-based guideline derived for indoor environments and the general population, including susceptible individuals.',
  },
  ambient_benchmark: {
    id: 'ambient_benchmark',
    // `high`, not `medium`. The caveat on an ambient standard is about
    // jurisdiction and averaging period, not about the health basis being
    // weak — NAAQS are health-protective. Capping at medium would demote a
    // genuine indoor PM2.5 exceedance, which is the opposite of the point.
    // Individual criteria still declare a lower severity where that fits
    // (CO's 8-hour NAAQS tier is `medium` on its own terms).
    label: 'ambient standard used as an indoor benchmark',
    maxSeverity: 'high',
    framing: 'An outdoor, population-level ambient standard applied here as an indoor benchmark. No indoor standard exists for this parameter.',
  },
  comfort_consensus: {
    id: 'comfort_consensus',
    label: 'comfort consensus standard',
    maxSeverity: 'medium',
    framing: 'A thermal-comfort consensus standard, not a health-based or regulatory limit.',
  },
  ventilation_indicator: {
    id: 'ventilation_indicator',
    label: 'ventilation indicator',
    maxSeverity: 'high',
    framing: 'An indicator of outdoor-air delivery relative to occupancy, not a contaminant limit.',
  },
  certification_target: {
    id: 'certification_target',
    label: 'building-certification performance target',
    maxSeverity: 'medium',
    framing: 'A voluntary building-certification performance target, not a regulatory limit or a health-based guideline.',
  },
  advisory: {
    id: 'advisory',
    label: 'advisory benchmark',
    maxSeverity: 'medium',
    framing: 'An advisory benchmark from the literature. No regulatory limit exists for this parameter.',
  },
}

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 }
const BY_RANK = ['low', 'medium', 'high', 'critical']

/** Cap a proposed severity at what the criterion's class permits. */
export function capSeverity(proposed, criterionClass) {
  const cls = CRITERION_CLASS[criterionClass]
  if (!cls) return proposed
  const max = SEVERITY_RANK[cls.maxSeverity]
  const want = SEVERITY_RANK[proposed]
  if (want == null || max == null) return proposed
  return want <= max ? proposed : BY_RANK[max]
}

// ── The registry ───────────────────────────────────────────────────────
//
// Ordered worst-first per parameter, so evaluation takes the first match.
// `resolve()` reads STD so a published value is never restated here.

const criterion = (c) => ({ ...c, value: c.resolve() })

export const CRITERIA = {
  co: [
    criterion({
      id: 'co_niosh_ceiling',
      label: 'NIOSH ceiling',
      resolve: () => STD.c.co.ceiling,
      unit: 'ppm',
      averaging: 'ceiling',
      class: 'physical_hazard',
      severity: 'critical',
      source: 'NIOSH Pocket Guide to Chemical Hazards — carbon monoxide ceiling',
      action: 'Evacuate the area and investigate the combustion source immediately.',
    }),
    criterion({
      id: 'co_osha_pel',
      label: 'OSHA PEL',
      resolve: () => STD.c.co.osha,
      unit: 'ppm',
      averaging: 'hour8',
      class: 'regulatory_oel',
      severity: 'critical',
      source: 'OSHA 29 CFR 1910.1000 Table Z-1',
      action: 'Treat as an active combustion source and investigate immediately.',
    }),
    criterion({
      id: 'co_niosh_rel',
      label: 'NIOSH REL',
      resolve: () => STD.c.co.niosh,
      unit: 'ppm',
      averaging: 'hour10',
      class: 'regulatory_oel',
      severity: 'high',
      source: 'NIOSH Pocket Guide to Chemical Hazards',
      action: 'Identify and correct the combustion source.',
    }),
    criterion({
      id: 'co_who_1h',
      label: 'WHO 1-hour indoor guideline',
      resolve: () => STD.c.co.who1h,
      unit: 'ppm',
      averaging: 'hour1',
      class: 'health_indoor',
      severity: 'high',
      source: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010) — 35 mg/m³, 1-hour',
      action: 'Identify and correct the combustion source.',
    }),
    criterion({
      id: 'co_epa_naaqs_8h',
      label: 'EPA 8-hour NAAQS',
      resolve: () => STD.c.co.epa,
      unit: 'ppm',
      averaging: 'hour8',
      class: 'ambient_benchmark',
      severity: 'medium',
      source: '40 CFR 50.8 — EPA National Ambient Air Quality Standard, 8-hour',
      action: 'Indoor CO at this level indicates a combustion source or an infiltration pathway from one; identify and correct it.',
    }),
    criterion({
      id: 'co_well',
      label: 'WELL v2 performance target',
      resolve: () => STD.c.co.well,
      unit: 'ppm',
      averaging: 'hour8',
      class: 'certification_target',
      severity: 'medium',
      source: 'WELL Building Standard v2, feature A01 — Air Quality',
      action: 'Certification performance target; not a regulatory or health-based limit.',
    }),
    criterion({
      id: 'co_who_24h',
      label: 'WHO 24-hour indoor guideline',
      resolve: () => STD.c.co.who24h,
      unit: 'ppm',
      averaging: 'hour24',
      class: 'health_indoor',
      severity: 'low',
      source: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010) — 7 mg/m³, 24-hour',
      action: 'Note the likely source (fuel-fired appliance, attached garage, loading dock, flue) and re-check under normal operation.',
    }),
  ],

  hcho: [
    criterion({
      id: 'hcho_osha_stel',
      label: 'OSHA STEL',
      resolve: () => STD.c.hcho.stel,
      unit: 'ppm',
      averaging: 'min15',
      class: 'regulatory_oel',
      severity: 'critical',
      source: '29 CFR 1910.1048(c)(2) — short-term exposure limit',
      action: 'Identify the source and remove occupants from the affected area pending confirmation.',
    }),
    criterion({
      id: 'hcho_osha_pel',
      label: 'OSHA PEL',
      resolve: () => STD.c.hcho.osha,
      unit: 'ppm',
      averaging: 'hour8',
      class: 'regulatory_oel',
      severity: 'critical',
      source: '29 CFR 1910.1048(c)(1)',
      action: 'Confirm with NIOSH Method 2016 (DNPH cartridge) integrated sampling.',
    }),
    criterion({
      id: 'hcho_osha_al',
      label: 'OSHA action level',
      resolve: () => STD.c.hcho.al,
      unit: 'ppm',
      averaging: 'hour8',
      class: 'regulatory_oel',
      severity: 'high',
      source: '29 CFR 1910.1048(d)',
      action: 'Confirm with integrated sampling before treating this as an exposure determination.',
    }),
    criterion({
      id: 'hcho_who_30min',
      label: 'WHO 30-minute indoor guideline',
      resolve: () => STD.c.hcho.who,
      unit: 'ppm',
      averaging: 'min30',
      class: 'health_indoor',
      severity: 'high',
      source: 'WHO Guidelines for Indoor Air Quality: Selected Pollutants (2010) — 0.1 mg/m³, 30-minute',
      action: 'Identify the emitting material; confirm with NIOSH Method 2016 sampling.',
    }),
    criterion({
      id: 'hcho_niosh_rel',
      label: 'NIOSH REL',
      resolve: () => STD.c.hcho.niosh,
      unit: 'ppm',
      averaging: 'hour10',
      class: 'regulatory_oel',
      severity: 'medium',
      source: 'NIOSH Pocket Guide — formaldehyde (carcinogen)',
      action: 'Health-protective recommendation, below the OSHA action level. Note the source; no regulatory determination follows.',
    }),
    criterion({
      id: 'hcho_epa_rfc',
      label: 'EPA IRIS RfC',
      resolve: () => STD.c.hcho.epaRfc,
      unit: 'ppm',
      averaging: 'annual',
      class: 'health_indoor',
      severity: 'low',
      source: 'US EPA IRIS Toxicological Review of Formaldehyde — Inhalation (final, August 2024) — 7 µg/m³',
      action: 'Chronic reference concentration. A short survey cannot evaluate chronic exposure; note the source for follow-up.',
    }),
  ],

  pm25: [
    criterion({
      id: 'pm25_epa_unhealthy',
      label: 'EPA AQI "Unhealthy" lower bound',
      resolve: () => STD.c.pm25.epaUnhealthy,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'ambient_benchmark',
      severity: 'high',
      source: 'US EPA Air Quality Index — 24-hour "Unhealthy" category lower bound',
      action: 'Identify the particulate source and evaluate filtration.',
    }),
    criterion({
      id: 'pm25_epa_24h',
      label: 'EPA 24-hour NAAQS',
      resolve: () => STD.c.pm25.epa,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'ambient_benchmark',
      severity: 'high',
      source: '40 CFR 50.18 — EPA National Ambient Air Quality Standard, 24-hour',
      action: 'Compare against the concurrent outdoor reading to separate an indoor source from ambient infiltration.',
    }),
    criterion({
      id: 'pm25_who_24h',
      label: 'WHO 24-hour guideline',
      resolve: () => STD.c.pm25.who,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'health_indoor',
      severity: 'medium',
      source: 'WHO Global Air Quality Guidelines (2021) — PM2.5, 24-hour mean',
      action: 'Compare against the concurrent outdoor reading; consider filtration upgrades.',
    }),
    criterion({
      id: 'pm25_well',
      label: 'WELL v2 performance target',
      resolve: () => STD.c.pm25.well,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'certification_target',
      severity: 'medium',
      source: 'WELL Building Standard v2, feature A01 — Air Quality',
      action: 'Certification performance target; not a regulatory or health-based limit.',
    }),
    criterion({
      id: 'pm25_epa_annual',
      label: 'EPA annual NAAQS',
      resolve: () => STD.c.pm25.epaAnnual,
      unit: 'µg/m³',
      averaging: 'annual',
      class: 'ambient_benchmark',
      severity: 'low',
      source: 'US EPA NAAQS, annual primary standard (2024 revision; 89 FR 16202)',
      action: 'An annual mean cannot be evaluated from a short survey; noted for long-term monitoring context.',
    }),
    criterion({
      id: 'pm25_who_annual',
      label: 'WHO annual guideline',
      resolve: () => STD.c.pm25.whoAnnual,
      unit: 'µg/m³',
      averaging: 'annual',
      class: 'health_indoor',
      severity: 'low',
      source: 'WHO Global Air Quality Guidelines (2021) — PM2.5, annual mean',
      action: 'An annual mean cannot be evaluated from a short survey; noted for long-term monitoring context.',
    }),
  ],

  pm10: [
    criterion({
      id: 'pm10_epa_24h',
      label: 'EPA 24-hour NAAQS',
      resolve: () => STD.c.pm10.epa,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'ambient_benchmark',
      severity: 'high',
      source: '40 CFR 50.6 — EPA National Ambient Air Quality Standard, PM10, 24-hour',
      action: 'Identify the coarse-particle source; compare against the concurrent outdoor reading.',
    }),
    criterion({
      id: 'pm10_well',
      label: 'WELL v2 performance target',
      resolve: () => STD.c.pm10.well,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'certification_target',
      severity: 'medium',
      source: 'WELL Building Standard v2, feature A01 — Air Quality',
      action: 'Certification performance target; not a regulatory or health-based limit.',
    }),
    criterion({
      id: 'pm10_who_24h',
      label: 'WHO 24-hour guideline',
      resolve: () => STD.c.pm10.who,
      unit: 'µg/m³',
      averaging: 'hour24',
      class: 'health_indoor',
      severity: 'medium',
      source: 'WHO Global Air Quality Guidelines (2021) — PM10, 24-hour mean',
      action: 'Compare against the concurrent outdoor reading; consider filtration upgrades.',
    }),
    criterion({
      id: 'pm10_who_annual',
      label: 'WHO annual guideline',
      resolve: () => STD.c.pm10.whoAnnual,
      unit: 'µg/m³',
      averaging: 'annual',
      class: 'health_indoor',
      severity: 'low',
      source: 'WHO Global Air Quality Guidelines (2021) — PM10, annual mean',
      action: 'An annual mean cannot be evaluated from a short survey; noted for long-term monitoring context.',
    }),
  ],

  tvoc: [
    criterion({
      id: 'tvoc_molhave_action',
      label: 'Mølhave action tier',
      resolve: () => STD.c.tvoc.act,
      unit: 'µg/m³',
      averaging: 'instantaneous',
      class: 'advisory',
      severity: 'high',
      source: 'Mølhave (1991) advisory tiers — total VOC, indoor',
      action: 'TVOC is a non-specific sum and identifies no individual compound; speciate per EPA Method TO-17 (thermal desorption GC/MS) to identify the source.',
    }),
    criterion({
      id: 'tvoc_molhave_concern',
      label: 'Mølhave advisory tier',
      resolve: () => STD.c.tvoc.con,
      unit: 'µg/m³',
      averaging: 'instantaneous',
      class: 'advisory',
      severity: 'medium',
      source: 'Mølhave (1991) advisory tiers — total VOC, indoor',
      action: 'TVOC is a non-specific sum. Consider EPA Method TO-17 speciation if source investigation is warranted.',
    }),
  ],

  co2: [
    criterion({
      id: 'co2_action',
      label: 'elevated ventilation indicator',
      resolve: () => STD.v.co2.act,
      unit: 'ppm',
      averaging: 'instantaneous',
      class: 'ventilation_indicator',
      severity: 'critical',   // capped to `high` by the class — see capSeverity
      source: 'ASHRAE 62.1 differential methodology; Persily, ASHRAE Journal 63(2):74–75 (2021)',
      action: 'Verify supply airflow and outdoor-air fraction at the air handler.',
    }),
    criterion({
      id: 'co2_concern',
      label: 'ventilation indicator',
      resolve: () => STD.v.co2.con,
      unit: 'ppm',
      averaging: 'instantaneous',
      class: 'ventilation_indicator',
      severity: 'high',
      source: 'ASHRAE 62.1 differential methodology; Persily, ASHRAE Journal 63(2):74–75 (2021)',
      action: 'Verify outdoor-air delivery against the occupant load.',
    }),
  ],
}

/**
 * Evaluate a measured value against a parameter's criteria.
 *
 * Returns the worst criterion the value exceeds, with the severity its class
 * permits and the confidence the measurement supports — or null when nothing
 * is exceeded.
 *
 * @param {string} parameter        key into CRITERIA
 * @param {number} value            the measured value, in the criterion's unit
 * @param {string} evidenceBasis    an EvidenceBasisKind; defaults to a grab reading
 */
export function evaluateCriteria(parameter, value, evidenceBasis = 'screening_grab') {
  const list = CRITERIA[parameter]
  if (!Array.isArray(list) || !Number.isFinite(value)) return null

  for (const c of list) {
    if (!Number.isFinite(c.value) || value <= c.value) continue
    const avg = AVERAGING[c.averaging]
    const determinative = !!avg && avg.determinativeFrom.includes(evidenceBasis)
    const indicative = !!avg && avg.indicativeFrom.includes(evidenceBasis)
    // Severity is the CONDITION's significance and does not move with the
    // averaging period. Those are different questions: an office at 15 ppm CO
    // is a combustion source worth investigating whether or not the reading
    // was an 8-hour average. Downgrading for non-determinism conflated
    // confidence-in-the-comparison with how much attention the condition
    // deserves, and systematically demoted exactly the indoor criteria that
    // matter in a building investigation.
    //
    // What the averaging period governs is the LANGUAGE of the conclusion —
    // handled in the statement — and the `determinative` flag, which consumers
    // use to decide what may be asserted. Where a criterion genuinely cannot
    // be judged from a survey at all (a chronic RfC over an annual mean), that
    // is expressed by giving the criterion a low severity outright, not by
    // arithmetic here.
    return {
      criterion: c,
      severity: capSeverity(c.severity, c.class),
      determinative,
      indicative,
      statement: buildStatement(c, value, determinative, indicative),
    }
  }
  return null
}

/**
 * The finding sentence. Generated rather than hand-written at each branch,
 * which is what let the averaging-period caveat be present on one branch and
 * missing from the two above it.
 */
export function buildStatement(c, value, determinative, indicative) {
  const avg = AVERAGING[c.averaging]
  const head = `${value} ${c.unit} — above the ${c.label} of ${c.value} ${c.unit}`
  const period = avg && avg.id !== 'instantaneous' ? `, which is ${avg.phrase}` : ''
  let basis = ''
  if (!determinative) {
    basis = indicative
      ? ' A short-duration reading is indicative but not determinative for this averaging period.'
      : ' A short-duration reading cannot establish compliance with this averaging period.'
  }
  return `${head}${period}.${basis} ${c.action}`
}

/** Every criterion, flattened — for documentation and report appendices. */
export function allCriteria() {
  return Object.entries(CRITERIA).flatMap(([parameter, list]) =>
    list.map(c => ({ parameter, ...c, averagingLabel: AVERAGING[c.averaging]?.label, classLabel: CRITERION_CLASS[c.class]?.label })))
}
