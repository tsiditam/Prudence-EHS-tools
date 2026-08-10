/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { ENGINE_VERSION, STANDARDS_MANIFEST_DATE } from '../version.js'

// ─── Citation verification policy ────────────────────────────────────
// Journal entries must be verified against primary sources before
// adding. Required fields: author(s), year, exact title, journal,
// volume, issue, page range. If any field cannot be verified from a
// primary source, flag with a TODO comment in the parameter-prose
// file and exclude from generated reports until corrected. Standards
// documents (ASHRAE, OSHA, EPA, WHO, ISO, IEEE, NFPA, NIOSH) follow
// looser citation conventions: source name + edition/year is
// sufficient since the documents are cataloged by issuing body.
//
// Specific points of confusion to avoid:
//   • Persily 2021 ASHRAE Journal article ("Don't Blame Standard 62.1
//     for 1000 ppm CO₂", 63(2): 74–75) is a DIFFERENT document from
//     the 2022 ASHRAE Position Document on Indoor Carbon Dioxide.
//     Cite separately if both are referenced.
//   • Mølhave 1991 paper title is "Volatile organic compounds, indoor
//     air quality and health" (lowercase per Indoor Air style).
//   • Chen & Zhao 2011 paper is in Atmospheric Environment, not
//     Building and Environment.

export const STANDARDS_MANIFEST = {
  'ASHRAE 62.1': '2025',
  'ASHRAE 55': '2023',
  'OSHA Z-1 PELs': '29 CFR 1910.1000 (current)',
  'WHO Air Quality Guidelines': '2021',
  'IICRC S520': '2024',
  'NIOSH Pocket Guide RELs': 'current',
  'EPA NAAQS': '2024',
  'WELL Building Standard v2': 'Q3 2024 (IAQ features A01/V01 — advisory comfort/ventilation reference, not a regulatory limit)',
  'Molhave TVOC tiers': '1991 (advisory only)',
  'ANSI/ISA 71.04': '2013',
  'ISO 14644-1': '2015',
  'ASHRAE TC 9.9': '2011',
  'IEEE 1635 / ASHRAE Guideline 21': 'current',
  'NFPA 855': '2026',
  // Move 5 — methodology currency layer. Bibliographic only — these
  // standards are NOT integrated into STD scoring thresholds (engine
  // is sacred); they appear in the report's Standards Currency
  // section as references a qualified IH may consult during review.
  // See src/engines/contextualStandards.js for the rationale text
  // that accompanies each entry. Verify edition/year against the
  // primary source before any future bump.
  'ASHRAE 241': '2023 (infectious aerosol control; bibliographic reference)',
  'EPA PM2.5 Annual NAAQS Revision': '2024 (89 FR 16202; primary annual lowered to 9 µg/m³)',
  'ACGIH TLVs and BEIs': '2025 edition (bibliographic reference)',
  // Mold screening module (src/engines/mold/*). These are the references the
  // mold module frames its SCREENING output against — a water-damage/mold
  // methodology bibliography, NOT health limits. There is no health-based
  // numeric exposure limit for airborne mold spores (IOM 2004; ACMT 2025), so
  // none of these establish a pass/fail threshold; they scope classification
  // (IICRC S520) and comparative interpretation (AIHA; EPA) only. See
  // src/constants/moldStandards.js for the framing each entry carries.
  'IICRC S520 Mold Remediation': '2024 (water-damage Category + remediation Condition classification)',
  'AIHA Recognition/Evaluation/Control of Mold': '2020 (comparative indoor/outdoor screening methodology)',
  'EPA Mold Remediation in Schools and Commercial Buildings': '2008 (moisture-control screening guidance)',
  'IOM Damp Indoor Spaces and Health': '2004 (no health-based airborne spore limit; screening, not a verdict)',
  'ACMT Position — Mold': '2025 (spore counts are not health proof)',
  engineVersion: ENGINE_VERSION,
  manifestUpdated: STANDARDS_MANIFEST_DATE,
}

export const STD = {
  t: {
    ref: 'ASHRAE 55-2023',
    temp: {
      summer: { min: 67, max: 82, oMin: 73, oMax: 79 },
      winter: { min: 68.5, max: 76, oMin: 68.5, oMax: 74 },
    },
    rh: { min: 30, max: 60 },
  },
  v: {
    ref: 'ASHRAE 62.1-2025',
    // `con` (NIOSH 1000) and `act` (1500) are screening trigger points;
    // `diff` is the 700 ppm-above-outdoor ventilation surrogate (ASHRAE
    // 62.1 / Persily 2021 — CO₂ indexes ventilation per occupant, NOT a
    // health/contaminant limit).
    co2: { base: 420, diff: 700, con: 1000, act: 1500 },
    oa: {
      office:        { pp: 5,   ps: 0.06 },
      classroom:     { pp: 15,  ps: 0.12 },
      retail:        { pp: 7.5, ps: 0.12 },
      healthcare:    { pp: 5,   ps: 0.06 },
      lab:           { pp: 10,  ps: 0.18 },
      warehouse:     { pp: 5,   ps: 0.06 },
      manufacturing: { pp: 10,  ps: 0.18 },
      conference:    { pp: 5,   ps: 0.06 },
      data_center:   { pp: 5,   ps: 0.06 },
      restaurant:    { pp: 7.5, ps: 0.18 },
      gymnasium:     { pp: 20,  ps: 0.06 },
      auditorium:    { pp: 5,   ps: 0.06 },
      library:       { pp: 5,   ps: 0.12 },
      cafeteria:     { pp: 7.5, ps: 0.18 },
      lobby:         { pp: 5,   ps: 0.06 },
      parking:       { pp: 0,   ps: 0.75 },
    },
  },
  c: {
    // ppm unless noted. `epa` on CO is the EPA NAAQS 8-hour primary
    // standard (9 ppm). hcho `epaRfc` is the EPA IRIS chronic inhalation
    // reference concentration (~8 ppb ≈ 0.0098 mg/m³) and `who` is the
    // WHO 30-minute guideline (0.081 ppm ≈ 0.1 mg/m³, formaldehyde).
    // `well` is the WELL Building Standard v2 (feature A01) CO performance
    // threshold, 9 ppm — a green-building certification target, not a
    // regulatory limit (see WELL_NOTE in referenceProfiles.js).
    co:   { osha: 50,   niosh: 35,    epa: 9,  well: 9 },
    hcho: { osha: 0.75, niosh: 0.016, al: 0.5, epaRfc: 0.008, who: 0.081 },
    // Particulates, µg/m³. The `epa`/`who` entries are on a 24-HOUR basis so
    // a given size fraction is directly comparable; `epaAnnual`/`whoAnnual`
    // are the ANNUAL-mean guidelines (a short session cannot evaluate an
    // annual mean — see PM_ANNUAL_NOTE). `well` is the WELL v2 (A01)
    // performance target.
    //   pm25.epa        35 — EPA 24-hour NAAQS (40 CFR 50.18)
    //   pm25.who        15 — WHO 2021 AQG, 24-hour mean
    //   pm25.epaAnnual   9 — EPA primary ANNUAL NAAQS (2024; 89 FR 16202)
    //   pm25.whoAnnual   5 — WHO 2021 AQG, annual mean
    //   pm25.well       15 — WELL v2 (A01) performance target
    //   pm10.epa       150 — EPA 24-hour NAAQS (40 CFR 50.6)
    //   pm10.who        45 — WHO 2021 AQG, 24-hour mean
    //   pm10.whoAnnual  15 — WHO 2021 AQG, annual mean
    //   pm10.well       50 — WELL v2 (A01) performance target
    // Each NAAQS carries a statistical FORM (percentile / exceedance count
    // averaged over three years) that a single monitoring session cannot
    // evaluate. The form caveat travels with the profile, not with the
    // number — see PM_NAAQS_NOTE in referenceProfiles.js.
    pm25: { epa: 35,    who: 15,   epaAnnual: 9,  whoAnnual: 5,  well: 15 },
    pm10: { epa: 150,   who: 45,   whoAnnual: 15, well: 50 },
    // TVOC `con` is 500 µg/m³ — the Mølhave 1991 multifactorial-exposure
    // advisory tier (≈219 ppb isobutylene-equiv). Advisory only: TVOC has
    // no consensus health limit; always carry the Mølhave disclaimer. `well`
    // is the WELL v2 (A01) continuous-monitoring TVOC target, 500 µg/m³ (a
    // green-building target, numerically coincident with Mølhave's tier).
    tvoc: { con: 500,   act: 3000, well: 500 },
  },
}

export { VER, BUILD_SHA } from '../version.js'

export const PLAT_MODULES = [
  { id: 'atmosiq',    n: 'AtmosFlow',            i: '🌬️', on: true },
  { id: 'ieq-report', n: 'IEQ Report Gen',      i: '📊' },
  { id: 'asbestos',   n: 'Asbestos Inspection', i: '🔬' },
  { id: 'osha',       n: 'OSHA Inspection',     i: '🛡️' },
  { id: 'noise',      n: 'Noise Survey',        i: '🔊' },
  { id: 'hazcom',     n: 'HazCom Pro',          i: '⚠️' },
]

export const Bus = {
  _l: {},
  emit(e, d) { (this._l[e] || []).forEach(f => f(d)) },
  on(e, f) {
    this._l[e] = [...(this._l[e] || []), f]
    return () => { this._l[e] = this._l[e].filter(x => x !== f) }
  },
}