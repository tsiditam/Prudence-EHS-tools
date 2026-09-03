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
import { comfortSeason } from '../engines/scoring'

const HCHO_MW = 30.03

// Overview groups parameters into these sections, in this order.
export const CATEGORY = [
  { id: 'thermal',  label: 'Thermal Comfort' },
  { id: 'air',      label: 'Air Quality' },
  { id: 'chemical', label: 'Chemical Indicators' },
]
const CAT_OF = { temp: 'thermal', rh: 'thermal', co2: 'air', pm25: 'air', pm10: 'air', co: 'air', tvoc: 'chemical', hcho: 'chemical' }
export function categoryOf(param) { return CAT_OF[param] || 'air' }

// Season IS the engine's rule — the same `comfortSeason` thermal scoring
// calls — so the band drawn here cannot disagree with the finding beside it
// (audit H5). This file used to carry a third copy that defaulted a missing
// timestamp to 'summer'; with no timestamp there is now no season and no
// band, and the card says why. Display-only.
const seasonForTs = (ts) => comfortSeason(ts)

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
// `tvocToUnit` was removed in 2026-08. It converted a TVOC THRESHOLD into
// whatever unit a logger reported, disclosing the calibration-gas equivalence
// the crossing assumed. There are no TVOC thresholds left to convert.
//
// `convertTvoc` in utils/vocConversion.js is untouched and still converts
// READINGS — a logger reporting ppb and a card displaying µg/m³ is a live
// concern regardless of whether anything judges the number.

const round = (v, dp = 0) => (v == null ? null : Number(v.toFixed(dp)))

/**
 * Resolve a parameter's screening references, in the unit the data was
 * logged/displayed in. Returns:
 *   { category, unit, limit, limitLabel, band, refs, note }
 * `limit` is the primary gauge tick (single-bound params); `band` is the
 * comfort range (temp/rh). `refs` are short display strings; `note` is a
 * required advisory disclaimer (CO₂ as a ventilation surrogate; for TVOC,
 * the statement that no reference is shown and why).
 */
export function paramReference(param, opts = {}) {
  // `opts.calibrationGas` — the free-text PID span gas for this survey
  // (`pid_cal_gas`). It decides which molecular weight a mass threshold is
  // restated through, and is named in the note either way. Absent, the
  // conversion falls back to isobutylene and says that it did.
  const unit = opts.unit || ''
  const out = { category: categoryOf(param), unit, limit: null, limitLabel: null, band: null, refs: [], note: null }

  switch (param) {
    case 'temp': {
      const ssn = seasonForTs(opts.ts)
      if (!ssn) {
        out.refs = [`${STD.t.ref}: seasonal comfort band not shown — no timestamp to select the season`]
        out.note = 'The ASHRAE 55 comfort band is seasonal (clothing insulation). Without a timestamp for the logged period no season can be selected, so no band is drawn.'
        break
      }
      const s = STD.t.temp[ssn]
      // Band stored in °F; project to the displayed unit.
      const lo = convertTempValue(s.min, '°F', unit === '°C' ? '°C' : '°F')
      const hi = convertTempValue(s.max, '°F', unit === '°C' ? '°C' : '°F')
      out.band = { min: round(lo, 0), max: round(hi, 0) }
      out.refs = [`${STD.t.ref}: ${out.band.min}–${out.band.max} ${unit || '°F'} comfort`]
      break
    }
    case 'rh':
      out.band = { min: STD.t.rh.min, max: STD.t.rh.max }
      out.refs = [`${STD.t.rh.ref}: ${STD.t.rh.min}–${STD.t.rh.max}% RH`]
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
    case 'tvoc':
      // No reference, deliberately (2026-08). This case resolved Mølhave's
      // 500 µg/m³ advisory tier, converting it into whatever unit the logger
      // reported and disclosing the calibration-gas equivalence it assumed.
      // The conversion machinery was careful and the tier behind it was not a
      // limit — it is a research dose-response framework, and TVOC is a
      // non-specific sum with no consensus health-based limit.
      //
      // The card still shows the reading. It shows no line, no label and no
      // "refs" list, because there is nothing published to compare against.
      out.note = 'TVOC is a non-specific sum of photoionizable compounds and identifies no individual substance. No consensus health-based limit exists for it, so no reference is shown. Speciation (EPA Method TO-17) identifies the compounds present.'
      break
    case 'hcho': {
      out.limit = round(hchoToUnit(STD.c.hcho.niosh, unit), isPpm(unit) ? 3 : (isMg(unit) ? 3 : 1))
      out.limitLabel = 'NIOSH REL'
      out.refs = [`NIOSH REL: ${round(hchoToUnit(STD.c.hcho.niosh, 'ppb'), 0)} ppb`, `EPA RfC: ${round(hchoToUnit(STD.c.hcho.epaRfc, 'ppb'), 1)} ppb`, `WHO 30-min: ${round(hchoToUnit(STD.c.hcho.who, 'ppb'), 0)} ppb`]
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
