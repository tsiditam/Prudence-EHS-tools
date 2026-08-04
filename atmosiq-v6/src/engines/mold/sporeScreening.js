/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — comparative indoor/outdoor spore-trap screening.
 *
 * The ONLY defensible airborne-spore interpretation is comparative (AIHA 2020):
 * indoor genera concentrations against a simultaneous outdoor reference, plus
 * the presence indoors of water-damage-associated genera out of proportion to
 * outdoor. This module produces a CATEGORICAL outcome — never a numeric "risk
 * score", never a health statement. Without a paired outdoor reference the
 * outcome is `insufficient-data`, because a bare indoor count means nothing on
 * its own (there is no health-based spore limit — IOM 2004; ACMT 2025).
 */

import { SPORE_SCREENING } from '../../constants/moldStandards.js'

const norm = (g) => String(g || '').trim().toLowerCase()

const INDICATOR_SET = new Set(SPORE_SCREENING.waterDamageIndicatorGenera.map(norm))

// A genus row counts as a water-damage indicator if it matches (or is a prefix
// of) a known indicator genus — so "Aspergillus/Penicillium" matches the
// "Aspergillus/Penicillium-like" screening bucket.
function isIndicatorGenus(genus) {
  const g = norm(genus)
  if (INDICATOR_SET.has(g)) return true
  for (const ind of INDICATOR_SET) {
    if (g.startsWith(ind) || ind.startsWith(g)) return true
  }
  return false
}

function sumByGenus(samples) {
  const map = new Map()
  for (const s of samples) {
    const g = norm(s?.genus)
    if (!g) continue
    const c = Number.isFinite(s?.countPerM3) ? Number(s.countPerM3) : 0
    map.set(g, (map.get(g) || 0) + c)
  }
  return map
}

/**
 * Screen one zone's indoor samples against its outdoor reference.
 *
 * @param {Array} indoorSamples  [{ genus, countPerM3 }]
 * @param {Array} outdoorSamples [{ genus, countPerM3 }]
 * @returns {{
 *   outcome: string,
 *   indoorExceedsOutdoor: string[],
 *   indicatorGeneraIndoors: string[],
 *   source: string,
 *   noHealthLimitNote: string
 * }}
 */
export function screenSpores(indoorSamples, outdoorSamples) {
  const indoor = Array.isArray(indoorSamples) ? indoorSamples : []
  const outdoor = Array.isArray(outdoorSamples) ? outdoorSamples : []
  const O = SPORE_SCREENING.outcomes

  const base = {
    indoorExceedsOutdoor: [],
    indicatorGeneraIndoors: [],
    source: SPORE_SCREENING.source,
    noHealthLimitNote: SPORE_SCREENING.noHealthLimit,
  }

  // No paired reference → cannot screen comparatively. Honest, not a guess.
  if (!indoor.length || !outdoor.length) {
    return { ...base, outcome: O.insufficientData }
  }

  const indoorByGenus = sumByGenus(indoor)
  const outdoorByGenus = sumByGenus(outdoor)

  const exceeds = []
  const indicatorsIndoors = []
  for (const [genus, indoorCount] of indoorByGenus) {
    const outdoorCount = outdoorByGenus.get(genus) || 0
    if (indoorCount > outdoorCount) exceeds.push(genus)
    if (indoorCount > 0 && isIndicatorGenus(genus)) indicatorsIndoors.push(genus)
  }
  exceeds.sort()
  indicatorsIndoors.sort()

  // A water-damage indicator genus present indoors AND exceeding outdoor is the
  // classic amplification screening signal; either an indicator genus indoors
  // out of proportion, or a broad indoor>outdoor exceedance, raises the flag.
  const indicatorExceeds = indicatorsIndoors.some((g) => exceeds.includes(g))
  const outcome = (indicatorExceeds || (indicatorsIndoors.length > 0 && exceeds.length > 0))
    ? O.possibleAmplificationIndicator
    : O.consistentWithNormalEcology

  return { ...base, outcome, indoorExceedsOutdoor: exceeds, indicatorGeneraIndoors: indicatorsIndoors }
}
