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
    // OPT-IN ONLY — `evaluateCriteria` never applies this class on its own.
    //
    // A certification target measures a building against a scheme the
    // owner chose to pursue. If they have not pursued it, the comparison
    // answers a question nobody asked, and a finding citing WELL v2 in an
    // investigation commissioned for occupant complaints reads as padding
    // — which is what a CIH review of a live report called it.
    //
    // Two of the three WELL criteria could never fire anyway: `co_well`
    // (9 ppm) and `pm25_well` (15 µg/m³) sit at or below criteria above
    // them in their worst-first ladders, so a higher tier always matched
    // first. They were dead entries carrying a citation that would never
    // appear beside a finding. Only `pm10_well` was reachable.
    //
    // They are NOT deleted: `referenceProfiles.js` offers WELL v2 as a
    // selectable Logger Studio reference, and that is a legitimate opt-in
    // — an assessor picks it BECAUSE the client is pursuing certification,
    // and the profile resolves its citation from this registry so Logger
    // Studio and the walkthrough cite identically. The rule is about who
    // decides: the assessor may apply a certification target, the engine
    // may not apply one unbidden.
    autoApplied: false,
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

/**
 * `equivalenceBasis` — the reference compound a threshold's unit conversion
 * is made against, for the criteria where crossing units needs one.
 *
 * A threshold already travels with its averaging period, class and source
 * because comparing across any of those is a category error. Units are the
 * fourth, and they split three ways rather than two:
 *
 *   - Within a basis (mg/m3 to ug/m3, ppm to ppb): a decimal prefix shift.
 *     Exact, assumption-free.
 *   - Across bases for a single named compound (formaldehyde, CO): needs a
 *     molecular weight, but that weight is a fact about the analyte, not a
 *     choice. Also exact.
 *   - Across bases for a MIXTURE (TVOC): needs a molecular weight the
 *     mixture does not have, so one is chosen. Mølhave's 500 ug/m3 is the
 *     mass of a defined 22-compound chamber mixture; a photoionization
 *     detector reports isobutylene-equivalent response. The conversion
 *     (500 x 24.45 / 56.11 = 218 ppb) is a real restatement of what the PID
 *     measures, made against isobutylene — the gas it was calibrated with,
 *     and the basis its own ug/m3 display already uses.
 *
 * Only the third case sets `equivalenceBasis`, and setting it is a
 * REQUIREMENT, not a permission: `resolveReference` renders the named
 * compound and the response-factor limitation alongside any value that
 * crossed. The limitation belongs to the reading in every unit — a PID
 * logging ug/m3 is no more speciated than one logging ppb — so it is
 * disclosed, not used to withhold the comparison from half the instruments.
 *
 * Default is null: no basis is crossed, or crossing it assumes nothing.
 */
const criterion = (c) => ({
  equivalenceBasis: null,
  ...c,
  // A criterion is either a LIMIT (one number, exceeded from below) or a BAND
  // (a floor and a ceiling, missed from either side).
  //
  // Bands arrived late, in 2026-08, and their absence is the whole reason
  // this file's two worst citation errors were in thermal comfort. Every
  // parameter governed by this registry travels with a class, an averaging
  // period and a checkable source, and none of them was wrong. Temperature
  // and relative humidity had no registry entry — they lived as bare numbers
  // on `STD.t` — precisely because the registry could only express "value >
  // threshold" and comfort is a range. So the one shape the registry could
  // not hold is the one shape that went unaudited: an invented 67-82 F
  // "acceptable" band with a fabricated "optimal" tier inside it, and a 30-60%
  // humidity range credited to a standard that sets no lower limit at all.
  //
  // CLAUDE.md already stated the rule this violated — "never compare a
  // measured value against a bare number from STD". The gap was that for
  // these two parameters there was nowhere else to put the number.
  ...(c.resolveBand
    ? {
        band: c.resolveBand(),
        value: null,
        // `resolve` stays callable on every criterion so no consumer has to
        // branch on the shape before it can read one. It returns the band.
        resolve: c.resolveBand,
        // The midpoint, for the one thing a band cannot answer directly: a
        // consumer that needs A representative value (a test probe, a sort
        // key). Never rendered — `valueLabel` is what a reader sees.
        midpoint: (c.resolveBand().min + c.resolveBand().max) / 2,
      }
    : { band: null, value: c.resolve(), midpoint: c.resolve() }),
  // One uniform accessor for "what this criterion equals, as a reader sees
  // it". Added with bands: `${c.resolve()} ${c.unit}` printed "[object
  // Object] °F" the moment a criterion stopped being a single number, and
  // every consumer interpolating a raw resolve() would have had to learn the
  // difference. They should not have to.
  valueLabel: c.resolveBand
    ? `${c.resolveBand().min}–${c.resolveBand().max}`
    : String(c.resolve()),
})

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

  // ── Thermal comfort and moisture ─────────────────────────────────────
  //
  // These two arrived in 2026-08 and are the reason `resolveBand` exists.
  // They were the ONLY parameters the engine evaluated without a registry
  // entry, and they were the only two whose citations were wrong. That is not
  // a coincidence: a bare number on STD has nowhere to carry a class, an
  // averaging period or a source, so nothing could check them and nothing did.
  //
  // Temperature is seasonal, so it is two criteria rather than one with a
  // branch — the season is a property of WHICH criterion applies, exactly as
  // averaging period is, and `comfortSeason()` selects between them.
  temp: [
    criterion({
      id: 'temp_ashrae55_summer',
      label: 'ASHRAE 55 summer comfort range',
      resolveBand: () => ({ min: STD.t.temp.summer.min, max: STD.t.temp.summer.max }),
      unit: '°F',
      averaging: 'instantaneous',
      class: 'comfort_consensus',
      severity: 'medium',
      season: 'summer',
      source: 'ANSI/ASHRAE Standard 55-2023 — Graphic Comfort Zone Method, ~0.5 clo, 1.0–1.3 met',
      action: 'Review thermostat setpoints, HVAC zoning and airflow distribution for the affected area. ASHRAE 55 resolves comfort from six variables and this assessment measured one, so an out-of-range reading indicates a condition to investigate rather than a determination against the standard.',
    }),
    criterion({
      id: 'temp_ashrae55_winter',
      label: 'ASHRAE 55 winter comfort range',
      resolveBand: () => ({ min: STD.t.temp.winter.min, max: STD.t.temp.winter.max }),
      unit: '°F',
      averaging: 'instantaneous',
      class: 'comfort_consensus',
      severity: 'medium',
      season: 'winter',
      source: 'ANSI/ASHRAE Standard 55-2023 — Graphic Comfort Zone Method, ~1.0 clo, 1.0–1.3 met',
      action: 'Review thermostat setpoints, HVAC zoning and airflow distribution for the affected area. ASHRAE 55 resolves comfort from six variables and this assessment measured one, so an out-of-range reading indicates a condition to investigate rather than a determination against the standard.',
    }),
  ],

  rh: [
    criterion({
      id: 'rh_epa_moisture_control',
      label: 'EPA moisture-control range',
      resolveBand: () => ({ min: STD.t.rh.min, max: STD.t.rh.max }),
      unit: '%',
      averaging: 'instantaneous',
      class: 'comfort_consensus',
      severity: 'medium',
      // Its own source, not STD.t.ref. The nesting of `rh` inside `STD.t` is
      // what made eleven surfaces cite ASHRAE 55 for a band ASHRAE 55 does
      // not contain — 55 sets its upper humidity limit as a humidity ratio
      // and dropped its lower limit in 55-2013.
      source: 'US EPA — Mold, Moisture and Your Home (keep indoor RH below 60%, ideally 30–50%)',
      action: 'Above 60%, evaluate dehumidification capacity, envelope condensation and HVAC moisture removal; below 30%, assess humidification against the space volume and outdoor design condition. The two bounds do not share a rationale: the upper is moisture and microbial-amplification control, the lower is dryness and irritation.',
    }),
  ],

  tvoc: [
    criterion({
      id: 'tvoc_molhave_action',
      equivalenceBasis: 'isobutylene',
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
      equivalenceBasis: 'isobutylene',
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

  // Attribution note: 1,000 / 1,500 ppm are ABSOLUTE indoor CO2 indicators
  // from NIOSH IEQ guidance, not ASHRAE 62.1 values — current 62.1 sets no
  // indoor CO2 number, and CO2 indexes ventilation per occupant rather than
  // a contaminant (Persily 2021). These two cited "ASHRAE 62.1 differential
  // methodology", which conflated them with the Δ700-above-outdoor figure
  // (STD.v.co2.diff) from a since-removed informative appendix. The same
  // mis-attribution had already been corrected in utils/referenceProfiles.js,
  // where the comment records it being flagged twice in peer review; the two
  // modules now cite the figure identically. CLAUDE.md lists the ASHRAE-62.1-
  // as-CO2-limit framing as an anti-pattern.
  co2: [
    criterion({
      id: 'co2_action',
      label: 'elevated ventilation indicator',
      resolve: () => STD.v.co2.act,
      unit: 'ppm',
      averaging: 'instantaneous',
      class: 'ventilation_indicator',
      severity: 'critical',   // capped to `high` by the class — see capSeverity
      source: 'NIOSH indoor-ventilation indicator (~1,000 ppm); Persily, ASHRAE Journal 63(2):74–75 (2021)',
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
      source: 'NIOSH indoor-ventilation indicator (~1,000 ppm); Persily, ASHRAE Journal 63(2):74–75 (2021)',
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
export function evaluateCriteria(parameter, value, evidenceBasis = 'screening_grab', opts = {}) {
  const list = CRITERIA[parameter]
  if (!Array.isArray(list) || !Number.isFinite(value)) return null

  for (const c of list) {
    // A criterion may declare the SCOPE it applies in, and a scope the caller
    // has not named is not a match. Today that is `season`: the two ASHRAE 55
    // comfort bands overlap (winter 68-76 F, summer 73-79 F), so walking both
    // makes 79 F "outside the winter band" in July. The registry declares the
    // scope; this function refuses to guess it.
    if (c.season && c.season !== opts.season) continue
    // A BAND criterion is missed from either side; a LIMIT criterion is
    // exceeded from below. Everything after this point — averaging, opt-in
    // class exclusion, severity capping, statement generation — is identical,
    // which is the reason bands belong here rather than in a parallel path in
    // the engine. That parallel path is exactly what thermal comfort had, and
    // it is where both of this project's citation errors lived.
    const band = c.band && Number.isFinite(c.band.min) && Number.isFinite(c.band.max) ? c.band : null
    if (band) {
      if (!(value < band.min || value > band.max)) continue
    } else if (!Number.isFinite(c.value) || value <= c.value) {
      continue
    }
    const avg = AVERAGING[c.averaging]
    // A criterion whose averaging period no evidence basis can speak to is
    // not evaluable from a survey — by the registry's own declaration, not
    // by a judgement made here. `annual` carries
    // `determinativeFrom: []` AND `indicativeFrom: []`, and every annual
    // criterion's own action text says the same thing: "An annual mean
    // cannot be evaluated from a short survey; noted for long-term
    // monitoring context."
    //
    // Firing one anyway is the averaging-period category error this whole
    // module exists to prevent, just at the other end of the ladder: a
    // clean office at PM2.5 6 µg/m³ produced a finding reading "above the
    // WHO annual guideline of 5 µg/m³" from a two-minute reading. The
    // criteria stay in the registry — they are real published values and
    // the report cites them in its reference tables — but they cannot
    // produce a finding from a walkthrough.
    if (avg && avg.determinativeFrom.length === 0 && avg.indicativeFrom.length === 0) continue
    // A class marked `autoApplied: false` is opt-in: reachable when an
    // assessor selects it (see `referenceProfiles.js`), never applied by
    // the engine on its own. Same shape as the rule above — the registry
    // declares the exclusion, this function does not decide it.
    if (CRITERION_CLASS[c.class] && CRITERION_CLASS[c.class].autoApplied === false) continue
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
      // Which side of a band was missed. Null for a limit criterion. The
      // engine's causal chains and the recommendation layer need this: a room
      // that is too cold and a room that is too warm want opposite advice,
      // and a single "outside the range" flag cannot tell them apart.
      direction: band ? (value < band.min ? 'below' : 'above') : 'above',
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
  const band = c.band && Number.isFinite(c.band.min) && Number.isFinite(c.band.max) ? c.band : null
  // "outside the X of A-B", not "above" — a band is missed in two directions
  // and the sentence has to be able to say which. The word `above` hard-coded
  // into every finding is a small thing that becomes a wrong thing the moment
  // a floor exists.
  const head = band
    ? `${value} ${c.unit} — ${value < band.min ? 'below' : 'above'} the ${c.label} of ${band.min}–${band.max} ${c.unit}`
    : `${value} ${c.unit} — above the ${c.label} of ${c.value} ${c.unit}`
  const period = avg && avg.id !== 'instantaneous' ? `, which is ${avg.phrase}` : ''
  let basis = ''
  if (!determinative) {
    basis = indicative
      ? ' A short-duration reading is indicative but not determinative for this averaging period.'
      : ' A short-duration reading cannot establish compliance with this averaging period.'
  }
  // `c.action` is deliberately NOT appended. A finding states what was
  // measured and against which criterion; what to DO about it belongs to the
  // recommendations, which the report and the app both render in their own
  // sections. Carrying it here printed the recommendation twice and made the
  // finding card unreadable — "TVOCs 560 µg/m³ — elevated. Consider TO-17
  // speciation if source investigation is warranted." in a list whose whole
  // job is to say what was found.
  //
  // The evidentiary caveat above (`basis`) stays: it is a property of the
  // measurement, not advice — it says what this reading can and cannot
  // settle, which changes how the finding itself should be read.
  return `${head}${period}.${basis}`.trimEnd()
}

/**
 * One criterion by parameter and id.
 *
 * Exists so a comparison the engine performs itself — a seasonal comfort band
 * the building profile may narrow, which `evaluateCriteria` therefore cannot
 * own outright — can still take its severity ceiling and its citation from
 * the registry instead of restating them. A hand-written `sev:'high'` beside a
 * class that caps at `medium` is precisely the drift this returns.
 */
export function criterionById(parameter, id) {
  return (CRITERIA[parameter] || []).find((c) => c.id === id) || null
}

/** Every criterion, flattened — for documentation and report appendices. */
export function allCriteria() {
  return Object.entries(CRITERIA).flatMap(([parameter, list]) =>
    list.map(c => ({ parameter, ...c, averagingLabel: AVERAGING[c.averaging]?.label, classLabel: CRITERION_CLASS[c.class]?.label })))
}
