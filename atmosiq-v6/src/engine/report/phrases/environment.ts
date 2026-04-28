import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'

export const ENVIRONMENT_PHRASES: Partial<Record<ConditionType, PhraseLibraryEntry>> = {
  temperature_outside_comfort: {
    conditionType: 'temperature_outside_comfort',
    intentTemplate:
      'Measured temperature was outside the ASHRAE 55 thermal comfort range for the applicable season and clothing assumptions. Occupant thermal discomfort may affect perceived air quality.',
    bannedAlternatives: ['unsafe temperature', 'hazardous thermal condition', 'noncompliant temperature'],
    definitiveConclusionRequires: [],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'ASHRAE 55 is a comfort consensus standard, not a health-based or regulatory limit.',
      'Comfort interpretation depends on activity level, clothing, and individual physiology.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Evaluate thermostat settings, HVAC zoning, and airflow distribution for the affected area.', standardReference: 'ASHRAE 55-2023' },
    ],
  },

  temperature_low_data_center: {
    conditionType: 'temperature_low_data_center',
    intentTemplate:
      'Measured temperature was at the lower end of typical comfort expectations. Data center operational requirements (ASHRAE TC 9.9 thermal guidelines) may justify temperature ranges outside ASHRAE 55 occupant comfort zones.',
    bannedAlternatives: ['outside ASHRAE 55', 'high-risk thermal condition', 'noncompliant temperature'],
    definitiveConclusionRequires: [],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Comfort interpretation depends on intended occupancy and clothing assumptions; data centers operate to equipment-reliability targets, not occupant comfort.',
    ],
    defaultRecommendedActions: [],
  },

  humidity_microbial_amplification_range: {
    conditionType: 'humidity_microbial_amplification_range',
    intentTemplate:
      'Relative humidity was elevated to a level where microbial amplification potential increases. Sustained humidity above 60% accelerates fungal growth on susceptible materials.',
    bannedAlternatives: ['mold confirmed due to humidity', 'hazardous humidity', 'unsafe moisture levels'],
    definitiveConclusionRequires: ['screening_continuous'],
    causationSupportRequires: ['screening_continuous', 'laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'RH was measured at a single point in time. Sustained RH duration is critical for microbial amplification risk assessment.',
      'Continuous RH logging over 14+ days is recommended to characterize excursion frequency.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Deploy continuous RH data logger to characterize duration and frequency of humidity excursions above 60%.', standardReference: 'ASHRAE 55-2023' },
    ],
  },

  humidity_above_comfort_upper_bound: {
    conditionType: 'humidity_above_comfort_upper_bound',
    intentTemplate:
      'Relative humidity exceeded the upper bound of the recommended comfort range. Elevated humidity may contribute to occupant discomfort and condensation on building surfaces.',
    bannedAlternatives: ['unsafe humidity', 'hazardous moisture', 'noncompliant humidity'],
    definitiveConclusionRequires: [],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'ASHRAE 55 humidity recommendations are comfort-based, not health-based limits.',
    ],
    defaultRecommendedActions: [
      { priority: 'further_evaluation', timeframe: '30–90 days', action: 'Evaluate dehumidification capacity and HVAC moisture removal performance.' },
    ],
  },

  humidity_below_comfort_lower_bound: {
    conditionType: 'humidity_below_comfort_lower_bound',
    intentTemplate:
      'Relative humidity was below the lower bound of the recommended comfort range. Low humidity may contribute to dry skin, eye irritation, and static discharge.',
    bannedAlternatives: ['unsafe low humidity', 'hazardous dry conditions'],
    definitiveConclusionRequires: [],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Low humidity is a comfort concern, not a regulatory violation. ASHRAE 55 does not set a minimum humidity limit.',
    ],
    defaultRecommendedActions: [
      { priority: 'further_evaluation', timeframe: '30–90 days', action: 'Evaluate humidification options if occupant complaints are persistent.' },
    ],
  },

  active_or_historical_water_damage: {
    conditionType: 'active_or_historical_water_damage',
    intentTemplate:
      'Evidence of water damage was identified. Active or historical water intrusion creates conditions favorable for microbial amplification and material deterioration.',
    bannedAlternatives: ['mold contamination confirmed', 'unsafe water damage', 'hazardous water intrusion'],
    definitiveConclusionRequires: ['visual_olfactory_screening'],
    causationSupportRequires: ['visual_olfactory_screening', 'laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Water damage extent was assessed visually. Moisture content of affected materials was not measured.',
      'Microbial growth associated with water damage was not confirmed by laboratory analysis.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Arrest active water intrusion. Assess affected materials within 48 hours per IICRC S500.', standardReference: 'IICRC S500' },
      { priority: 'short_term', timeframe: '7–30 days', action: 'Conduct moisture mapping of affected areas. Remediate damaged materials per IICRC S520 / EPA Mold Remediation guidance.', standardReference: 'IICRC S520' },
    ],
  },
}
