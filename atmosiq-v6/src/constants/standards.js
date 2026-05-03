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

import { ENGINE_VERSION, STANDARDS_MANIFEST_DATE } from '../version'

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
  'Molhave TVOC tiers': '1991 (advisory only)',
  'ANSI/ISA 71.04': '2013',
  'ISO 14644-1': '2015',
  'ASHRAE TC 9.9': '2011',
  'IEEE 1635 / ASHRAE Guideline 21': 'current',
  'NFPA 855': '2026',
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
    co:   { osha: 50,   niosh: 35 },
    hcho: { osha: 0.75, niosh: 0.016, al: 0.5 },
    pm25: { epa: 35,    who: 15 },
    tvoc: { con: 500,   act: 3000 },
  },
}

export { VER } from '../version'

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