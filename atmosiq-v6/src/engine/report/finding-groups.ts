/**
 * AtmosFlow v2.2 — Finding domain grouping for the Executive Summary
 *
 * Groups significant findings by reader-friendly domain (Air Quality
 * Indicators, Corrosion Indicators, HVAC System, Environmental
 * Conditions, Occupant Feedback) with a bold lead term per finding.
 * Mirrors how industrial hygienists structure findings in narrative
 * reports.
 *
 * Empty groups are not included in the output — a typical office
 * assessment will not produce "Corrosion Indicators", which only
 * fires for data center jobs.
 */

import type { ConditionType, Finding } from '../types/domain'

export type FindingGroupName =
  | 'Air Quality Indicators'
  | 'Corrosion Indicators'
  | 'HVAC System'
  | 'Environmental Conditions'
  | 'Occupant Feedback'

export interface FindingObservation {
  /** Bolded scan-friendly label, e.g. "PM2.5 (screening-level)". */
  readonly leadTerm: string
  /** Short consequence statement, derived from approved narrative intent. */
  readonly statement: string
  /** Source ConditionType — useful for downstream cross-referencing. */
  readonly conditionType: ConditionType
}

export interface FindingGroup {
  readonly groupName: FindingGroupName
  readonly observations: ReadonlyArray<FindingObservation>
}

const GROUP_BY_CONDITION: Record<ConditionType, FindingGroupName> = {
  // Ventilation surrogate / air-delivery
  ventilation_co2_only: 'Air Quality Indicators',
  ventilation_inadequate_outdoor_air: 'Air Quality Indicators',
  ventilation_observational_only: 'Air Quality Indicators',
  // Direct-measured contaminants
  co_above_pel_documented: 'Air Quality Indicators',
  co_screening_elevated: 'Air Quality Indicators',
  hcho_above_pel_documented: 'Air Quality Indicators',
  hcho_screening_elevated: 'Air Quality Indicators',
  tvoc_screening_elevated: 'Air Quality Indicators',
  pm_above_naaqs_documented: 'Air Quality Indicators',
  pm_screening_elevated: 'Air Quality Indicators',
  pm_indoor_amplification_screening: 'Air Quality Indicators',
  particle_screening_only: 'Air Quality Indicators',
  apparent_microbial_growth: 'Air Quality Indicators',
  objectionable_odor: 'Air Quality Indicators',
  // Corrosion (data center pattern)
  possible_corrosive_environment: 'Corrosion Indicators',
  // HVAC system condition
  hvac_maintenance_overdue: 'HVAC System',
  hvac_filter_loaded: 'HVAC System',
  hvac_filter_below_recommended_class: 'HVAC System',
  hvac_outdoor_air_damper_compromised: 'HVAC System',
  hvac_drain_pan_microbial_reservoir: 'HVAC System',
  // Occupant
  occupant_symptoms_anecdotal: 'Occupant Feedback',
  occupant_cluster_anecdotal: 'Occupant Feedback',
  symptoms_resolve_away_from_building: 'Occupant Feedback',
  // Thermal / moisture
  temperature_outside_comfort: 'Environmental Conditions',
  temperature_low_data_center: 'Environmental Conditions',
  humidity_microbial_amplification_range: 'Environmental Conditions',
  humidity_above_comfort_upper_bound: 'Environmental Conditions',
  humidity_below_comfort_lower_bound: 'Environmental Conditions',
  active_or_historical_water_damage: 'Environmental Conditions',
}

/**
 * Reader-friendly bold lead term for each ConditionType. Format:
 * "{Parameter} ({qualifier})" where qualifier reflects the
 * evidence basis or screening level.
 */
const LEAD_TERM_BY_CONDITION: Record<ConditionType, string> = {
  ventilation_co2_only: 'CO₂ (ventilation surrogate)',
  ventilation_inadequate_outdoor_air: 'Outdoor air delivery',
  ventilation_observational_only: 'Ventilation indicators',
  co_above_pel_documented: 'Carbon monoxide (above OSHA PEL)',
  co_screening_elevated: 'Carbon monoxide (screening-level)',
  hcho_above_pel_documented: 'Formaldehyde (above OSHA PEL)',
  hcho_screening_elevated: 'Formaldehyde (screening-level)',
  tvoc_screening_elevated: 'Total VOCs (screening-level)',
  pm_above_naaqs_documented: 'PM2.5 (above EPA NAAQS)',
  pm_screening_elevated: 'PM2.5 (screening-level)',
  pm_indoor_amplification_screening: 'PM2.5 indoor amplification',
  particle_screening_only: 'Particle conditions',
  apparent_microbial_growth: 'Apparent microbial growth',
  objectionable_odor: 'Objectionable odor',
  possible_corrosive_environment: 'Corrosive environment indicators',
  hvac_maintenance_overdue: 'HVAC maintenance',
  hvac_filter_loaded: 'Air filters',
  hvac_filter_below_recommended_class: 'Filter efficiency',
  hvac_outdoor_air_damper_compromised: 'Outdoor air damper',
  hvac_drain_pan_microbial_reservoir: 'HVAC drain pan',
  occupant_symptoms_anecdotal: 'Occupant symptoms',
  occupant_cluster_anecdotal: 'Symptom cluster pattern',
  symptoms_resolve_away_from_building: 'Symptom resolution pattern',
  temperature_outside_comfort: 'Temperature',
  temperature_low_data_center: 'Temperature (data center)',
  humidity_microbial_amplification_range: 'Relative humidity',
  humidity_above_comfort_upper_bound: 'Relative humidity',
  humidity_below_comfort_lower_bound: 'Relative humidity',
  active_or_historical_water_damage: 'Water damage',
}

/**
 * Canonical group order — used to sort groups for rendering. Air
 * Quality + HVAC at top because they drive most CIH conclusions;
 * Environmental/Occupant follow; Corrosion last (data-center-specific).
 */
const GROUP_ORDER: ReadonlyArray<FindingGroupName> = [
  'Air Quality Indicators',
  'HVAC System',
  'Environmental Conditions',
  'Occupant Feedback',
  'Corrosion Indicators',
]

export function getFindingGroup(conditionType: ConditionType): FindingGroupName {
  return GROUP_BY_CONDITION[conditionType] ?? 'Air Quality Indicators'
}

export function getLeadTerm(conditionType: ConditionType): string {
  return LEAD_TERM_BY_CONDITION[conditionType] ?? conditionType.replace(/_/g, ' ')
}

/**
 * Pull the first sentence of an approved narrative intent for use as
 * the observation statement. Mirrors the helper used elsewhere in
 * the renderer.
 */
function firstSentence(text: string): string {
  if (!text) return ''
  const m = /^[^.!?]*[.!?](?=\s|$)/.exec(text)
  if (m) return m[0].trim()
  return text.length <= 120 ? text : text.slice(0, 117).trimEnd() + '…'
}

/**
 * Group significant findings by domain. Empty groups are omitted —
 * a typical office assessment without corrosion findings simply
 * won't produce a "Corrosion Indicators" group.
 *
 * Within each group, findings are deduplicated by ConditionType so
 * the same observation doesn't repeat (e.g. PM2.5 elevated in
 * three zones renders once).
 */
export function groupFindingsByDomain(
  findings: ReadonlyArray<Finding>,
): ReadonlyArray<FindingGroup> {
  // Pass/info findings have no significance and no recommended
  // actions — they're filtered out at the bridge level. Filter again
  // here defensively.
  const significant = findings.filter(
    f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
  )

  const buckets = new Map<FindingGroupName, FindingObservation[]>()
  const seenInGroup = new Map<FindingGroupName, Set<ConditionType>>()

  for (const f of significant) {
    const groupName = getFindingGroup(f.conditionType)
    if (!buckets.has(groupName)) {
      buckets.set(groupName, [])
      seenInGroup.set(groupName, new Set())
    }
    const seen = seenInGroup.get(groupName)!
    if (seen.has(f.conditionType)) continue
    seen.add(f.conditionType)
    buckets.get(groupName)!.push({
      leadTerm: getLeadTerm(f.conditionType),
      statement: firstSentence(f.approvedNarrativeIntent),
      conditionType: f.conditionType,
    })
  }

  // Sort by canonical group order. Skip groups with no observations.
  const result: FindingGroup[] = []
  for (const groupName of GROUP_ORDER) {
    const obs = buckets.get(groupName)
    if (obs && obs.length > 0) {
      result.push({ groupName, observations: obs })
    }
  }
  return result
}
