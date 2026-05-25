/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ventilation — steady-state CO₂ mass-balance estimate of outdoor-air
 * delivery (cfm/person). Extracted from Co2OaCalculator so the same method
 * + citation drives both the single-point helper and Logger Studio's
 * indoor/outdoor differential view (no method drift).
 *
 * Method: ASHRAE 62.1-2019 Appendix C / Persily 2017 — for an adult at
 * sedentary metabolic activity (~1.2 met), the per-person CO₂ generation
 * rate G ≈ 0.0084 cfm. Under steady-state conditions the outdoor-air
 * ventilation rate per person is:
 *
 *   Vo (cfm/person) = G × 10⁶ / (C_indoor − C_outdoor)   (ppm)
 *
 * This is an *estimate*, not a direct measurement — it assumes occupancy is
 * steady and HVAC has reached equilibrium. For compliance work, verify with
 * a balometer reading at the OA diffuser. Screening-only positioning holds.
 */

// ASHRAE 62.1-2019 Appendix C: G ≈ 0.0084 cfm/person at 1.2 met (sedentary
// adult). Persily 2017 confirms this within ~10% for typical office demographics.
export const G_CFM_PER_PERSON = 0.0084

// Below this indoor−outdoor differential the mass-balance estimate is
// unreliable — small denominators blow up the result.
export const MIN_DIFFERENTIAL_PPM = 50

// One-line provenance string for captions / footnotes.
export const VENTILATION_CITATION =
  'Steady-state mass-balance with G = 0.0084 cfm/person (sedentary adult, 1.2 met). Per ASHRAE 62.1-2019 Appendix C; Persily 2017. Estimate only — verify with a balometer measurement at the OA diffuser for compliance documentation.'

/**
 * Estimate outdoor-air delivery (cfm/person) from indoor & outdoor CO₂.
 * Returns { cfmPerPerson } on success, { error } when the differential is
 * too small to be reliable, or null when inputs aren't finite numbers.
 */
export function calcCfmPerPerson(co2Indoor, co2Outdoor) {
  const cs = parseFloat(co2Indoor)
  const co = parseFloat(co2Outdoor)
  if (!Number.isFinite(cs) || !Number.isFinite(co)) return null
  const delta = cs - co
  if (delta < MIN_DIFFERENTIAL_PPM) {
    return { error: `CO₂ differential too small (<${MIN_DIFFERENTIAL_PPM} ppm). Mass-balance estimate is unreliable below this threshold — use a direct airflow measurement.` }
  }
  const vo = (G_CFM_PER_PERSON * 1e6) / delta
  if (!Number.isFinite(vo) || vo <= 0) return null
  return { cfmPerPerson: Math.round(vo * 10) / 10 }
}
