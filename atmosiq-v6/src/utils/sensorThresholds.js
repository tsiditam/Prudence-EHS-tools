/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * sensorThresholds — screening reference resolution for Logger Studio's
 * Overview cards. Pure + unit-testable (no React, no DOM).
 *
 * Thresholds come from the standards manifest (`STD`), never hardcoded
 * here — this module only *resolves* a parameter's reference(s) into the
 * unit the data was logged in and decides whether the screening values
 * sit above a reference. It makes no compliance or health determination;
 * every output is screening-level and framed for IH review.
 */
import { STD } from '../constants/standards'
import { ppbToUgm3, ugm3ToPpb, convertTempValue } from './sensorParser'

const HCHO_MW = 30.03
const ISOBUTYLENE_MW = 56.11

// Overview groups parameters into these sections, in this order.
export const CATEGORY = [
  { id: 'thermal',  label: 'Thermal Comfort' },
  { id: 'air',      label: 'Air Quality' },
  { id: 'chemical', label: 'Chemical Indicators' },
]
const CAT_OF = { temp: 'thermal', rh: 'thermal', co2: 'air', pm25: 'air', pm10: 'air', co: 'air', tvoc: 'chemical', hcho: 'chemical' }
export function categoryOf(param) { return CAT_OF[param] || 'air' }

// Season mirrors the engine's calendar rule (May–Oct summer) so the
// comfort band shown here agrees with thermal scoring. Display-only.
function seasonForTs(ts) {
  if (ts == null) return 'summer'
  const m = new Date(ts).getMonth()
  return (m >= 4 && m <= 9) ? 'summer' : 'winter'
}

const norm = (u) => String(u || '').toLowerCase()
const isUg = (u) => /µg|ug/.test(norm(u))
const isMg = (u) => /mg/.test(norm(u))
const isPpm = (u) => norm(u).includes('ppm')
const isPpb = (u) => norm(u).includes('ppb')

// HCHO published value (ppm) → the unit the log used.
// Exported so the Indoor Environmental Monitoring Report's reference
// profiles can project ALTERNATE published values (EPA RfC, WHO 30-min,
// OSHA PEL) into the logged unit without duplicating this conversion.
export function hchoToUnit(ppm, unit) {
  if (isPpb(unit)) return ppm * 1000
  if (isMg(unit)) return ppbToUgm3(ppm * 1000, HCHO_MW) / 1000
  if (isUg(unit)) return ppbToUgm3(ppm * 1000, HCHO_MW)
  return ppm // ppm (default)
}
// TVOC published value (µg/m³) → the unit the log used. Exported for the
// monitoring report's reference profiles (see hchoToUnit above).
/**
 * Mølhave's tier in the unit the data was logged in — or null when that
 * cannot honestly be done.
 *
 * mg/m3 and ug/m3 are the same measurand at different scales, so those
 * convert. ppb and ppm are not: crossing to them needs a molecular weight,
 * and Mølhave's 500 ug/m3 is the mass of a defined 22-compound mixture with
 * no single molecular weight to use. This used to reach for isobutylene's
 * (500 x 24.45 / 56.11 = 218 ppb) because that is what a PID is calibrated
 * against — but the PID's isobutylene-equivalent response and Mølhave's
 * mixture mass are different quantities, and the conversion made them look
 * like one. See `convertible` in constants/criteria.js.
 *
 * Returns null rather than a number so a caller cannot accidentally render
 * a comparison that does not exist. Every caller must handle it.
 */
export function tvocToUnit(ugm3, unit) {
  if (isMg(unit)) return ugm3 / 1000
  if (isUg(unit)) return ugm3
  return null
}

const round = (v, dp = 0) => (v == null ? null : Number(v.toFixed(dp)))

/**
 * Resolve a parameter's screening references, in the unit the data was
 * logged/displayed in. Returns:
 *   { category, unit, limit, limitLabel, band, refs, note }
 * `limit` is the primary gauge tick (single-bound params); `band` is the
 * comfort range (temp/rh). `refs` are short display strings; `note` is a
 * required advisory disclaimer (TVOC Mølhave / CO₂ ventilation surrogate).
 */
export function paramReference(param, opts = {}) {
  const unit = opts.unit || ''
  const out = { category: categoryOf(param), unit, limit: null, limitLabel: null, band: null, refs: [], note: null }

  switch (param) {
    case 'temp': {
      const s = STD.t.temp[seasonForTs(opts.ts)]
      // Band stored in °F; project to the displayed unit.
      const lo = convertTempValue(s.min, '°F', unit === '°C' ? '°C' : '°F')
      const hi = convertTempValue(s.max, '°F', unit === '°C' ? '°C' : '°F')
      out.band = { min: round(lo, 0), max: round(hi, 0) }
      out.refs = [`${STD.t.ref}: ${out.band.min}–${out.band.max} ${unit || '°F'} comfort`]
      break
    }
    case 'rh':
      out.band = { min: STD.t.rh.min, max: STD.t.rh.max }
      out.refs = [`${STD.v.ref}: ${STD.t.rh.min}–${STD.t.rh.max}% RH`]
      break
    case 'co2':
      out.limit = STD.v.co2.con
      out.limitLabel = 'NIOSH'
      out.refs = [`NIOSH: <${STD.v.co2.con} ppm`, `${STD.v.ref} ventilation surrogate (Δ${STD.v.co2.diff} ppm above outdoor)`]
      out.note = 'CO₂ indexes ventilation per occupant (ASHRAE 62.1 / Persily 2021), not a health limit.'
      break
    case 'pm25':
      out.limit = STD.c.pm25.epa
      out.limitLabel = 'EPA 24-h'
      out.refs = [`EPA 24-h: ${STD.c.pm25.epa} µg/m³`, `WHO 24-h: ${STD.c.pm25.who} µg/m³`]
      break
    case 'pm10':
      out.limit = STD.c.pm10.epa
      out.limitLabel = 'EPA 24-h'
      out.refs = [`EPA 24-h: ${STD.c.pm10.epa} µg/m³`, `WHO 24-h: ${STD.c.pm10.who} µg/m³`]
      break
    case 'co':
      out.limit = STD.c.co.epa
      out.limitLabel = 'EPA NAAQS 8-h'
      out.refs = [`OSHA PEL: ${STD.c.co.osha} ppm`, `EPA NAAQS 8-h: ${STD.c.co.epa} ppm`]
      break
    case 'tvoc': {
      const molhave = tvocToUnit(STD.c.tvoc.con, unit)
      if (molhave == null) {
        // Logged in ppb/ppm — no comparison to Mølhave is available, and
        // saying so is the finding. A converted number here would be a
        // different quantity presented as the same one.
        out.limit = null
        out.limitLabel = null
        out.refs = [`Mølhave advisory: <${STD.c.tvoc.con} µg/m³ (mass basis)`]
        out.note =
          `TVOC has no consensus health limit. The Mølhave 1991 advisory tier (${STD.c.tvoc.con} µg/m³) `
          + 'is the mass concentration of a defined 22-compound mixture; this data is logged as '
          + 'isobutylene-equivalent response, which is a different quantity. No valid comparison to '
          + 'that tier can be made from these readings — they are reported in the units recorded.'
        break
      }
      out.limit = round(molhave, isMg(unit) ? 3 : 0)
      out.limitLabel = 'Mølhave advisory'
      out.refs = [`Mølhave advisory: <${STD.c.tvoc.con} µg/m³`]
      out.note = 'TVOC has no consensus health limit; 500 µg/m³ is the Mølhave 1991 multifactorial-exposure advisory tier, on a mass basis.'
      break
    }
    case 'hcho': {
      out.limit = round(hchoToUnit(STD.c.hcho.niosh, unit), isPpm(unit) ? 3 : (isMg(unit) ? 3 : 1))
      out.limitLabel = 'NIOSH REL'
      out.refs = ['NIOSH REL: 16 ppb', 'EPA RfC: ~8 ppb', 'WHO 30-min: 81 ppb']
      break
    }
    default:
      break
  }
  return out
}

/**
 * Screening exceedance for a parameter, given its stats ({ mean, max })
 * and resolved reference. Sustained mean over a single-bound limit reads
 * as the stronger 'danger'; a peak-only excursion reads as 'warn'. Comfort
 * bands flag 'warn' when the mean sits outside the range. Returns
 * { level: 'danger'|'warn'|null, message }.
 */
export function exceedance(param, stats, ref) {
  if (!stats || !ref) return { level: null, message: null }
  const u = ref.unit ? ` ${ref.unit}` : ''
  if (ref.band) {
    const { mean } = stats
    if (mean == null) return { level: null, message: null }
    if (mean < ref.band.min) return { level: 'warn', message: `Mean ${round(mean, 1)}${u} below the ${ref.refs[0]?.split(':')[0]} comfort range` }
    if (mean > ref.band.max) return { level: 'warn', message: `Mean ${round(mean, 1)}${u} above the comfort range` }
    return { level: null, message: null }
  }
  if (ref.limit == null) return { level: null, message: null }
  const label = ref.limitLabel || 'reference'
  if (stats.mean != null && stats.mean > ref.limit) {
    return { level: 'danger', message: `Mean exceeds ${label} (${ref.limit}${u})` }
  }
  if (stats.max != null && stats.max > ref.limit) {
    return { level: 'warn', message: `Peak ${round(stats.max, isPpm(ref.unit) ? 2 : 1)}${u} exceeded ${label}` }
  }
  return { level: null, message: null }
}

/**
 * Conservative SCREENING detection floors.
 *
 * The concentration below which a whole-series field reading for this analyte
 * sits at or under the usable range of common direct-reading IAQ instruments
 * and should be treated as NON-QUANTITATIVE. These are generic screening
 * floors, NOT a specific instrument's published limit of detection — the
 * report says so and directs the assessor to confirm against their
 * instrument's LOD. Seeded conservatively; add an analyte only where a
 * sub-floor series is physically implausible for field instruments (a
 * genuinely near-zero reading, e.g. indoor CO, must not be false-flagged).
 *
 * `ppb` is the floor in ppb (canonical for gas-phase trace analytes); `mw` is
 * the molecular weight used to project it into a µg/m³ or mg/m³ logged unit.
 */
export const SCREENING_DETECTION_FLOORS = {
  // Indoor formaldehyde is essentially always at least a few ppb, and field
  // HCHO sensors resolve ~1 ppb; a series topping out below 1 ppb is at the
  // instrument's noise floor, not a measured concentration.
  hcho: { ppb: 1, mw: HCHO_MW },
}

// Project a ppb floor into the unit the data was logged in. Returns null when
// the unit is not a recognised concentration unit (no guessed comparison).
function floorInUnit(floorPpb, mw, unit) {
  if (isPpb(unit)) return floorPpb
  if (isPpm(unit)) return floorPpb / 1000
  if (isUg(unit)) return ppbToUgm3(floorPpb, mw)
  if (isMg(unit)) return ppbToUgm3(floorPpb, mw) / 1000
  return null
}

/**
 * True when a parameter's ENTIRE series sits at/below its conservative
 * screening detection floor — i.e. even the maximum reading is sub-floor, so
 * the data is non-quantitative. Given the parameter, its max reading, and the
 * unit it was logged in. Params with no floor, a non-finite max, or an
 * unconvertible unit return false (no claim is made).
 */
export function belowScreeningFloor(param, maxValue, unit) {
  const def = SCREENING_DETECTION_FLOORS[param]
  if (!def || maxValue == null || !Number.isFinite(maxValue)) return false
  const floor = floorInUnit(def.ppb, def.mw, unit)
  if (floor == null) return false
  return maxValue < floor
}
