/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Controlled narrative library for the fixed IAQ report.
 *
 * The renderer (lib/report/render-pdf.js) owns layout; THIS owns the words.
 * It is a deterministic narrative source: static "what it is
 * and why we measure it" explainers (never vary), severity-keyed "observed"
 * templates filled from the Report Model statistics, and the fixed
 * methodology / reference-framework / limitations / about blocks. No AI is
 * required to produce a complete report — an optional AI pass (api/narrative
 * + the banned-language gate) may later REFINE this baseline wording, but it
 * may never introduce a fact or change the technical position encoded here.
 *
 * Tone rules baked in: "consistent with / suggests / may indicate"; never
 * "caused / proves / unsafe / noncompliant"; ASHRAE 62.1 is a ventilation
 * indicator, not a CO2 limit; TVOC is a non-specific indicator that this
 * platform compares to nothing; PM2.5/NAAQS cited for scale, not as an
 * office limit.
 */

import { STD } from '../constants/standards.js'

// ── Static "what it is and why we measure it" explainers ───────────
export const WHAT_IS = {
  co2: 'Carbon dioxide is produced by people as they breathe and builds up indoors when the supply of outdoor air does not keep pace with the number of occupants. At the concentrations typical of offices it is not itself a health hazard, but it is the most practical real-time indicator of ventilation adequacy — elevated levels usually accompany "stuffiness" complaints and signal that a space is receiving too little fresh air for its occupant load.',
  co: 'Carbon monoxide is a colorless, odorless gas formed by incomplete combustion — vehicle exhaust, gas-fired appliances, and generators. Because it is an acute hazard that reduces the blood’s ability to carry oxygen, even low indoor readings are screened to rule out combustion sources migrating into occupied space.',
  tempRh: 'Dry-bulb temperature and relative humidity together define the thermal environment, which is the single most common driver of occupant comfort complaints. Relative humidity also affects air quality: sustained high humidity can support microbial growth, while very low humidity contributes to dryness and irritation. Temperature is evaluated against the ASHRAE 55 seasonal comfort range and humidity against the EPA moisture-control range; ASHRAE 55 sets no lower humidity limit.',
  pm25: 'PM2.5 refers to airborne particles 2.5 micrometers and smaller — fine enough to be inhaled deep into the lungs. Indoor sources include cooking, printing, and outdoor particles drawn in through the ventilation system. It is measured as an indicator of particulate exposure and of how effectively the building’s air filtration is performing.',
  tvoc: 'Total volatile organic compounds (TVOC) is a combined measure of the many gas-phase chemicals that off-gas from furnishings, finishes, adhesives, cleaning products, and office equipment. It is a non-specific indicator — it does not identify individual compounds — but elevated readings often accompany odor or irritation complaints and point to a source worth investigating.',
}

// ── Severity-keyed "observed" templates (filled from Report Model) ──
// Each returns the "Observed:" sentence(s) for the parameter, using only the
// supplied statistics. `s` = { range, mean, min, max, unit }.
const r2 = (s) => `${s.range}${s.unit ? ' ' + s.unit : ''}`

export const OBSERVED = {
  co2(s, outcome) {
    const base = `Observed: indoor CO2 ranged ${r2(s)} (site mean ${s.mean} ${s.unit}). ASHRAE 62.1 prescribes ventilation rates rather than a CO2 limit; an indoor-to-outdoor differential above roughly 700 ppm is commonly used as an indicator that outdoor-air delivery may be low relative to occupant load.`
    if (outcome === 'elevated') return base + ` The peak of ${s.max} ppm is consistent with possible under-ventilation at peak occupancy. This is an indicator, not a measured ventilation rate; occupant density, room volume, and supply airflow were not measured, so it remains a hypothesis pending airflow / BAS / TAB verification.`
    if (outcome === 'advisory') return base + ' One or more zones read above typical office background and may warrant additional monitoring; the readings are indicators, not measured ventilation rates.'
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
      ? base + ` Values fell within the ${STD.t.rh.min}–${STD.t.rh.max}% EPA moisture-control range (${STD.t.rh.ref}).`
      : base + ` One or more zones fell outside the ${STD.t.rh.min}–${STD.t.rh.max}% EPA moisture-control range (${STD.t.rh.ref}); sustained excursions may warrant moisture-control or humidification review.`
  },
  pm25(s, outcome) {
    const base = `Observed: PM2.5 ranged ${r2(s)} (site mean ${s.mean} ${s.unit}). For scale only, the US EPA 24-hour NAAQS is 35 µg/m³; NAAQS are outdoor, population-level standards, not office or occupational screening limits, and are cited here for context rather than as a pass/fail threshold.`
    return outcome === 'acceptable'
      ? base + ' Levels were generally low and comparable to values commonly observed in mechanically ventilated office environments.'
      : base + ' Higher readings in some zones are consistent with intermittent local sources (e.g. printing or cooking) — transient and local rather than a building-wide condition.'
  },
  // The only OBSERVED template that does not branch on outcome, and the
  // signature keeps its second argument so every caller stays uniform.
  // Until 2026-08 this branched acceptable / not-acceptable against Mølhave's
  // tiers and closed each branch by naming them. With no TVOC threshold left,
  // both halves became statements the data cannot carry: one said readings
  // "did not suggest a prominent VOC source", the other that sources "are
  // present" — a verdict either way, drawn from a sum that identifies no
  // compound. What the reading supports is the reading, plus what would be
  // needed to say more.
  tvoc(s) {
    return `Observed: TVOC ranged ${r2(s)} (isobutylene-equivalent; site mean ${s.mean} ${s.unit}). TVOC by photoionization is a non-specific, instrument- and calibration-dependent reading: it does not identify individual compounds and, on its own, does not establish exposure or toxicological significance. No consensus health-based limit exists for total VOCs and this assessment applies none, so the value is reported as measured — useful for comparing zones and tracking change, not for judging acceptability. Where a VOC source is suspected, speciation by sorbent tube with thermal desorption GC/MS (EPA Method TO-17) identifies the individual compounds, each of which has an exposure limit of its own.`
  },
}

// ── Fixed blocks ───────────────────────────────────────────────────
export const SEVERITY_LEGEND_NOTE = 'Acceptable: within recognized references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.'

export const REFERENCE_FRAMEWORK = 'Outcomes are compared against recognized consensus and regulatory references: ASHRAE 62.1 (ventilation, used as an indicator basis for CO2 — not a CO2 contaminant limit), ASHRAE 55 (thermal comfort), US EPA NAAQS (CO and PM2.5), OSHA PELs (29 CFR 1910.1000). References are used to contextualize readings, not to render compliance determinations. TVOC is deliberately absent from that list: no consensus health-based limit exists for a non-specific sum of organic species, so the measured value is reported without comparison to any reference.'

export const ABOUT_ATMOSFLOW = 'AtmosFlow is an IAQ assessment platform: it captures field observations and direct-reading measurements, compares them against recognized references, and assembles a consultant-grade, defensible report for review by a qualified industrial hygienist or EHS professional. It identifies risk indicators and produces prioritized follow-up — it does not make regulatory classifications or compliance determinations. Learn more at atmosflow.net.'

export const LIMITATIONS_BASE = [
  'Findings are based on direct-reading instrumentation captured during a single assessment window and reflect conditions on the assessment date only. No laboratory-analyzed integrated samples, microbial sampling, or destructive investigation were performed unless specifically noted. Direct-reading TVOC and PM2.5 are non-specific indicators and do not identify individual compounds or establish toxicological significance. This report does not constitute a regulatory exposure determination, an OSHA compliance certification, or a medical evaluation, and should not be relied upon as such.',
]

// How the zones described their own measurement type (`meas_duration`),
// collapsed to the phrase the protocol bullet uses. The report used to assert
// "grab readings … held to stabilization" for every assessment regardless —
// including ones where the assessor had explicitly recorded 5-minute or
// 15-minute averages, or continuous logging. The field was captured and then
// contradicted two sections later.
const DURATION_PHRASE = {
  'Spot check (instantaneous)': 'spot readings',
  '5-minute average': '5-minute averages',
  '15-minute average': '15-minute averages',
  '1-hour average': '1-hour averages',
  'Continuous logging': 'continuously logged readings',
}

// Methodology bullets default (when instrument details are sparse).
export function methodologyBullets(instrument, calibration, measurementTypes = []) {
  const phrases = [...new Set((measurementTypes || []).map(t => DURATION_PHRASE[t]).filter(Boolean))]
  // With nothing recorded the protocol sentence describes the height and the
  // stabilization practice without naming an averaging period it cannot know.
  const captured = phrases.length
    ? `${phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`} as recorded per zone`
    : 'readings as recorded per zone'
  return [
    `${instrument || 'Direct-reading instrumentation'}${calibration ? ` (calibration: ${calibration})` : ''}. Carbon dioxide, carbon monoxide, temperature, relative humidity, fine particulate (PM2.5), and total VOCs captured as available.`,
    `Measurement protocol: ${captured}, taken at occupied breathing-zone height (approx. 1.5 m) and held to stabilization before recording.`,
  ]
}

// Deterministic executive summary from Report Model facts.
export function buildExecSummary({ firm, facility, date, numberOfZones, purpose, flaggedCount, topOutcome, hasOccupantReports }) {
  const scopeBit = numberOfZones ? ` across ${numberOfZones} representative zone${numberOfZones === 1 ? '' : 's'}` : ''
  const purposeBit = purpose ? ` in response to ${String(purpose).toLowerCase()}` : ''
  const outcomeBit = flaggedCount > 0
    ? `The assessment flagged ${flaggedCount} item${flaggedCount === 1 ? '' : 's'} for follow-up; each finding below carries a confidence rating and the verification it would need.`
    : 'No conditions were flagged above the references during the assessment window.'
  // "occupant interviews" used to be asserted unconditionally, in an
  // assessment where occupant input is a set of dropdown answers and may be
  // absent entirely. The method sentence now names only what was done.
  const methods = `direct-reading instrument measurements with visual inspection${hasOccupantReports ? ' and documented occupant reports' : ''}`
  return `On ${date}, ${firm} conducted an indoor air quality (IAQ) assessment of ${facility}${purposeBit}. The assessment combined ${methods}${scopeBit} during normal occupied-hours operation. Its purpose is to characterize ventilation adequacy, thermal comfort, and common airborne indicators, and to prioritize follow-up where conditions warrant. ${outcomeBit} Results reflect conditions observed during the assessment window and are interpreted in light of the limitations herein.`
}

/**
 * The one-paragraph verdict under Findings at a Glance.
 *
 * It used to open "Most areas presented acceptable ventilation, comfort, and
 * air-quality indicators" whenever anything at all was flagged — the only
 * branch was flaggedCount === 0. In a two-zone assessment where BOTH zones
 * read Elevated it still said "Most areas", directly contradicting the table
 * printed immediately above it. A template states the CONDITION; how much of
 * the site is affected is a fact about the data, not a house style.
 *
 * `totalZones` is what makes "most" checkable. Absent it the paragraph falls
 * back to naming the affected zones without quantifying the rest, which is
 * the safe reading rather than a guess.
 */
export function buildOverallStatement({ flaggedCount, elevatedZones, totalZones }) {
  if (!flaggedCount) return 'All measured parameters were within recognized references during the assessment window. Routine operation and periodic reassessment are appropriate; no corrective action is indicated at this time.'
  const affected = (elevatedZones && elevatedZones.length) || 0
  const items = `${flaggedCount} item${flaggedCount === 1 ? '' : 's'} flagged for follow-up`
  const tail = ' Each flagged item carries a confidence rating and the verification it would require; recommended actions follow a verify-before-invest ladder.'
  const zoneList = affected ? elevatedZones.join(', ') : ''
  let lead
  if (!affected) {
    // Findings exist but no zone reached an elevated outcome — advisory-tier
    // conditions only. "Most areas acceptable" is fair here and is the one
    // case it was ever fair in.
    lead = `Measured parameters were within recognized references across the areas assessed, with ${items}.`
  } else if (totalZones && affected >= totalZones) {
    lead = `Every area assessed presented at least one condition of note, with ${items}. Conditions were found in ${zoneList}.`
  } else if (totalZones && affected > totalZones / 2) {
    lead = `Conditions of note were found in ${affected} of the ${totalZones} areas assessed, with ${items}: ${zoneList}.`
  } else if (totalZones) {
    lead = `Most areas presented acceptable ventilation, comfort, and air-quality indicators, with ${items}. Conditions of note were concentrated in ${zoneList}.`
  } else {
    lead = `${items.charAt(0).toUpperCase()}${items.slice(1)}. Conditions of note were recorded in ${zoneList}.`
  }
  return lead + tail
}
