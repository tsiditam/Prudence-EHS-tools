/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Controlled narrative library for the fixed IAQ report.
 *
 * The renderer (lib/report/render-pdf.js) owns layout; THIS owns the words.
 * It is a deterministic, screening-only narrative source: static "what it is
 * and why we measure it" explainers (never vary), severity-keyed "observed"
 * templates filled from the Report Model statistics, and the fixed
 * methodology / reference-framework / limitations / about blocks. No AI is
 * required to produce a complete report — an optional AI pass (api/narrative
 * + the banned-language gate) may later REFINE this baseline wording, but it
 * may never introduce a fact or change the technical position encoded here.
 *
 * Tone rules baked in: "consistent with / suggests / may indicate"; never
 * "caused / proves / unsafe / noncompliant"; ASHRAE 62.1 is a ventilation
 * indicator, not a CO2 limit; TVOC is a non-specific indicator (Mølhave
 * legacy context only); PM2.5/NAAQS cited for scale, not as an office limit.
 */

// ── Static "what it is and why we measure it" explainers ───────────
export const WHAT_IS = {
  co2: 'Carbon dioxide is produced by people as they breathe and builds up indoors when the supply of outdoor air does not keep pace with the number of occupants. At the concentrations typical of offices it is not itself a health hazard, but it is the most practical real-time indicator of ventilation adequacy — elevated levels usually accompany "stuffiness" complaints and signal that a space is receiving too little fresh air for its occupant load.',
  co: 'Carbon monoxide is a colorless, odorless gas formed by incomplete combustion — vehicle exhaust, gas-fired appliances, and generators. Because it is an acute hazard that reduces the blood’s ability to carry oxygen, even low indoor readings are screened to rule out combustion sources migrating into occupied space.',
  tempRh: 'Dry-bulb temperature and relative humidity together define the thermal environment, which is the single most common driver of occupant comfort complaints. Relative humidity also affects air quality: sustained high humidity can support microbial growth, while very low humidity contributes to dryness and irritation. Both are screened against the ASHRAE 55 comfort envelope.',
  pm25: 'PM2.5 refers to airborne particles 2.5 micrometers and smaller — fine enough to be inhaled deep into the lungs. Indoor sources include cooking, printing, and outdoor particles drawn in through the ventilation system. It is measured as an indicator of particulate exposure and of how effectively the building’s air filtration is performing.',
  tvoc: 'Total volatile organic compounds (TVOC) is a combined measure of the many gas-phase chemicals that off-gas from furnishings, finishes, adhesives, cleaning products, and office equipment. It is a non-specific screening indicator — it does not identify individual compounds — but elevated readings often accompany odor or irritation complaints and point to a source worth investigating.',
}

// ── Severity-keyed "observed" templates (filled from Report Model) ──
// Each returns the "Observed:" sentence(s) for the parameter, using only the
// supplied statistics. `s` = { range, mean, min, max, unit }.
const r2 = (s) => `${s.range}${s.unit ? ' ' + s.unit : ''}`

export const OBSERVED = {
  co2(s, outcome) {
    const base = `Observed: indoor CO2 ranged ${r2(s)} (site mean ${s.mean} ${s.unit}). ASHRAE 62.1 prescribes ventilation rates rather than a CO2 limit; an indoor-to-outdoor differential above roughly 700 ppm is commonly used as an indicator that outdoor-air delivery may be low relative to occupant load.`
    if (outcome === 'elevated') return base + ` The peak of ${s.max} ppm is consistent with possible under-ventilation at peak occupancy. This is an indicator, not a measured ventilation rate; occupant density, room volume, and supply airflow were not measured, so it is a screening hypothesis pending airflow / BAS / TAB verification.`
    if (outcome === 'advisory') return base + ' One or more zones read above typical office background and may warrant additional monitoring; the readings are screening indicators, not measured ventilation rates.'
    return base + ' Concentrations remained within the ventilation-indicator range during the assessment window.'
  },
  co(s, outcome) {
    const base = `Observed: CO ranged ${r2(s)} (site mean ${s.mean} ${s.unit}).`
    if (outcome === 'acceptable') return base + ' Readings were well below the US EPA NAAQS (9 ppm, 8-hour) and the OSHA PEL (50 ppm, 8-hour TWA), with no indication of combustion-source intrusion.'
    return base + ' Readings warrant follow-up to identify the contributing combustion source; values are screened against the US EPA NAAQS (9 ppm, 8-hour) and OSHA PEL (50 ppm, 8-hour TWA).'
  },
  temperature(s, outcome) {
    const base = `Observed: temperatures ranged ${r2(s)} (site mean ${s.mean} ${s.unit}).`
    return outcome === 'acceptable'
      ? base + ' Values fell within the ASHRAE 55 comfort envelope for the season and clothing assumptions.'
      : base + ' One or more zones trended outside the ASHRAE 55 comfort envelope; thermostat and air-distribution review is suggested.'
  },
  relativeHumidity(s, outcome) {
    const base = `Observed: relative humidity ranged ${r2(s)} (site mean ${s.mean} ${s.unit}).`
    return outcome === 'acceptable'
      ? base + ' Values fell within the ASHRAE 55 comfort range (30–60%).'
      : base + ' One or more zones fell outside the 30–60% comfort range; sustained excursions may warrant moisture-control or humidification review.'
  },
  pm25(s, outcome) {
    const base = `Observed: PM2.5 ranged ${r2(s)} (site mean ${s.mean} ${s.unit}). For scale only, the US EPA 24-hour NAAQS is 35 µg/m³; NAAQS are outdoor, population-level standards, not office or occupational screening limits, and are cited here for context rather than as a pass/fail threshold.`
    return outcome === 'acceptable'
      ? base + ' Levels were generally low and comparable to values commonly observed in mechanically ventilated office environments.'
      : base + ' Higher readings in some zones are consistent with intermittent local sources (e.g. printing or cooking) — transient and local rather than a building-wide condition.'
  },
  tvoc(s, outcome) {
    const base = `Observed: TVOC ranged ${r2(s)} (isobutylene-equivalent; site mean ${s.mean} ${s.unit}). TVOC by photoionization is a non-specific, instrument- and calibration-dependent reading: it does not identify individual compounds and, on its own, does not establish exposure or toxicological significance.`
    return outcome === 'acceptable'
      ? base + ' Readings did not suggest a prominent VOC source during the assessment window. The Mølhave (1991) tiers are noted only as legacy context.'
      : base + ' Higher readings suggest that identifiable VOC sources are present and warrant source investigation. The Mølhave (1991) tiers are noted only as legacy context.'
  },
}

// ── Fixed blocks ───────────────────────────────────────────────────
export const SEVERITY_LEGEND_NOTE = 'Acceptable: within recognized screening references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.'

export const REFERENCE_FRAMEWORK = 'Outcomes are screened against recognized consensus and regulatory references: ASHRAE 62.1 (ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit), ASHRAE 55 (thermal comfort), US EPA NAAQS (CO and PM2.5), OSHA PELs (29 CFR 1910.1000), and the Mølhave (1991) advisory tiers for TVOC. References are used to contextualize screening readings, not to render compliance determinations.'

export const ABOUT_ATMOSFLOW = 'AtmosFlow is a screening-only IAQ assessment platform: it captures field observations and direct-reading measurements, screens them against recognized references, and assembles a consultant-grade, defensible report for review by a qualified industrial hygienist or EHS professional. It identifies risk indicators and produces prioritized follow-up — it does not make regulatory classifications or compliance determinations. Learn more at atmosflow.net.'

export const LIMITATIONS_BASE = [
  'This assessment is screening-level. Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on the assessment date only. No laboratory-analyzed integrated samples, microbial sampling, or destructive investigation were performed unless specifically noted. Direct-reading TVOC and PM2.5 are non-specific indicators and do not identify individual compounds or establish toxicological significance. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation, and should not be relied upon as such.',
]

// Methodology bullets default (when instrument details are sparse).
export function methodologyBullets(instrument, calibration) {
  return [
    `${instrument || 'Direct-reading instrumentation'}${calibration ? ` (calibration: ${calibration})` : ''}. Carbon dioxide, carbon monoxide, temperature, relative humidity, fine particulate (PM2.5), and total VOCs captured as available.`,
    'Measurement protocol: grab readings at occupied breathing-zone height (approx. 1.5 m) held to stabilization before recording; continuous logging where a logger was deployed.',
  ]
}

// Deterministic executive summary from Report Model facts.
export function buildExecSummary({ firm, facility, date, numberOfZones, purpose, flaggedCount, topOutcome }) {
  const scopeBit = numberOfZones ? ` across ${numberOfZones} representative zone${numberOfZones === 1 ? '' : 's'}` : ''
  const purposeBit = purpose ? ` in response to ${String(purpose).toLowerCase()}` : ''
  const outcomeBit = flaggedCount > 0
    ? `The assessment flagged ${flaggedCount} screening item${flaggedCount === 1 ? '' : 's'} for follow-up; each finding below carries a confidence rating and the verification it would need.`
    : 'No conditions were flagged above the screening references during the assessment window.'
  return `On ${date}, ${firm} conducted a screening-level indoor air quality (IAQ) assessment of ${facility}${purposeBit}. The assessment combined direct-reading instrument measurements with visual inspection and occupant interviews${scopeBit} during normal occupied-hours operation. Its purpose is to characterize ventilation adequacy, thermal comfort, and common airborne indicators, and to prioritize follow-up where conditions warrant. ${outcomeBit} This is a screening evaluation; results reflect conditions observed during the assessment window and are interpreted in light of the limitations herein.`
}

export function buildOverallStatement({ flaggedCount, elevatedZones }) {
  if (!flaggedCount) return 'All screened parameters were within recognized screening references during the assessment window. Routine operation and periodic re-screening are appropriate; no corrective action is indicated at this time.'
  const z = elevatedZones && elevatedZones.length ? ` Conditions of note were concentrated in ${elevatedZones.join(', ')}.` : ''
  return `Most areas presented acceptable ventilation, comfort, and air-quality indicators, with ${flaggedCount} item${flaggedCount === 1 ? '' : 's'} flagged for follow-up.${z} Each flagged item carries a confidence rating and the verification it would require; recommended actions follow a verify-before-invest ladder.`
}
