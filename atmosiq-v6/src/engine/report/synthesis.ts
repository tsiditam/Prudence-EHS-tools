/**
 * AtmosFlow v2.4 §4 — Per-zone synthesis templates
 *
 * Replaces the confidence-tier boilerplate "Findings are preliminary
 * and based on screening-level data..." that was rendered as a zone's
 * Interpretation paragraph in v2.3. Templates examine the
 * conditionType pattern within a zone and emit narrative that ties
 * the observations together into a defensible synthesis.
 *
 * Templates evaluated in priority order:
 *   1. sick-building              — symptom cluster + symptoms-resolve-away
 *                                   + at least one ventilation/contaminant signal
 *   2. moisture-driven            — water damage / drain pan / humidity
 *                                   amplification range / microbial growth
 *   3. symptom-cluster-no-resolution — cluster present, resolves-away absent
 *   4. ventilation-deficit        — CO₂ surrogate or inadequate-OA findings
 *                                   without contaminant findings
 *   5. particulate-amplification  — PM screening elevated + indoor > outdoor
 *   6. thermal-humidity-comfort   — temperature_outside_comfort or humidity
 *                                   above/below comfort, no contaminants
 *   7. no-findings                — empty zone (single sentence)
 *   8. default-fallback           — confidence-tier boilerplate
 */

import type { ZoneScore } from '../types/domain'
import { CONFIDENCE_TIER_LANGUAGE } from './professional-opinion'

export type SynthesisTemplateName =
  | 'sick-building'
  | 'moisture-driven'
  | 'symptom-cluster-no-resolution'
  | 'ventilation-deficit'
  | 'particulate-amplification'
  | 'thermal-humidity-comfort'
  | 'no-findings'
  | 'default-fallback'

export interface ZoneSynthesis {
  readonly template: SynthesisTemplateName
  readonly narrative: string
}

const VENTILATION_TYPES = new Set([
  'ventilation_co2_only',
  'ventilation_inadequate_outdoor_air',
  'ventilation_observational_only',
])

const CONTAMINANT_TYPES = new Set([
  'co_above_pel_documented',
  'co_screening_elevated',
  'hcho_above_pel_documented',
  'hcho_screening_elevated',
  'tvoc_screening_elevated',
  'pm_above_naaqs_documented',
  'pm_screening_elevated',
  'pm_indoor_amplification_screening',
  'particle_screening_only',
])

const MOISTURE_TYPES = new Set([
  'active_or_historical_water_damage',
  'humidity_microbial_amplification_range',
  'apparent_microbial_growth',
  'hvac_drain_pan_microbial_reservoir',
])

const PARTICULATE_TYPES = new Set([
  'pm_screening_elevated',
  'pm_above_naaqs_documented',
  'pm_indoor_amplification_screening',
  'particle_screening_only',
])

const THERMAL_TYPES = new Set([
  'temperature_outside_comfort',
  'temperature_low_data_center',
  'humidity_above_comfort_upper_bound',
  'humidity_below_comfort_lower_bound',
])

/**
 * Synthesize a zone-level interpretation paragraph by examining the
 * pattern of significant findings within the zone.
 */
export function synthesizeZone(zone: ZoneScore): ZoneSynthesis {
  const findings = zone.categories.flatMap(c => c.findings)
  const significant = findings.filter(
    f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
  )
  const conditionTypes = new Set(significant.map(f => f.conditionType))

  if (significant.length === 0) {
    return {
      template: 'no-findings',
      narrative:
        'No conditions warranting elevated concern were identified in this zone within the stated limitations.',
    }
  }

  const hasCluster = conditionTypes.has('occupant_cluster_anecdotal')
  const hasResolveAway = conditionTypes.has('symptoms_resolve_away_from_building')
  const hasVentilation = anyOf(conditionTypes, VENTILATION_TYPES)
  const hasContaminant = anyOf(conditionTypes, CONTAMINANT_TYPES)
  const hasMoisture = anyOf(conditionTypes, MOISTURE_TYPES)
  const hasParticulate = anyOf(conditionTypes, PARTICULATE_TYPES)
  const hasIndoorAmplification = conditionTypes.has('pm_indoor_amplification_screening')
  const hasThermal = anyOf(conditionTypes, THERMAL_TYPES)

  // 1. sick-building pattern
  if (hasCluster && hasResolveAway && (hasVentilation || hasContaminant || hasMoisture)) {
    return {
      template: 'sick-building',
      narrative:
        'The combination of an occupant symptom cluster, the report that symptoms improve when away from the building, and the indoor environmental observations documented above is consistent with a building-related contributor to occupant complaints. This synthesis does not establish causation; confirmatory investigation, including structured symptom mapping and targeted contaminant or airflow follow-up, is recommended before drawing definitive conclusions.',
    }
  }

  // 2. moisture-driven
  if (hasMoisture) {
    return {
      template: 'moisture-driven',
      narrative:
        'Indicators of elevated moisture or amplification-range humidity were observed in this zone. Sustained indoor moisture is a recognized driver of microbial amplification and material degradation; the conditions documented above warrant moisture source identification and remediation per ANSI/IICRC S520 guidance before further assessment of biological or particulate exposure pathways.',
    }
  }

  // 3. symptom cluster without resolution pattern
  if (hasCluster && !hasResolveAway) {
    return {
      template: 'symptom-cluster-no-resolution',
      narrative:
        'A spatial cluster of occupant symptoms was reported in this zone, but a clear pattern of symptom resolution away from the building was not established. Spatial clustering alone does not establish a building-related etiology; structured symptom mapping and parallel environmental investigation are recommended to test the hypothesis.',
    }
  }

  // 4. ventilation deficit (no contaminant signal)
  if (hasVentilation && !hasContaminant) {
    return {
      template: 'ventilation-deficit',
      narrative:
        'Findings in this zone are consistent with insufficient outdoor air delivery for the observed occupancy. Ventilation-surrogate indicators (CO₂) or observational indicators were the primary basis for this conclusion; direct outdoor airflow measurement at terminals is recommended to confirm the deficit and inform corrective design.',
    }
  }

  // 5. particulate amplification
  if (hasParticulate && hasIndoorAmplification) {
    return {
      template: 'particulate-amplification',
      narrative:
        'PM2.5 levels in this zone were elevated relative to outdoor reference, indicating an indoor source or accumulation pattern. Filtration adequacy, source identification, and housekeeping practices should be evaluated; reference-method gravimetric sampling is recommended if regulatory comparison is required.',
    }
  }

  // 6. thermal/humidity comfort
  if (hasThermal && !hasContaminant && !hasMoisture && !hasVentilation) {
    return {
      template: 'thermal-humidity-comfort',
      narrative:
        'Findings in this zone center on thermal comfort and relative humidity rather than contaminant exposure. ASHRAE 55 comfort criteria and zone-level temperature/humidity setpoints should be reviewed; isolated comfort excursions are not in themselves health concerns but may drive occupant dissatisfaction and complaint patterns.',
    }
  }

  // 8. default fallback — confidence-tier boilerplate
  return {
    template: 'default-fallback',
    narrative: CONFIDENCE_TIER_LANGUAGE[zone.confidence],
  }
}
// (template index 7 'no-findings' is handled by the early-return above.)

function anyOf<T>(have: Set<T>, candidates: ReadonlySet<T>): boolean {
  for (const c of candidates) if (have.has(c)) return true
  return false
}
