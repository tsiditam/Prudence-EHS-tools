/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Ventilation engine — required outdoor air against estimated delivery.
 *
 * Three pure calculations, one comparison:
 *
 *   1. requiredOutdoorAir   — ASHRAE 62.1 Ventilation Rate Procedure,
 *                             Vbz = Rp·Pz + Ra·Az, then Voz = Vbz / Ez.
 *                             Rp / Ra come from STD.v.oa (standards.js), the
 *                             same table scoring.js reads as the requirement,
 *                             so the tool and the engine can never disagree
 *                             about what "required" means.
 *   2. steadyStateDelivery  — CO₂ mass balance at equilibrium,
 *                             Vo = G·10⁶ / (Cin − Cout). Reuses the G and the
 *                             differential floor in utils/ventilation.js so
 *                             the intake helper and Logger Studio keep one
 *                             method.
 *   3. decayTwoPoint /      — Transient (decay) method: after occupants leave,
 *      decayFromSeries        ACH = ln((C₀ − Cout) / (Cₜ − Cout)) / Δt. It is
 *                             independent of the generation rate G, which is
 *                             the largest uncertainty in method 2, so it is the
 *                             stronger estimate when a decay period exists.
 *
 * Every result is an ESTIMATE and says so: it carries the method, its
 * assumptions and an uncertainty band. A direct airflow measurement (duct
 * traverse, balometer at the diffuser, ASTM E741 tracer gas) always
 * outranks a CO₂-based estimate for compliance documentation, and the
 * comparison never asserts compliance — it states the ratio and leaves the
 * determination to the professional.
 *
 * Sources (verify against the primary text before any number is changed):
 *   • ASHRAE Standard 62.1-2025, §6.2 (VRP), Table 6-1 (Rp, Ra), Table 6-4
 *     (zone air distribution effectiveness, Ez).
 *   • ASTM D6245-18, Standard Guide for Using Indoor Carbon Dioxide
 *     Concentrations to Evaluate Indoor Air Quality and Ventilation —
 *     steady-state and decay methods; equilibrium needs ~3 time constants.
 *   • Persily & de Jonge (2017), "Carbon dioxide generation rates for
 *     building occupants", Indoor Air 27(5): 868–879 — G by activity level;
 *     generation scales approximately with metabolic rate.
 *   • Batterman (2017), "Review and Extension of CO₂-Based Methods to
 *     Determine Ventilation Rates", IJERPH 14(2): 145 — error sources of the
 *     steady-state, decay and build-up methods.
 */

import { STD } from '../../constants/standards'
import { G_CFM_PER_PERSON, MIN_DIFFERENTIAL_PPM } from '../../utils/ventilation'

export const VENTILATION_ENGINE_VERSION = '1.0.0'

const num = (v) => {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const r1 = (n) => Math.round(n * 10) / 10
const r2 = (n) => Math.round(n * 100) / 100

// ── Required (ASHRAE 62.1 VRP) ─────────────────────────────────────

// Human labels for the STD.v.oa categories. Keys are the table's own keys
// (and the intake `su` options) so a zone's space use selects its row.
export const SPACE_TYPE_LABELS = {
  office: 'Office space', classroom: 'Classroom (age 9+)', retail: 'Retail sales', healthcare: 'Healthcare — general',
  lab: 'Science laboratory', warehouse: 'Warehouse', manufacturing: 'Manufacturing', conference: 'Conference / meeting',
  data_center: 'Data center', restaurant: 'Restaurant dining', gymnasium: 'Gymnasium / fitness', auditorium: 'Auditorium',
  library: 'Library', cafeteria: 'Cafeteria', lobby: 'Lobby', parking: 'Enclosed parking',
}
export const SPACE_TYPES = Object.keys(STD.v.oa).map((key) => ({ key, label: SPACE_TYPE_LABELS[key] || key, ...STD.v.oa[key] }))

// Zone air distribution effectiveness — ASHRAE 62.1 Table 6-4. The four
// configurations an assessor can identify from the room; the value is
// editable in the tool for any configuration not listed.
export const EZ_PRESETS = [
  { key: 'ceiling_cool', label: 'Ceiling, cool air', ez: 1.0 },
  { key: 'ceiling_warm_ceiling_return', label: 'Ceiling, warm air, ceiling return', ez: 0.8 },
  { key: 'floor_cool_displacement', label: 'Floor, cool air (displacement)', ez: 1.2 },
  { key: 'floor_warm', label: 'Floor, warm air', ez: 1.0 },
]

export const REQUIRED_CITATION = 'ASHRAE 62.1-2025 §6.2 Ventilation Rate Procedure: Vbz = Rp·Pz + Ra·Az (Table 6-1); Voz = Vbz / Ez (Table 6-4).'

/**
 * Breathing-zone and zone outdoor-air requirement.
 * Returns null when the space type is unknown or neither occupants nor
 * area is given. `partial` is true when one of the two terms is missing —
 * the result is then a floor, not the requirement.
 */
export function requiredOutdoorAir({ spaceType, occupants, areaSqft, ez = 1.0 }) {
  const rates = STD.v.oa[spaceType]
  if (!rates) return null
  const pz = num(occupants)
  const az = num(areaSqft)
  if (pz == null && az == null) return null
  const e = num(ez)
  const ezUsed = e != null && e > 0 ? e : 1.0
  const people = pz != null ? rates.pp * pz : null
  const area = az != null ? rates.ps * az : null
  const vbz = (people || 0) + (area || 0)
  const voz = vbz / ezUsed
  return {
    spaceType, rp: rates.pp, ra: rates.ps, pz, az, ez: ezUsed,
    people: people != null ? r1(people) : null,
    area: area != null ? r1(area) : null,
    vbz: r1(vbz), voz: r1(voz),
    perPerson: pz > 0 ? r1(voz / pz) : null,
    partial: pz == null || az == null,
    citation: REQUIRED_CITATION,
  }
}

// ── Delivered — steady-state CO₂ ───────────────────────────────────

// Occupant activity → CO₂ generation. G at 1.2 met is the app-wide constant
// (utils/ventilation.js); generation scales approximately linearly with
// metabolic rate (Persily & de Jonge 2017), which is how the other levels
// are derived. Offered levels are the ones an assessor can judge by eye.
export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: 'Sedentary (1.2 met)', met: 1.2 },
  { key: 'light', label: 'Light activity (1.6 met)', met: 1.6 },
  { key: 'moderate', label: 'Moderate work (2.0 met)', met: 2.0 },
]
export const generationCfm = (met = 1.2) => G_CFM_PER_PERSON * (met / 1.2)
// Persily & de Jonge report ~±10% across typical adult demographics at a
// given activity; carried as a symmetric band on the estimate.
export const G_UNCERTAINTY = 0.10

export const STEADY_STATE_CITATION = 'Steady-state CO₂ mass balance, Vo = G·10⁶ / (Cin − Cout) (ASTM D6245-18; Persily & de Jonge 2017). Valid only at equilibrium — roughly three air-change time constants of steady occupancy.'

/**
 * Outdoor-air delivery per person from an indoor / outdoor CO₂ pair.
 * Returns { error } when the differential is below the reliability floor,
 * null when inputs are not numbers.
 */
export function steadyStateDelivery({ indoorPpm, outdoorPpm, met = 1.2 }) {
  const cs = num(indoorPpm)
  const co = num(outdoorPpm)
  if (cs == null || co == null) return null
  const delta = cs - co
  if (delta < MIN_DIFFERENTIAL_PPM) {
    return { error: `CO₂ differential is ${Math.round(delta)} ppm — below the ${MIN_DIFFERENTIAL_PPM} ppm floor where the mass-balance estimate is reliable. Use a direct airflow measurement.` }
  }
  const g = generationCfm(met)
  const cfm = (g * 1e6) / delta
  if (!Number.isFinite(cfm) || cfm <= 0) return null
  return {
    method: 'steady_state',
    cfmPerPerson: r1(cfm),
    low: r1(cfm * (1 - G_UNCERTAINTY)),
    high: r1(cfm * (1 + G_UNCERTAINTY)),
    delta: Math.round(delta), g: Number(g.toFixed(4)), met,
    citation: STEADY_STATE_CITATION,
    assumptions: [
      'Occupancy and outdoor-air delivery were steady long enough to reach equilibrium.',
      `Occupants at about ${met} met; generation rate ${generationCfm(met).toFixed(4)} cfm/person (±${Math.round(G_UNCERTAINTY * 100)}%).`,
      'Outdoor CO₂ was measured, not assumed.',
    ],
  }
}

// ── Delivered — decay (transient) ──────────────────────────────────

export const DECAY_CITATION = 'CO₂ decay method, ACH = ln((C₀ − Cout) / (Cₜ − Cout)) / Δt, over an unoccupied period (ASTM D6245-18; Batterman 2017). Independent of the occupant generation rate.'

/**
 * Air-change rate from two readings across an unoccupied decay.
 * Requires C₀ > Cₜ > Cout and a positive elapsed time.
 */
export function decayTwoPoint({ startPpm, endPpm, outdoorPpm, minutes }) {
  const c0 = num(startPpm), ct = num(endPpm), co = num(outdoorPpm), m = num(minutes)
  if (c0 == null || ct == null || co == null || m == null) return null
  if (m <= 0) return { error: 'Elapsed time must be positive.' }
  if (!(c0 > ct)) return { error: 'The end reading must be lower than the start reading — the decay method needs a falling trace.' }
  if (!(ct > co)) return { error: 'Both readings must sit above outdoor CO₂; a reading at or below outdoor has no decay left to fit.' }
  const ach = Math.log((c0 - co) / (ct - co)) / (m / 60)
  if (!Number.isFinite(ach) || ach <= 0) return null
  return { method: 'decay', ach: r2(ach), hours: r2(m / 60), n: 2, r2: null, citation: DECAY_CITATION, assumptions: DECAY_ASSUMPTIONS }
}

const DECAY_ASSUMPTIONS = [
  'The space was unoccupied for the whole period, so no CO₂ was generated.',
  'Outdoor-air delivery and outdoor CO₂ were constant across the period.',
  'The air was well mixed at the sensor location.',
]

/**
 * Air-change rate by least-squares fit of ln(C − Cout) against time over a
 * decay series. `points` are { t: ms, co2: ppm }. Needs at least four
 * readings above outdoor CO₂. Returns the fitted ACH with r² so the tool
 * can say how well the decay actually followed an exponential.
 */
export function decayFromSeries(points, outdoorPpm) {
  const co = num(outdoorPpm)
  if (co == null || !Array.isArray(points)) return null
  const rows = points
    .map((p) => ({ t: num(p && p.t), c: num(p && p.co2) }))
    .filter((p) => p.t != null && p.c != null && p.c > co)
    .sort((a, b) => a.t - b.t)
  if (rows.length < 4) return { error: 'The decay method needs at least four readings above outdoor CO₂.' }
  const t0 = rows[0].t
  const xs = rows.map((p) => (p.t - t0) / 3.6e6)
  const ys = rows.map((p) => Math.log(p.c - co))
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
  if (sxx === 0) return { error: 'All readings share one timestamp.' }
  const slope = sxy / sxx
  const ach = -slope
  if (!Number.isFinite(ach) || ach <= 0) return { error: 'The trace does not fall over the period — no decay to fit.' }
  const rsq = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { method: 'decay', ach: r2(ach), hours: r2(xs[n - 1]), n, r2: r2(rsq), citation: DECAY_CITATION, assumptions: DECAY_ASSUMPTIONS }
}

/** ACH → outdoor-air cfm for a room volume in ft³ (and per person). */
export function achToCfm(ach, volumeCuft, occupants) {
  const a = num(ach), v = num(volumeCuft), p = num(occupants)
  if (a == null || v == null || v <= 0) return null
  const cfm = (a * v) / 60
  return { cfm: r1(cfm), cfmPerPerson: p > 0 ? r1(cfm / p) : null }
}

// ── Comparison ─────────────────────────────────────────────────────

/**
 * Delivered against required, per person. Levels are bands on the ratio,
 * worded as an estimate; the professional makes the determination.
 */
export function compareDelivery({ requiredPerPerson, deliveredPerPerson }) {
  const req = num(requiredPerPerson), del = num(deliveredPerPerson)
  if (req == null || del == null || req <= 0) return null
  const ratio = del / req
  const pct = Math.round(ratio * 100)
  let level, statement
  if (ratio < 0.8) {
    level = 'below'
    statement = `Estimated delivery is about ${pct}% of the ASHRAE 62.1 minimum — below the requirement, on this estimate.`
  } else if (ratio < 1.0) {
    level = 'near'
    statement = `Estimated delivery is about ${pct}% of the ASHRAE 62.1 minimum — within the estimate's uncertainty of the requirement.`
  } else {
    level = 'meets'
    statement = `Estimated delivery is about ${pct}% of the ASHRAE 62.1 minimum — at or above the requirement, on this estimate.`
  }
  return { ratio: r2(ratio), pct, level, statement }
}
