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
function hchoToUnit(ppm, unit) {
  if (isPpb(unit)) return ppm * 1000
  if (isMg(unit)) return ppbToUgm3(ppm * 1000, HCHO_MW) / 1000
  if (isUg(unit)) return ppbToUgm3(ppm * 1000, HCHO_MW)
  return ppm // ppm (default)
}
// TVOC published value (µg/m³) → the unit the log used.
function tvocToUnit(ugm3, unit) {
  if (isMg(unit)) return ugm3 / 1000
  if (isUg(unit)) return ugm3
  const ppb = ugm3ToPpb(ugm3, ISOBUTYLENE_MW)
  return isPpm(unit) ? ppb / 1000 : ppb // ppm or ppb
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
      out.limit = STD.v.co2.well
      out.limitLabel = 'WELL v2'
      out.refs = [`WELL v2: <${STD.v.co2.well} ppm`, `NIOSH: <${STD.v.co2.con} ppm`]
      out.note = 'CO₂ indexes ventilation per occupant (ASHRAE 62.1 / Persily 2021), not a health limit.'
      break
    case 'pm25':
      out.limit = STD.c.pm25.epa
      out.limitLabel = 'EPA 24-h'
      out.refs = [`EPA 24-h: ${STD.c.pm25.epa} µg/m³`, `WHO 24-h: ${STD.c.pm25.who} µg/m³`]
      break
    case 'co':
      out.limit = STD.c.co.epa
      out.limitLabel = 'EPA NAAQS 8-h'
      out.refs = [`OSHA PEL: ${STD.c.co.osha} ppm`, `EPA NAAQS 8-h: ${STD.c.co.epa} ppm`]
      break
    case 'tvoc': {
      out.limit = round(tvocToUnit(STD.c.tvoc.con, unit), isPpm(unit) ? 2 : 0)
      out.limitLabel = 'Mølhave advisory'
      const ppbEquiv = round(ugm3ToPpb(STD.c.tvoc.con, ISOBUTYLENE_MW), 0)
      out.refs = [`Mølhave advisory: <${STD.c.tvoc.con} µg/m³ (≈${ppbEquiv} ppb)`]
      out.note = 'TVOC has no consensus health limit; 500 µg/m³ is the Mølhave 1991 multifactorial-exposure advisory tier (isobutylene-referenced).'
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
