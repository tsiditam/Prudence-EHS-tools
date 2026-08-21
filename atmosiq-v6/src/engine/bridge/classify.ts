/**
 * AtmosFlow v2.1 Bridge — Condition-Type Classifier
 *
 * Maps a legacy scoring finding ({t, sev, std?}) plus its category and the
 * zone data context to one of the 29 v2.1 ConditionType values.
 *
 * Heuristic order matters: more specific patterns first, fall-through last.
 */

import type { CategoryName, ConditionType } from '../types/domain'

export interface LegacyFinding {
  t: string
  sev: 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'
  std?: string
}

export interface ZoneContext {
  cfm_person?: string | number
  ach?: string | number
  co2?: string | number
  pm?: string | number
  pmo?: string | number
  co?: string | number
  hc?: string | number
  tv?: string | number
  rh?: string | number
  tf?: string | number
  wd?: string
  mi?: string
  sa?: string
  fc?: string
  fm?: string
  hm?: string
  dp?: string
  od?: string
  op?: string
  cc?: string
  sr?: string
  [key: string]: unknown
}

const matches = (haystack: string, needles: ReadonlyArray<string>): boolean => {
  const h = haystack.toLowerCase()
  return needles.some(n => h.includes(n.toLowerCase()))
}

export function classifyCondition(
  finding: LegacyFinding,
  category: CategoryName,
  zone: ZoneContext,
): ConditionType {
  const text = finding.t || ''
  const std = (finding.std || '').toLowerCase()
  switch (category) {
    case 'Ventilation':
      return classifyVentilation(text, std, zone, finding.sev)
    case 'Contaminants':
      return classifyContaminants(text, std, zone)
    case 'HVAC':
      return classifyHVAC(text, std, zone)
    case 'Complaints':
      return classifyComplaints(text, std, zone)
    case 'Environment':
      return classifyEnvironment(text, std, zone, finding.sev)
  }
}

/**
 * Ventilation routing keys on SEVERITY, not on wording.
 *
 * It used to match substrings, and the CO₂ ladder defeated it in a way no
 * one would spot by reading either file alone. `matches` is
 * `haystack.includes(needle)`, so the token 'inadequate' does not match the
 * worst tier's own sentence — "severely elevated, indicating significant
 * ventilation inadequac**y**" — and the medium tier says "approaching
 * concern", which matches no token at all. Both fell through to
 * `ventilation_co2_only`, whose template then reported them as within
 * range. The result was an inversion: 1,180 ppm classified correctly while
 * 2,500 ppm and 900 ppm both rendered "CO₂ results were within the
 * reference range". The FM demo shipped with one zone flagged Elevated in
 * Results and "within the reference range" in Zone Findings.
 *
 * The engine has already decided whether this reading is a problem — that
 * is what `sev` is. Reading its prose to re-derive the same answer was a
 * second opinion, and the wrong one. Severity is now the only input, so no
 * rewording of a finding can change how it is classified.
 */
function classifyVentilation(
  text: string,
  _std: string,
  zone: ZoneContext,
  sev: string | undefined,
): ConditionType {
  const hasCfm = zone.cfm_person !== undefined && zone.cfm_person !== ''
  const hasAch = zone.ach !== undefined && zone.ach !== ''
  const hasCo2 = zone.co2 !== undefined && zone.co2 !== ''

  if (matches(text, ['no airflow data', 'no ventilation', 'observational only'])) {
    return 'ventilation_observational_only'
  }

  // `pass` / `info` are the engine's way of saying "evaluated, nothing to
  // report", so they take the limitation template; anything actionable
  // takes the inadequate-outdoor-air one.
  const isSignificant = sev !== 'pass' && sev !== 'info'

  if (hasCfm || hasAch || hasCo2) {
    return isSignificant ? 'ventilation_inadequate_outdoor_air' : 'ventilation_co2_only'
  }
  return 'ventilation_observational_only'
}

function classifyContaminants(
  text: string,
  std: string,
  zone: ZoneContext,
): ConditionType {
  if (matches(text, ['multiple contaminant exceedance'])) return 'co_above_pel_documented'

  if (matches(text, ['co ']) && (matches(text, ['osha pel', 'exceeds osha']) || std.includes('osha'))) {
    return 'co_above_pel_documented'
  }
  if (matches(text, ['co ']) && (matches(text, ['niosh rel', 'exceeds niosh']) || std.includes('niosh'))) {
    return 'co_screening_elevated'
  }
  if (text.toLowerCase().startsWith('co ') || matches(text, ['carbon monoxide'])) {
    return 'co_screening_elevated'
  }

  if (matches(text, ['formaldehyde']) && matches(text, ['osha pel', 'exceeds osha'])) {
    return 'hcho_above_pel_documented'
  }
  if (matches(text, ['formaldehyde'])) return 'hcho_screening_elevated'

  if (matches(text, ['tvoc', 'tvocs '])) return 'tvoc_screening_elevated'

  if (matches(text, ['pm2.5', 'pm 2.5', 'pm₂.₅'])) {
    if (matches(text, ['indoor/outdoor', 'i/o ratio'])) return 'pm_indoor_amplification_screening'
    if (matches(text, ['epa naaqs', 'naaqs']) || std.includes('naaqs')) return 'pm_above_naaqs_documented'
    return 'pm_screening_elevated'
  }

  if (matches(text, ['mold', 'iicrc s520', 'fungal', 'microbial growth'])) return 'apparent_microbial_growth'

  if (matches(text, ['odor'])) return 'objectionable_odor'

  // Fallback when category is Contaminants but text is generic (e.g., "No contaminant concerns")
  // Use the broadest screening intent that won't lie about the data. tvoc_screening_elevated
  // is a screening-only finding so it's a safe, non-claim default for pass/info messages
  // but cleaner: synthesize as objectionable_odor only if odor; otherwise pm_screening_elevated.
  return 'pm_screening_elevated'
}

function classifyHVAC(text: string, _std: string, zone: ZoneContext): ConditionType {
  if (matches(text, ['drain pan', 'standing water', 'bio growth', 'condensate'])) {
    return 'hvac_drain_pan_microbial_reservoir'
  }
  if (matches(text, ['no filtration', 'no filter installed'])) return 'hvac_filter_loaded'
  if (matches(text, ['filter condition', 'heavily loaded', 'damaged', 'bypass', 'soiled'])) {
    return 'hvac_filter_loaded'
  }
  if (matches(text, ['merv', 'filter efficiency', 'filter rating', 'recommended class'])) {
    return 'hvac_filter_below_recommended_class'
  }
  if (matches(text, ['outdoor air damper', 'oa damper', 'damper', 'closed / minimum', 'stuck'])) {
    return 'hvac_outdoor_air_damper_compromised'
  }
  if (matches(text, ['no supply airflow'])) return 'hvac_outdoor_air_damper_compromised'
  if (matches(text, ['maintenance', 'overdue', 'unknown', 'service'])) return 'hvac_maintenance_overdue'
  return 'hvac_maintenance_overdue'
}

function classifyComplaints(text: string, _std: string, zone: ZoneContext): ConditionType {
  if (matches(text, ['symptoms resolve', 'away from building', 'symptoms improve'])) {
    return 'symptoms_resolve_away_from_building'
  }
  if (matches(text, ['cluster', 'clustering']) || zone.cc === 'Yes — this zone') {
    return 'occupant_cluster_anecdotal'
  }
  return 'occupant_symptoms_anecdotal'
}

function classifyEnvironment(
  text: string,
  _std: string,
  zone: ZoneContext,
  _sev: LegacyFinding['sev'],
): ConditionType {
  if (matches(text, ['water damage', 'water staining', 'water intrusion', 'active leak', 'historical water', 'old staining'])) {
    return 'active_or_historical_water_damage'
  }

  if (matches(text, ['temperature'])) return 'temperature_outside_comfort'
  if (matches(text, ['thermal discomfort', 'too hot', 'too cold'])) return 'temperature_outside_comfort'

  if (matches(text, ['rh ', 'humidity', 'relative humidity', 'humid', 'dry'])) {
    const rhVal = zone.rh !== undefined && zone.rh !== '' ? Number(zone.rh) : NaN
    if (!Number.isNaN(rhVal)) {
      if (rhVal >= 60) {
        // Bias toward microbial-amplification language when RH ≥ 60% sustained
        return rhVal >= 65 ? 'humidity_microbial_amplification_range' : 'humidity_above_comfort_upper_bound'
      }
      if (rhVal < 30) return 'humidity_below_comfort_lower_bound'
    }
    if (matches(text, ['too dry', 'low humidity', 'below'])) return 'humidity_below_comfort_lower_bound'
    if (matches(text, ['microbial', 'mold'])) return 'humidity_microbial_amplification_range'
    return 'humidity_above_comfort_upper_bound'
  }

  // Default — when category is Environment but no specific signal, treat as comfort temp
  return 'temperature_outside_comfort'
}
