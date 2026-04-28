import { describe, it, expect } from 'vitest'
import { PHRASE_LIBRARY, lookupPhrase } from '../../src/engine/report/phrases/index'
import type { ConditionType } from '../../src/engine/types/domain'

const ALL_CONDITION_TYPES: ConditionType[] = [
  'ventilation_co2_only',
  'ventilation_inadequate_outdoor_air',
  'ventilation_observational_only',
  'co_above_pel_documented',
  'co_screening_elevated',
  'hcho_above_pel_documented',
  'hcho_screening_elevated',
  'tvoc_screening_elevated',
  'pm_above_naaqs_documented',
  'pm_screening_elevated',
  'pm_indoor_amplification_screening',
  'particle_screening_only',
  'apparent_microbial_growth',
  'objectionable_odor',
  'possible_corrosive_environment',
  'hvac_maintenance_overdue',
  'hvac_filter_loaded',
  'hvac_filter_below_recommended_class',
  'hvac_outdoor_air_damper_compromised',
  'hvac_drain_pan_microbial_reservoir',
  'occupant_symptoms_anecdotal',
  'occupant_cluster_anecdotal',
  'symptoms_resolve_away_from_building',
  'temperature_outside_comfort',
  'temperature_low_data_center',
  'humidity_microbial_amplification_range',
  'humidity_above_comfort_upper_bound',
  'humidity_below_comfort_lower_bound',
  'active_or_historical_water_damage',
]

describe('Phrase Library — exhaustiveness', () => {
  it('every ConditionType has a phrase library entry', () => {
    for (const ct of ALL_CONDITION_TYPES) {
      expect(PHRASE_LIBRARY[ct], `Missing phrase library entry for '${ct}'`).toBeDefined()
    }
  })

  it('every entry has non-empty intentTemplate', () => {
    for (const ct of ALL_CONDITION_TYPES) {
      const entry = PHRASE_LIBRARY[ct]
      expect(entry.intentTemplate.length).toBeGreaterThan(10)
    }
  })

  it('every entry has non-empty defaultLimitations', () => {
    for (const ct of ALL_CONDITION_TYPES) {
      const entry = PHRASE_LIBRARY[ct]
      expect(entry.defaultLimitations.length).toBeGreaterThan(0)
    }
  })

  it('no two entries share identical intentTemplate', () => {
    const templates = new Set<string>()
    for (const ct of ALL_CONDITION_TYPES) {
      const template = PHRASE_LIBRARY[ct].intentTemplate
      expect(templates.has(template), `Duplicate intentTemplate found for '${ct}'`).toBe(false)
      templates.add(template)
    }
  })

  it('lookupPhrase returns the entry for each type', () => {
    for (const ct of ALL_CONDITION_TYPES) {
      const entry = lookupPhrase(ct)
      expect(entry.conditionType).toBe(ct)
    }
  })

  it('lookupPhrase throws for unknown type', () => {
    expect(() => lookupPhrase('nonexistent_type' as ConditionType)).toThrow()
  })

  it('PHRASE_LIBRARY has exactly the right number of entries', () => {
    expect(Object.keys(PHRASE_LIBRARY).length).toBe(ALL_CONDITION_TYPES.length)
  })
})
