/**
 * AtmosFlow Engine v2.6 §2 — Causal Chain Engine
 *
 * Synthesizes findings into reasoned root-cause statements. Each
 * rule is a deterministic pattern matcher over (zones, findings).
 * A rule fires when its trigger condition matches; matched
 * findings become `relatedFindingIds`; the chain emits with the
 * prescribed `rootCause` text and citation.
 *
 * Design rules (§2):
 *   - Each rule is a pure function of `(zones, findings)`.
 *   - Returns the matched chain or null.
 *   - `deriveCausalChains` runs all rules in declared order,
 *     collects matches, dedupes by chain `id`, returns the array.
 *   - A finding may participate in multiple chains.
 *   - Chain `id` is stable per rule pattern so reports are
 *     reproducible across runs.
 *
 * `causationSupported` controls whether the renderer is permitted
 * to use causal language for this chain. Most chains default to
 * false because the ground truth is always uncertain without lab
 * confirmation.
 */

import type {
  CausalChain, ConditionType, Finding, ZoneId, ZoneScore,
} from './types/domain'
import type { Citation } from './types/citation'

// ── Citations used by the chain rules ─────────────────────────

const CITATION_VENTILATION: Citation = {
  source: 'ASHRAE 62.1-2022 §6.2 Procedural Compliance + ASHRAE/ACCA Standard 180-2018',
  authority: 'consensus',
  edition: '2022/2018',
  organization: 'ASHRAE',
}

const CITATION_MOLD: Citation = {
  source: 'ASHRAE Position Document — Limiting Indoor Mold and Dampness + EPA Mold Remediation in Schools and Commercial Buildings',
  authority: 'consensus',
  edition: 'current',
  organization: 'ASHRAE',
}

const CITATION_FILTRATION: Citation = {
  source: 'ASHRAE 62.1-2022 §6.2.1.4 + ASHRAE Position Document — Filtration and Air Cleaning',
  authority: 'consensus',
  edition: '2022',
  organization: 'ASHRAE',
}

const CITATION_NIOSH_HHE: Citation = {
  source: 'NIOSH Health Hazard Evaluation Program — Building-Related Illness Investigation Methodology',
  authority: 'consensus',
  edition: 'current',
  organization: 'NIOSH',
}

const CITATION_DATA_CENTER: Citation = {
  source: 'ISO 14644-1:2015 Cleanroom Particle Classification + ANSI/ISA 71.04-2013 Environmental Conditions for Process Measurement and Control Systems + ASHRAE TC 9.9 Thermal Guidelines for Data Processing Environments',
  authority: 'consensus',
  edition: '2015/2013',
  organization: 'ISO',
}

const CITATION_THERMAL_BALANCE: Citation = {
  source: 'ASHRAE Standard 55-2020 §5.3 Thermal Environmental Conditions for Human Occupancy + AABC/NEBB Total System Balance Procedural Standards',
  authority: 'consensus',
  edition: '2020',
  organization: 'ASHRAE',
}

// ── Trigger condition sets ────────────────────────────────────

const VENTILATION_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'ventilation_inadequate_outdoor_air',
  'ventilation_co2_only',
])

const HVAC_AIRFLOW_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'hvac_outdoor_air_damper_compromised',
  'hvac_filter_loaded',
  'hvac_maintenance_overdue',
])

const COMPLAINTS_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'occupant_symptoms_anecdotal',
  'occupant_cluster_anecdotal',
  'symptoms_resolve_away_from_building',
])

const HUMIDITY_AMPLIFICATION_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'humidity_microbial_amplification_range',
  'humidity_above_comfort_upper_bound',
])

const FILTER_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'hvac_filter_loaded',
  'hvac_filter_below_recommended_class',
])

const PM_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'pm_screening_elevated',
  'pm_above_naaqs_documented',
  'pm_indoor_amplification_screening',
])

const DATA_CENTER_PARTICULATE_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'pm_screening_elevated',
  'pm_indoor_amplification_screening',
  'particle_screening_only',
  'possible_corrosive_environment',
])

const THERMAL_COMFORT_CONDITIONS: ReadonlySet<ConditionType> = new Set([
  'temperature_outside_comfort',
  'humidity_above_comfort_upper_bound',
  'humidity_below_comfort_lower_bound',
])

// ── Helpers ───────────────────────────────────────────────────

const significant = (findings: ReadonlyArray<Finding>): ReadonlyArray<Finding> =>
  findings.filter(f => f.severityInternal !== 'pass' && f.severityInternal !== 'info')

const matching = (
  findings: ReadonlyArray<Finding>,
  set: ReadonlySet<ConditionType>,
): ReadonlyArray<Finding> => findings.filter(f => set.has(f.conditionType))

const includesAny = (
  findings: ReadonlyArray<Finding>,
  ...types: ConditionType[]
): boolean => findings.some(f => types.includes(f.conditionType))

const collectZoneIds = (findings: ReadonlyArray<Finding>): ReadonlyArray<ZoneId> => {
  const out = new Set<ZoneId>()
  for (const f of findings) if (f.zoneId) out.add(f.zoneId)
  return [...out]
}

const ids = (findings: ReadonlyArray<Finding>): ReadonlyArray<Finding['id']> =>
  findings.map(f => f.id)

const isDataCenterZone = (zone: ZoneScore): boolean => {
  // Detect data-center zones by name heuristic. Legacy zone-data
  // carries `zone_subtype: 'data_hall'`; the v2.1+ ZoneScore only
  // exposes the zoneName, so we match on common naming patterns.
  const n = (zone.zoneName || '').toLowerCase()
  return n.includes('data hall')
    || n.includes('data center')
    || n.includes('data centre')
    || n.includes('server room')
    || n.includes('noc')
    || n.includes('battery room')
    || n.includes('mer ')
}

// ── Chain rules ───────────────────────────────────────────────

/**
 * Rule 1 — Inadequate outdoor air with HVAC load on contaminant
 * removal. Triggers when ventilation, HVAC, and complaints
 * findings co-occur.
 */
function ruleInadequateOutdoorAir(
  _zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const ventilation = matching(findings, VENTILATION_CONDITIONS)
  const hvac = matching(findings, HVAC_AIRFLOW_CONDITIONS)
  const complaints = matching(findings, COMPLAINTS_CONDITIONS)
  if (ventilation.length === 0 || hvac.length === 0 || complaints.length === 0) return null
  const related = [...ventilation, ...hvac, ...complaints]
  const causationSupported = related.some(f => f.definitiveConclusionAllowed)
  return {
    id: 'chain_inadequate_outdoor_air',
    name: 'Inadequate outdoor-air ventilation',
    relatedFindingIds: ids(related),
    rootCause:
      'The HVAC system is not delivering sufficient outdoor air. CO₂ elevation, occupant complaints, and HVAC filter or damper deficiencies share a common root cause: outdoor-air ventilation is the controlling variable. Filter and damper interventions in isolation are unlikely to resolve the complaints unless the outdoor-air delivery rate is also restored.',
    causationSupported,
    contributingZones: collectZoneIds(related),
    citation: CITATION_VENTILATION,
  }
}

/**
 * Rule 2 — Moisture intrusion driving microbial amplification.
 * Triggers when visible mold OR water damage is present alongside
 * elevated humidity, OR when an HVAC drain pan microbial
 * reservoir exists.
 */
function ruleMoistureMicrobial(
  _zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const hasMicrobialOrWater = includesAny(
    findings, 'apparent_microbial_growth', 'active_or_historical_water_damage',
  )
  const hasHumidityAmp = matching(findings, HUMIDITY_AMPLIFICATION_CONDITIONS).length > 0
  const hasDrainPan = includesAny(findings, 'hvac_drain_pan_microbial_reservoir')
  const triggered = (hasMicrobialOrWater && hasHumidityAmp) || hasDrainPan
  if (!triggered) return null

  const related = findings.filter(f =>
    f.conditionType === 'apparent_microbial_growth'
    || f.conditionType === 'active_or_historical_water_damage'
    || HUMIDITY_AMPLIFICATION_CONDITIONS.has(f.conditionType)
    || f.conditionType === 'hvac_drain_pan_microbial_reservoir',
  )
  // Causation requires lab speciation evidence — never assumed.
  const causationSupported = related.some(
    f => f.evidenceBasis?.kind === 'laboratory_speciation' && f.definitiveConclusionAllowed,
  )
  return {
    id: 'chain_moisture_microbial',
    name: 'Moisture-driven microbial amplification',
    relatedFindingIds: ids(related),
    rootCause:
      'Visible or apparent microbial growth combined with elevated indoor humidity, water damage, or microbial reservoir conditions in the HVAC system describes a moisture-driven bioaerosol problem. Ventilation alone will not resolve it; the moisture source must be eliminated and material remediation must follow before air-quality intervention is meaningful.',
    causationSupported,
    contributingZones: collectZoneIds(related),
    citation: CITATION_MOLD,
  }
}

/**
 * Rule 3 — Filter failure cascading to particulate amplification.
 * Triggers when filter loading or under-spec class co-occurs with
 * any indoor PM elevation finding.
 */
function ruleFilterParticulate(
  _zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const filterFindings = matching(findings, FILTER_CONDITIONS)
  const pmFindings = matching(findings, PM_CONDITIONS)
  if (filterFindings.length === 0 || pmFindings.length === 0) return null
  const related = [...filterFindings, ...pmFindings]
  const causationSupported = pmFindings.some(
    f => f.conditionType === 'pm_above_naaqs_documented' && f.definitiveConclusionAllowed,
  )
  return {
    id: 'chain_filter_particulate',
    name: 'Filter failure cascading to particulate amplification',
    relatedFindingIds: ids(related),
    rootCause:
      'A loaded or saturated HVAC filter, or a filter rating below the recommended class for this occupancy, combined with indoor PM elevation above outdoor baseline, indicates filter bypass or inadequate filtration class. Filter replacement and MERV upgrade should be evaluated together; a single fix is unlikely to resolve indoor amplification.',
    causationSupported,
    contributingZones: collectZoneIds(related),
    citation: CITATION_FILTRATION,
  }
}

/**
 * Rule 4 — Sick-building pattern (symptom resolution + serious
 * findings). Triggers when symptoms-resolve-away is present
 * alongside at least one high or critical severity finding.
 */
function ruleSickBuilding(
  _zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const resolvesAway = findings.filter(f => f.conditionType === 'symptoms_resolve_away_from_building')
  if (resolvesAway.length === 0) return null
  const seriousOthers = findings.filter(
    f => f.conditionType !== 'symptoms_resolve_away_from_building'
      && (f.severityInternal === 'high' || f.severityInternal === 'critical'),
  )
  if (seriousOthers.length === 0) return null
  const related = [...resolvesAway, ...seriousOthers]
  // Even with all definitive findings, the resolution-away pattern is
  // suggestive, not confirmatory. Never claim causation outright.
  const causationSupported = false
  return {
    id: 'chain_sick_building',
    name: 'Building-related illness pattern',
    relatedFindingIds: ids(related),
    rootCause:
      'Reported symptoms abate when occupants leave the building. Combined with measurable IAQ deficits, this is the textbook presentation of building-related illness per NIOSH Health Hazard Evaluation methodology and warrants a comprehensive remediation plan rather than isolated fixes. A structured symptom survey with spatial mapping and a coordinated environmental investigation are recommended before remediation scope is finalized.',
    causationSupported,
    contributingZones: collectZoneIds(related),
    citation: CITATION_NIOSH_HHE,
  }
}

/**
 * Rule 5 — Data-center cleanliness / corrosion concern (specialty).
 * Triggers when at least one zone is data-center coded AND a PM or
 * corrosive environment finding is present.
 */
function ruleDataCenterCorrosion(
  zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const hasDataCenterZone = zones.some(isDataCenterZone)
  if (!hasDataCenterZone) return null
  const dcFindings = matching(findings, DATA_CENTER_PARTICULATE_CONDITIONS)
  if (dcFindings.length === 0) return null
  return {
    id: 'chain_data_center_corrosion',
    name: 'Data-center cleanliness and atmospheric corrosion concern',
    relatedFindingIds: ids(dcFindings),
    rootCause:
      'In data-center environments, indoor particulate elevation and gaseous corrosion indicators warrant a coordinated cleanliness and atmospheric-corrosion evaluation. ISO 14644-1 particle classification and ANSI/ISA 71.04-2013 reactivity coupon analysis are the appropriate confirmatory paths; thermal and humidity excursions interpreted via ASHRAE TC 9.9 should be assessed in parallel.',
    causationSupported: false,
    contributingZones: collectZoneIds(dcFindings),
    citation: CITATION_DATA_CENTER,
  }
}

/**
 * Rule 6 — Thermal comfort cluster. Triggers when at least two
 * thermal/humidity comfort excursions co-occur with at least one
 * occupant complaint.
 */
function ruleThermalComfortCluster(
  _zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): CausalChain | null {
  const thermal = matching(findings, THERMAL_COMFORT_CONDITIONS)
  const complaints = matching(findings, COMPLAINTS_CONDITIONS)
  if (thermal.length < 2 || complaints.length === 0) return null
  const related = [...thermal, ...complaints]
  return {
    id: 'chain_thermal_comfort',
    name: 'Thermal comfort cluster suggesting HVAC zoning or controls issue',
    relatedFindingIds: ids(related),
    rootCause:
      'Multiple thermal and humidity comfort excursions co-occurring with occupant complaints suggest an HVAC zoning, balancing, or controls-sequence issue rather than isolated comfort drift. Zone-level thermostat setpoint review, sensor calibration, and rebalancing per AABC/NEBB methodology are recommended before any equipment retrofit is scoped.',
    causationSupported: false,
    contributingZones: collectZoneIds(related),
    citation: CITATION_THERMAL_BALANCE,
  }
}

// ── Public entry point ────────────────────────────────────────

const RULES: ReadonlyArray<
  (zones: ReadonlyArray<ZoneScore>, findings: ReadonlyArray<Finding>) => CausalChain | null
> = [
  ruleInadequateOutdoorAir,
  ruleMoistureMicrobial,
  ruleFilterParticulate,
  ruleSickBuilding,
  ruleDataCenterCorrosion,
  ruleThermalComfortCluster,
]

/**
 * v2.6 §2 — Run every chain rule against the finding set and
 * return the union of matches. Filters out pass/info findings
 * defensively before evaluation. Dedupes by chain id (a chain
 * rule should never emit twice for the same input, but the dedup
 * is a safety net).
 */
export function deriveCausalChains(
  zones: ReadonlyArray<ZoneScore>,
  findings: ReadonlyArray<Finding>,
): ReadonlyArray<CausalChain> {
  const sig = significant(findings)
  const out: CausalChain[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    const result = rule(zones, sig)
    if (result && !seen.has(result.id)) {
      seen.add(result.id)
      out.push(result)
    }
  }
  return out
}

// Internals re-exported for tests so individual rules can be
// exercised in isolation without re-importing the whole orchestrator.
export const __testing = {
  ruleInadequateOutdoorAir,
  ruleMoistureMicrobial,
  ruleFilterParticulate,
  ruleSickBuilding,
  ruleDataCenterCorrosion,
  ruleThermalComfortCluster,
  isDataCenterZone,
}
