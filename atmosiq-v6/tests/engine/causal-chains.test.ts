/**
 * v2.6 §2 acceptance — causal chain engine.
 *
 * Six rules; each rule has its own dedicated trigger fixture.
 * Additionally tests the orchestrator (deriveCausalChains) for
 * dedup, empty-input, and isolated-finding behavior.
 */

import { describe, it, expect } from 'vitest'
import { deriveCausalChains } from '../../src/engine/causal-chains'
import type {
  Finding, FindingId, ZoneId, ZoneScore, ConditionType, Severity,
  CIHConfidenceTier,
} from '../../src/engine/types/domain'

// ── Test factories ────────────────────────────────────────────

let _seq = 0
function fid(): FindingId { return (`F-${String(++_seq).padStart(4, '0')}` as FindingId) }

function f(
  conditionType: ConditionType,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    id: fid(),
    category: 'Environment',
    zoneId: ('Z-001' as ZoneId),
    scope: 'zone',
    severityInternal: 'medium' as Severity,
    titleInternal: '',
    observationInternal: '',
    deductionInternal: 5,
    conditionType,
    confidenceTier: 'qualitative_only' as CIHConfidenceTier,
    definitiveConclusionAllowed: false,
    causationSupported: false,
    regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: '',
    evidenceBasis: { kind: 'visual_olfactory_screening', rationale: '', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: false, withinNoiseFloor: false },
    limitations: [],
    recommendedActions: [],
    thresholdSource: 'observational',
    ...overrides,
  } as Finding
}

function zone(name: string, zoneId = 'Z-001'): ZoneScore {
  return {
    zoneId: (zoneId as ZoneId),
    zoneName: name,
    composite: 50,
    tier: 'Moderate',
    confidence: 'qualitative_only',
    professionalOpinion: 'conditions_warrant_monitoring',
    categories: [],
  } as ZoneScore
}

// ── Rule 1 — Inadequate outdoor air ──────────────────────────

describe('v2.6 §2 — causal chain Rule 1 (inadequate outdoor air)', () => {
  it('fires when ventilation + HVAC + complaints findings co-occur', () => {
    const findings = [
      f('ventilation_inadequate_outdoor_air'),
      f('hvac_filter_loaded'),
      f('occupant_symptoms_anecdotal'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_inadequate_outdoor_air')
    expect(chain).toBeDefined()
    expect(chain!.relatedFindingIds.length).toBe(3)
    expect(chain!.rootCause).toMatch(/outdoor.air ventilation/i)
  })

  it('does not fire when only ventilation + HVAC are present (no complaints)', () => {
    const findings = [
      f('ventilation_co2_only'),
      f('hvac_filter_loaded'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_inadequate_outdoor_air')).toBeUndefined()
  })

  it('causationSupported true only when at least one related finding allows definitive', () => {
    const findings = [
      f('ventilation_inadequate_outdoor_air', { definitiveConclusionAllowed: true }),
      f('hvac_filter_loaded'),
      f('occupant_symptoms_anecdotal'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_inadequate_outdoor_air')
    expect(chain!.causationSupported).toBe(true)
  })

  it('causationSupported false when all related findings are screening-only', () => {
    const findings = [
      f('ventilation_co2_only'),
      f('hvac_maintenance_overdue'),
      f('occupant_cluster_anecdotal'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_inadequate_outdoor_air')
    expect(chain!.causationSupported).toBe(false)
  })
})

// ── Rule 2 — Moisture-driven microbial amplification ─────────

describe('v2.6 §2 — causal chain Rule 2 (moisture/microbial)', () => {
  it('fires on visible mold + amplification-range humidity', () => {
    const findings = [
      f('apparent_microbial_growth'),
      f('humidity_microbial_amplification_range'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_moisture_microbial')
    expect(chain).toBeDefined()
    expect(chain!.rootCause).toMatch(/moisture-driven bioaerosol/i)
  })

  it('fires on water damage + amplification-range humidity', () => {
    const findings = [
      f('active_or_historical_water_damage'),
      f('humidity_above_comfort_upper_bound'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_moisture_microbial')).toBeDefined()
  })

  it('fires on HVAC drain pan microbial reservoir alone (no humidity required)', () => {
    const findings = [f('hvac_drain_pan_microbial_reservoir')]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_moisture_microbial')).toBeDefined()
  })

  it('does not fire on isolated humidity finding alone', () => {
    const findings = [f('humidity_above_comfort_upper_bound')]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_moisture_microbial')).toBeUndefined()
  })

  it('causationSupported false unless lab speciation evidence exists', () => {
    const findings = [
      f('apparent_microbial_growth', { definitiveConclusionAllowed: true }),
      f('humidity_microbial_amplification_range'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_moisture_microbial')
    // definitiveConclusionAllowed=true alone is NOT enough; requires
    // evidenceBasis.kind === 'laboratory_speciation' too.
    expect(chain!.causationSupported).toBe(false)
  })
})

// ── Rule 3 — Filter failure / particulate amplification ──────

describe('v2.6 §2 — causal chain Rule 3 (filter/particulate)', () => {
  it('fires on filter loaded + PM screening elevated', () => {
    const findings = [
      f('hvac_filter_loaded'),
      f('pm_screening_elevated'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_filter_particulate')
    expect(chain).toBeDefined()
    expect(chain!.rootCause).toMatch(/filter bypass|MERV/i)
  })

  it('fires on filter below recommended class + PM indoor amplification', () => {
    const findings = [
      f('hvac_filter_below_recommended_class'),
      f('pm_indoor_amplification_screening'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_filter_particulate')).toBeDefined()
  })

  it('causationSupported only when PM exceedance is documented + definitive', () => {
    const findings = [
      f('hvac_filter_loaded'),
      f('pm_above_naaqs_documented', { definitiveConclusionAllowed: true }),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_filter_particulate')
    expect(chain!.causationSupported).toBe(true)
  })

  it('does not fire on PM finding alone (no filter issue)', () => {
    const findings = [f('pm_screening_elevated')]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_filter_particulate')).toBeUndefined()
  })
})

// ── Rule 4 — Sick-building pattern ────────────────────────────

describe('v2.6 §2 — causal chain Rule 4 (sick-building pattern)', () => {
  it('fires on symptoms-resolve-away + at least one high-severity finding', () => {
    const findings = [
      f('symptoms_resolve_away_from_building'),
      f('co_screening_elevated', { severityInternal: 'high' }),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_sick_building')
    expect(chain).toBeDefined()
    expect(chain!.rootCause).toMatch(/building-related illness|NIOSH/i)
  })

  it('does not fire on symptoms-resolve-away alone (no high-severity finding)', () => {
    const findings = [f('symptoms_resolve_away_from_building')]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_sick_building')).toBeUndefined()
  })

  it('causationSupported is always false even when contributing findings are definitive', () => {
    const findings = [
      f('symptoms_resolve_away_from_building'),
      f('co_above_pel_documented', { severityInternal: 'critical', definitiveConclusionAllowed: true }),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_sick_building')
    expect(chain!.causationSupported).toBe(false)
  })
})

// ── Rule 5 — Data-center cleanliness/corrosion ───────────────

describe('v2.6 §2 — causal chain Rule 5 (data-center corrosion)', () => {
  it('fires on data-center zone + PM screening elevated', () => {
    const findings = [f('pm_screening_elevated')]
    const zones = [zone('Data Hall A')]
    const chains = deriveCausalChains(zones, findings)
    const chain = chains.find(c => c.id === 'chain_data_center_corrosion')
    expect(chain).toBeDefined()
    expect(chain!.citation.source).toMatch(/ISO 14644/)
  })

  it('fires on data-center zone + corrosive environment finding', () => {
    const findings = [f('possible_corrosive_environment')]
    const zones = [zone('Server Room')]
    const chains = deriveCausalChains(zones, findings)
    expect(chains.find(c => c.id === 'chain_data_center_corrosion')).toBeDefined()
  })

  it('does not fire when no zone is data-center coded', () => {
    const findings = [f('pm_screening_elevated'), f('possible_corrosive_environment')]
    const chains = deriveCausalChains([zone('Office Lobby')], findings)
    expect(chains.find(c => c.id === 'chain_data_center_corrosion')).toBeUndefined()
  })

  it('causationSupported is always false (confirmatory-path chain)', () => {
    // Per §2 Rule 5 the data-center chain triggers on
    // pm_screening_elevated / pm_indoor_amplification_screening /
    // particle_screening_only / possible_corrosive_environment.
    // Even with pm_indoor_amplification at definitive confidence,
    // the chain refuses to claim causation — the corrosion path
    // requires lab coupon analysis to establish G-class.
    const findings = [
      f('pm_indoor_amplification_screening', { definitiveConclusionAllowed: true }),
    ]
    const chains = deriveCausalChains([zone('Data Hall B')], findings)
    const chain = chains.find(c => c.id === 'chain_data_center_corrosion')
    expect(chain).toBeDefined()
    expect(chain!.causationSupported).toBe(false)
  })
})

// ── Rule 6 — Thermal comfort cluster ──────────────────────────

describe('v2.6 §2 — causal chain Rule 6 (thermal comfort cluster)', () => {
  it('fires on two thermal/humidity excursions + complaint', () => {
    const findings = [
      f('temperature_outside_comfort'),
      f('humidity_above_comfort_upper_bound'),
      f('occupant_symptoms_anecdotal'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const chain = chains.find(c => c.id === 'chain_thermal_comfort')
    expect(chain).toBeDefined()
    expect(chain!.rootCause).toMatch(/zoning|balancing|controls/)
  })

  it('does not fire on a single thermal excursion + complaint', () => {
    const findings = [
      f('temperature_outside_comfort'),
      f('occupant_symptoms_anecdotal'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_thermal_comfort')).toBeUndefined()
  })

  it('does not fire when thermal excursions exist but no complaint', () => {
    const findings = [
      f('temperature_outside_comfort'),
      f('humidity_above_comfort_upper_bound'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.find(c => c.id === 'chain_thermal_comfort')).toBeUndefined()
  })
})

// ── Orchestrator-level assertions ─────────────────────────────

describe('v2.6 §2 — deriveCausalChains orchestrator', () => {
  it('produces zero chains for an empty findings array', () => {
    expect(deriveCausalChains([zone('A')], [])).toHaveLength(0)
  })

  it('produces zero chains for isolated single findings', () => {
    expect(deriveCausalChains([zone('A')], [f('temperature_outside_comfort')])).toHaveLength(0)
  })

  it('filters pass and info findings before evaluating rules', () => {
    const findings = [
      f('ventilation_inadequate_outdoor_air', { severityInternal: 'pass' }),
      f('hvac_filter_loaded', { severityInternal: 'info' }),
      f('occupant_symptoms_anecdotal', { severityInternal: 'pass' }),
    ]
    expect(deriveCausalChains([zone('A')], findings)).toHaveLength(0)
  })

  it('every emitted chain has non-empty relatedFindingIds, rootCause, and citation', () => {
    const findings = [
      f('apparent_microbial_growth'),
      f('humidity_microbial_amplification_range'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) {
      expect(c.relatedFindingIds.length).toBeGreaterThan(0)
      expect(c.rootCause.length).toBeGreaterThan(0)
      expect(c.citation.source.length).toBeGreaterThan(0)
    }
  })

  it('a single finding can participate in multiple chains', () => {
    // PM elevated supports both filter-failure chain and (with a
    // data-center zone) the data-center cleanliness chain.
    const findings = [
      f('hvac_filter_loaded'),
      f('pm_screening_elevated'),
    ]
    const chains = deriveCausalChains([zone('Data Hall A')], findings)
    const ids = chains.map(c => c.id)
    expect(ids).toContain('chain_filter_particulate')
    expect(ids).toContain('chain_data_center_corrosion')
  })

  it('dedupes by chain id (a rule never emits twice for the same input)', () => {
    const findings = [
      f('apparent_microbial_growth'),
      f('apparent_microbial_growth'),
      f('humidity_microbial_amplification_range'),
    ]
    const chains = deriveCausalChains([zone('A')], findings)
    const ids = chains.map(c => c.id)
    const dedup = [...new Set(ids)]
    expect(ids).toEqual(dedup)
  })
})
