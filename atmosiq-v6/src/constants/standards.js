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
  // The indoor RH practice range (30-60%). Cited on its own terms because it
  // is moisture control, not thermal comfort - see the note on STD.t.rh.
  'EPA Mold, Moisture and Your Home': 'current (keep indoor RH below 60%, ideally 30-50%)',
  'WELL Building Standard v2': 'Q3 2024 (IAQ features A01/V01 — OPT-IN only: an assessor-selectable Logger Studio reference, never applied by the engine on its own; see certification_target in criteria.js)',
  'Molhave TVOC tiers': '1991 (advisory only)',
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
    // ONE band per season, and it is the ACCEPTABLE range. ASHRAE 55 has a
    // single acceptability criterion — roughly 80% of occupants satisfied —
    // not a two-tier ladder.
    //
    // What stood here until 2026-08 was
    //   summer: { min: 67, max: 82, oMin: 73, oMax: 79 }
    //   winter: { min: 68.5, max: 76, oMin: 68.5, oMax: 74 }
    // an "acceptable" band with a tighter "optimal" band inside it, both
    // attributed to ASHRAE 55. Neither the 67-82 figure nor the
    // optimal/acceptable ladder is in the standard, and unlike every other
    // constant in this file the block carried no provenance comment at all.
    //
    // It also contradicted this project's own standards corpus, which states
    // the acceptable range as ~68-76 F in winter and ~73-79 F in summer.
    // Jasper cited the corpus; the engine scored against the invented pair;
    // and the Logger Studio card drew the wide band while the engine flagged
    // the narrow one. The same 72.6 F reading rendered as comfortably inside
    // the range on one surface and as a finding on another.
    //
    // The figures below are the corpus's. They are the Fahrenheit rounding of
    // the 20-24 C (winter, ~1.0 clo) and 23-26 C (summer, ~0.5 clo) operative
    // temperature ranges the Graphic Comfort Zone Method yields for typical
    // office work.
    //
    // THREE QUALIFIERS TRAVEL WITH THESE NUMBERS. State them wherever the
    // band is stated; a bare number here is how the last version went wrong.
    //
    //   1. The assumptions. The graphic method is defined only for metabolic
    //      rates of 1.0-1.3 met and clothing of 0.5-1.0 clo. Outside those
    //      bounds the band does not apply.
    //   2. The quantity. The standard's zone is OPERATIVE temperature -
    //      roughly the mean of air and mean radiant temperature. AtmosFlow
    //      measures dry-bulb air temperature, which approximates it and
    //      diverges near glazing, exterior walls and radiant sources.
    //   3. What it is not. ASHRAE 55 resolves comfort from six variables: air
    //      temperature, mean radiant temperature, air speed, humidity,
    //      metabolic rate and clothing insulation. AtmosFlow captures one of
    //      the six. A reading outside this band is an indicator worth
    //      investigating. It is never an ASHRAE 55 determination.
    temp: {
      summer: { min: 73, max: 79 },
      winter: { min: 68, max: 76 },
    },
    // Relative humidity: 30-60%, and it is NOT an ASHRAE 55 figure.
    //
    // It was cited to ASHRAE 55-2023 here and on five other surfaces until
    // 2026-08, and that attribution was wrong twice over. ASHRAE 55 sets only
    // an UPPER humidity limit - a humidity ratio of 0.012 kg water per kg dry
    // air, roughly 60-65% RH at comfort temperatures - and it dropped its
    // LOWER limit in 55-2013, so the standard says nothing whatever about
    // 30%. This project's own standards corpus already recorded both facts
    // while every rendering surface said otherwise.
    //
    // The band is real and worth keeping; only the source was wrong. It is US
    // EPA moisture-control guidance: keep indoor RH below 60%, ideally
    // 30-50%. The two bounds do not share a rationale, which is the reason
    // this cannot be a "comfort range":
    //
    //   60% upper - MOISTURE control. Above it condensation and microbial
    //               amplification risk rise; the same basis as the IICRC S520
    //               condition framework. Numerically it also sits just inside
    //               ASHRAE 55's real upper humidity limit, which is why the
    //               old citation was misleading rather than absurd.
    //   30% lower - comfort and irritation. Below it dry-eye and respiratory
    //               complaints increase. ASHRAE 55 has no such limit.
    //
    // `ref` is deliberately its own field rather than inheriting STD.t.ref.
    // That inheritance is exactly how one wrong word reached the engine
    // finding, the criteria table, the Logger Studio chart band, the chart
    // legend, Jasper's corpus and a recommendation's standardReference.
    rh: {
      min: 30,
      max: 60,
      ref: 'US EPA — Mold, Moisture and Your Home',
    },
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
      // ASHRAE 62.1 Table 6.2.2.1, Classrooms (age 9 plus). This table IS the
      // code basis: scoring.js reads it as `req` and reports "below ASHRAE
      // 62.1 minimum (req)", and `cfm < req * 0.5` is a critical finding.
      //
      // It held 15 until 2026-08 — EPA IAQ Tools for Schools guidance, which
      // traces to the superseded 62-1989. That is a real and more protective
      // figure, but it is not what this field means, and putting it here
      // manufactured false non-compliance: a classroom at 12 cfm/person was
      // reported "below ASHRAE 62.1 minimum" when 12 exceeds the actual
      // minimum of 10, and a school at 7 was rated critical rather than high.
      //
      // The EPA target is not lost — buildingProfiles.js emits it as its own
      // lower-severity finding for classrooms between the two figures, so a
      // code-compliant school that falls short of the guidance still surfaces.
      classroom:     { pp: 10,  ps: 0.12 },
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
    // reference concentration from the FINAL August 2024 IRIS Toxicological
    // Review: 7 µg/m³. Stored in ppm as 0.0057, which round-trips to
    // 7.00 µg/m³ through hchoToUnit (MW 30.03, molar volume 24.45 @ 25 °C);
    // 0.006 would overstate it by 5%. The previous 0.008 predated the final
    // assessment. NOTE: distinct from the ATSDR chronic MRL (0.003 ppm) —
    // different agency, different criterion; do not conflate. `who` is the
    // WHO 30-minute guideline (0.081 ppm ≈ 0.1 mg/m³, formaldehyde).
    // `well` is the WELL Building Standard v2 (feature A01) CO performance
    // threshold, 9 ppm — a green-building certification target, not a
    // regulatory limit (see WELL_NOTE in referenceProfiles.js).
    // `who1h` is the WHO 2010 Indoor Air Quality Guidelines short-term CO
    // guideline: 35 mg/m³ over 1 hour ≈ 30 ppm (health-based ACUTE criterion
    // with a 1-hour averaging period — distinct from the 8-hour references
    // above). Used only as the higher action tier over a 1-hour rolling mean.
    // `who24h` is the WHO 2010 indoor 24-hour CO guideline: 7 mg/m³ ≈ 6 ppm.
    // The lowest published indoor criterion, used as the point at which CO is
    // above typical indoor background and a source should be noted.
    // `ceiling` is the NIOSH CO ceiling, 200 ppm — a ceiling is by definition
    // not to be exceeded at any time, so unlike the TWAs above it a single
    // reading CAN evaluate it. See constants/criteria.js.
    co:   { osha: 50,   niosh: 35,    epa: 9,  well: 9,  who1h: 30, who24h: 6, ceiling: 200 },
    // `stel` is the OSHA 15-minute short-term exposure limit, 2 ppm
    // (29 CFR 1910.1048(c)(2)) — a short-duration criterion, which is the kind
    // a walkthrough reading can most nearly speak to.
    hcho: { osha: 0.75, niosh: 0.016, al: 0.5, epaRfc: 0.0057, who: 0.081, stel: 2 },
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
    //   pm25.epaUnhealthy 55.5 — lower bound of the EPA AQI 24-hour
    //     "Unhealthy" category (the band above "Unhealthy for Sensitive
    //     Groups", 35.5–55.4). A 24-HOUR category: used only as the higher
    //     action tier evaluated on a 24-hour rolling mean, never a single
    //     short-interval reading.
    //   pm10.epa       150 — EPA 24-hour NAAQS (40 CFR 50.6)
    //   pm10.who        45 — WHO 2021 AQG, 24-hour mean
    //   pm10.whoAnnual  15 — WHO 2021 AQG, annual mean
    //   pm10.well       50 — WELL v2 (A01) performance target
    // Each NAAQS carries a statistical FORM (percentile / exceedance count
    // averaged over three years) that a single monitoring session cannot
    // evaluate. The form caveat travels with the profile, not with the
    // number — see PM_NAAQS_NOTE in referenceProfiles.js.
    pm25: { epa: 35,    who: 15,   epaAnnual: 9,  whoAnnual: 5,  well: 15,  epaUnhealthy: 55.5 },
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