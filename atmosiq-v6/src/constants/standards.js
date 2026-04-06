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
    co2: { base: 420, diff: 700, con: 1000, act: 1500 },
    oa: {
      office:        { pp: 5,   ps: 0.06 },
      classroom:     { pp: 10,  ps: 0.12 },
      retail:        { pp: 7.5, ps: 0.12 },
      healthcare:    { pp: 5,   ps: 0.06 },
      lab:           { pp: 10,  ps: 0.18 },
      warehouse:     { pp: 5,   ps: 0.06 },
      manufacturing: { pp: 10,  ps: 0.18 },
      conference:    { pp: 5,   ps: 0.06 },
      data_center:   { pp: 5,   ps: 0.06 },
    },
  },
  c: {
    co:   { osha: 50,   niosh: 35 },
    hcho: { osha: 0.75, niosh: 0.016, al: 0.5 },
    pm25: { epa: 35,    who: 15 },
    tvoc: { con: 500,   act: 3000 },
  },
}

export const VER = '6.0.0'

export const PLAT_MODULES = [
  { id: 'atmosiq',    n: 'AtmosIQ',            i: '🌬️', on: true },
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