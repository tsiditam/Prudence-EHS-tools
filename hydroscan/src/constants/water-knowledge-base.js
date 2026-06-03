/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Marlow knowledge base — the lookup tables backing the assistant's tools.
 * EVERY regulatory value here resolves to src/constants/standards.js (the
 * hardcoded STANDARDS_MANIFEST). The analytical-method / preservation rows
 * are sourced from the same EPA / Standard Methods references catalogued in
 * the manifest bibliography. Marlow MUST NOT state a value that isn't
 * returned by one of these lookups — see water-assistant-prompt.js.
 *
 * Plain ES module (.js): imported by the api-graph-reachable tools module,
 * so it must stay free of extension-less `.ts` imports.
 */

import { PARAM_MAP, ALL_PARAMS, STATE_STDS } from './standards.js'

// Common synonyms / abbreviations → canonical parameter id. Lets Marlow's
// tools resolve "lead", "Pb", "PFOA", "nitrate" to the manifest record.
const ALIASES = {
  lead: 'pb', pb: 'pb',
  copper: 'cu', cu: 'cu',
  arsenic: 'as', as: 'as',
  nitrate: 'no3', 'nitrate as n': 'no3', no3: 'no3',
  nitrite: 'no2', no2: 'no2',
  fluoride: 'f', f: 'f',
  uranium: 'u', u: 'u',
  'total coliforms': 'tc', coliform: 'tc', coliforms: 'tc', tc: 'tc',
  'e. coli': 'ecoli', 'e coli': 'ecoli', ecoli: 'ecoli', 'escherichia coli': 'ecoli',
  turbidity: 'turb', turb: 'turb',
  ph: 'ph',
  tds: 'tds', 'total dissolved solids': 'tds',
  hardness: 'hard', hard: 'hard',
  iron: 'fe', fe: 'fe',
  manganese: 'mn', mn: 'mn',
  chlorine: 'cl2', 'free chlorine': 'cl2', cl2: 'cl2',
  chloramine: 'nh2cl',
  tthm: 'tthm', 'total thms': 'tthm', thms: 'tthm', trihalomethanes: 'tthm',
  haa5: 'haa5',
  bromate: 'br',
  benzene: 'benz', benz: 'benz',
  tce: 'tce', trichloroethylene: 'tce',
  pce: 'pce', tetrachloroethylene: 'pce',
  'vinyl chloride': 'vc', vc: 'vc',
  mtbe: 'mtbe',
  pfoa: 'pfoa', pfos: 'pfos', pfhxs: 'pfhxs', pfna: 'pfna',
  genx: 'hfpoda', 'hfpo-da': 'hfpoda', hfpoda: 'hfpoda', pfbs: 'pfbs',
}

/** Resolve a free-text parameter name/abbreviation to its manifest id. */
export function resolveParamId(input) {
  if (!input || typeof input !== 'string') return null
  const key = input.trim().toLowerCase()
  if (ALIASES[key]) return ALIASES[key]
  if (PARAM_MAP[key]) return key
  // Fuzzy: match against parameter display names.
  const byName = ALL_PARAMS.find((p) => p.name.toLowerCase() === key)
  if (byName) return byName.id
  const partial = ALL_PARAMS.find((p) => p.name.toLowerCase().includes(key) || key.includes(p.name.toLowerCase()))
  return partial ? partial.id : null
}

// Analytical method / container / preservative / hold-time rows, keyed by
// parameter id. Sourced from the EPA & Standard Methods references in the
// STANDARDS_MANIFEST bibliography (EPA 200.8 / 524.2 / 533 / 537.1 / 900.0,
// SM 9223 / SM 4500, EPA 3Ts). Used by lookup_sampling_method.
export const WATER_METHODS = {
  pb:    { methods: ['EPA 200.8 (ICP-MS)'], container: '250 mL HDPE (first-draw)', preservative: 'HNO₃ to pH < 2', hold: '180 days', note: 'First-draw after ≥ 6-hour stagnation; profile 1st/2nd draw + flushed per EPA 3Ts.' },
  cu:    { methods: ['EPA 200.8 (ICP-MS)', 'EPA 200.7 (ICP-AES)'], container: 'HDPE', preservative: 'HNO₃ to pH < 2', hold: '180 days', note: 'Pairs with lead under the Lead and Copper Rule.' },
  as:    { methods: ['EPA 200.8 (ICP-MS)'], container: 'HDPE', preservative: 'HNO₃ to pH < 2', hold: '180 days' },
  no3:   { methods: ['SM 4500-NO3', 'EPA 300.0 (IC)'], container: 'HDPE/glass', preservative: 'Cool ≤ 6 °C', hold: '48 hours (unpreserved)' },
  no2:   { methods: ['SM 4500-NO2', 'EPA 300.0 (IC)'], container: 'HDPE/glass', preservative: 'Cool ≤ 6 °C', hold: '48 hours' },
  f:     { methods: ['SM 4500-F', 'EPA 300.0 (IC)'], container: 'HDPE', preservative: 'None', hold: '28 days' },
  tc:    { methods: ['SM 9223 (Colilert / Colilert-18)'], container: 'Sterile 100 mL with Na₂S₂O₃ if chlorinated', preservative: 'Ice, < 10 °C', hold: '6 hours (strict)', note: 'Do not flame or pre-flush bacteria samples.' },
  ecoli: { methods: ['SM 9223 (Colilert / Colilert-18)'], container: 'Sterile 100 mL with Na₂S₂O₃ if chlorinated', preservative: 'Ice, < 10 °C', hold: '6 hours (strict)' },
  hpc:   { methods: ['SM 9215 (HPC)'], container: 'Sterile', preservative: 'Ice, < 10 °C', hold: '8 hours' },
  turb:  { methods: ['EPA 180.1', 'SM 2130'], container: 'Glass/HDPE', preservative: 'Cool, dark', hold: '48 hours' },
  ph:    { methods: ['SM 4500-H+', 'EPA 150.1'], container: 'Field meter (point of use)', preservative: 'Analyze immediately', hold: '15 minutes (field)', note: 'Field measurement — record at collection with a calibrated meter.' },
  cl2:   { methods: ['SM 4500-Cl (DPD)'], container: 'Field meter', preservative: 'Analyze immediately', hold: 'Immediate (field)', note: 'DPD colorimetric or amperometric; target 0.2–2.0 mg/L residual.' },
  tthm:  { methods: ['EPA 524.2 (GC-MS)', 'EPA 551.1'], container: '40 mL VOA vials, no headspace', preservative: 'HCl + Na₂S₂O₃', hold: '14 days' },
  haa5:  { methods: ['EPA 552.3', 'EPA 552.2'], container: 'Amber glass', preservative: 'NH₄Cl, cool', hold: '14 days' },
  benz:  { methods: ['EPA 524.2 (GC-MS)'], container: '40 mL VOA vials, no headspace', preservative: 'HCl to pH < 2, cool', hold: '14 days' },
  tce:   { methods: ['EPA 524.2 (GC-MS)'], container: '40 mL VOA vials, no headspace', preservative: 'HCl to pH < 2, cool', hold: '14 days' },
  pce:   { methods: ['EPA 524.2 (GC-MS)'], container: '40 mL VOA vials, no headspace', preservative: 'HCl to pH < 2, cool', hold: '14 days' },
  vc:    { methods: ['EPA 524.2 (GC-MS)'], container: '40 mL VOA vials, no headspace', preservative: 'HCl to pH < 2, cool', hold: '14 days' },
  ga:    { methods: ['EPA 900.0'], container: 'HDPE', preservative: 'HNO₃ or HCl', hold: '180 days' },
  ra:    { methods: ['EPA 903.1 / 904.0'], container: 'HDPE', preservative: 'HNO₃ or HCl', hold: '180 days' },
  pfoa:  { methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days', note: 'No waterproof/stain-resistant clothing during collection; detection ≤ 2 ppt for PFOA/PFOS.' },
  pfos:  { methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days' },
  pfhxs: { methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days' },
  pfna:  { methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days' },
  hfpoda:{ methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days' },
  pfbs:  { methods: ['EPA 533', 'EPA 537.1 (LC-MS/MS)'], container: 'HDPE or polypropylene (NO glass)', preservative: 'Trizma, ice', hold: '14 days' },
  fe:    { methods: ['EPA 200.7 (ICP-AES)'], container: 'HDPE', preservative: 'HNO₃ to pH < 2', hold: '180 days' },
  mn:    { methods: ['EPA 200.8 (ICP-MS)'], container: 'HDPE', preservative: 'HNO₃ to pH < 2', hold: '180 days' },
}

/** Build the normalized standard record for one parameter, or null. */
export function getStandard(paramInput) {
  const id = resolveParamId(paramInput)
  if (!id) return null
  const p = PARAM_MAP[id]
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    unit: p.unit,
    category: p.cat,
    mcl: p.mcl ?? null,
    mclg: p.mclg ?? null,
    actionLevel: p.al ?? null,
    mrdl: p.mrdl ?? null,
    smcl: p.smcl ?? null,
    whoGuideline: p.who ?? null,
    healthAdvisory: p.healthAdv ?? p.epaAdv ?? null,
    carcinogen: p.crc ?? null,
    health: p.health ?? null,
    pfasHazardIndex: p.pfasHI ? { included: true, denominator: p.hiDenom } : undefined,
  }
}

/** Method / container / preservative / hold for a parameter, or null. */
export function getSamplingMethod(paramInput) {
  const id = resolveParamId(paramInput)
  if (!id || !WATER_METHODS[id]) return null
  const p = PARAM_MAP[id]
  return { id, name: p?.name || id, ...WATER_METHODS[id] }
}

/** Documented health effects + carcinogen class for a parameter, or null. */
export function getHealthEffects(paramInput) {
  const id = resolveParamId(paramInput)
  if (!id) return null
  const p = PARAM_MAP[id]
  if (!p) return null
  return { id, name: p.name, health: p.health ?? null, carcinogen: p.crc ?? null, acute: !!p.acute }
}

/** State-specific limit for a parameter (stricter-than-federal), or null. */
export function getStateLimit(paramInput, stateInput) {
  const id = resolveParamId(paramInput)
  const st = (stateInput || '').trim().toUpperCase()
  if (!st || !STATE_STDS[st]) return null
  const row = STATE_STDS[st]
  if (id && row[id] != null) {
    return { state: st, label: row.label, parameter: PARAM_MAP[id]?.name || id, limit: row[id], unit: PARAM_MAP[id]?.unit || null }
  }
  // No per-parameter override — return the program summary (e.g. PFAS sums).
  const { label, ...limits } = row
  return { state: st, label, parameter: id ? PARAM_MAP[id]?.name || id : null, limit: null, programLimits: limits }
}

/** Discovery fallback — the full set of parameters Marlow can speak to. */
export function listKnownParameters() {
  return ALL_PARAMS.map((p) => ({ id: p.id, name: p.name, unit: p.unit, category: p.cat }))
}
