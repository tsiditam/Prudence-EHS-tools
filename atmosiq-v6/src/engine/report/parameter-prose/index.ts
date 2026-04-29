/**
 * AtmosFlow Engine v2.2 §8 — Parameter Prose Module
 *
 * Merges the per-parameter ParameterProse entries into a single
 * PARAMETER_PROSE map keyed by ParameterKey. Each entry carries the
 * standards-background prose, the measurement-summary template, and
 * the array of applicable Citations.
 */

import type { ParameterKey } from '../parameter-ranges'
import type { ParameterProse } from './types'
import { PARTICULATES_PROSE } from './particulates'
import { TEMPERATURE_PROSE, RH_PROSE } from './thermal'
import { CO2_PROSE } from './gases-co2'
import { CO_PROSE } from './gases-co'
import { HCHO_PROSE } from './gases-hcho'
import { TVOC_PROSE } from './gases-tvoc'

export const PARAMETER_PROSE: Record<ParameterKey, ParameterProse> = {
  pm25: PARTICULATES_PROSE,
  pm10: PARTICULATES_PROSE,
  temperature: TEMPERATURE_PROSE,
  rh: RH_PROSE,
  co2: CO2_PROSE,
  co: CO_PROSE,
  hcho: HCHO_PROSE,
  tvoc: TVOC_PROSE,
}

export function lookupParameterProse(key: ParameterKey): ParameterProse {
  const entry = PARAMETER_PROSE[key]
  if (!entry) throw new Error(`No parameter prose defined for '${key}'.`)
  return entry
}

export type { ParameterProse } from './types'
export type { ParameterKey, ParameterRange, ParameterRangeSet } from '../parameter-ranges'
