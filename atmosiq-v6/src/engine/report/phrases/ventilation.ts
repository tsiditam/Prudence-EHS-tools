import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'

export const VENTILATION_PHRASES: Partial<Record<ConditionType, PhraseLibraryEntry>> = {
  ventilation_co2_only: {
    conditionType: 'ventilation_co2_only',
    intentTemplate:
      'CO₂ results were within the screening range; however, ventilation assessment confidence is limited because outdoor air delivery (CFM at the terminal) was not directly measured.',
    bannedAlternatives: [
      'ventilation is adequate',
      'ventilation meets ASHRAE 62.1',
      'compliant with ASHRAE 62.1',
      'CO₂ below standard',
    ],
    definitiveConclusionRequires: ['documented_records'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Outdoor air delivery was inferred from CO₂ surrogate methodology, not measured directly.',
      'ASHRAE 62.1 compliance requires measured supply airflow and outdoor-air fraction at the air handler.',
    ],
    defaultRecommendedActions: [
      {
        priority: 'further_evaluation',
        timeframe: '30–90 days',
        action: 'Conduct AABC/NEBB-method airflow measurement at supply terminals and verify outdoor-air fraction at the air handler.',
        standardReference: 'ASHRAE 62.1-2025 §6.2.2',
      },
    ],
  },

  ventilation_inadequate_outdoor_air: {
    conditionType: 'ventilation_inadequate_outdoor_air',
    intentTemplate:
      'Ventilation indicators suggest outdoor air delivery may be below the rate required for the observed occupancy. Confirmatory airflow measurement is recommended.',
    bannedAlternatives: [
      'ventilation is noncompliant',
      'building violates ASHRAE 62.1',
      'ventilation failure confirmed',
    ],
    definitiveConclusionRequires: ['documented_8hr_twa', 'documented_records'],
    causationSupportRequires: ['documented_records'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'Ventilation adequacy was assessed using CO₂ as a surrogate indicator, not direct airflow measurement.',
      'CO₂ is a ventilation effectiveness indicator, not an air quality contaminant (Persily, ASHRAE Journal 2021).',
    ],
    defaultRecommendedActions: [
      {
        priority: 'short_term',
        timeframe: '7–30 days',
        action: 'Verify outdoor air damper position and operation. Measure supply airflow at terminals.',
        standardReference: 'ASHRAE 62.1-2025',
      },
    ],
  },

  ventilation_observational_only: {
    conditionType: 'ventilation_observational_only',
    intentTemplate:
      'Ventilation was evaluated based on observational indicators only. No direct-reading measurements of CO₂, airflow, or air changes per hour were obtained.',
    bannedAlternatives: [
      'ventilation is inadequate',
      'ventilation failure',
      'noncompliant ventilation',
    ],
    definitiveConclusionRequires: ['screening_continuous', 'documented_records'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'No ventilation measurements were collected. Observational indicators alone cannot establish ventilation adequacy.',
    ],
    defaultRecommendedActions: [
      {
        priority: 'further_evaluation',
        timeframe: '30–90 days',
        action: 'Obtain CO₂ measurements and/or direct airflow measurements to quantify ventilation performance.',
      },
    ],
  },
}
