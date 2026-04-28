import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'

export const HVAC_PHRASES: Partial<Record<ConditionType, PhraseLibraryEntry>> = {
  hvac_maintenance_overdue: {
    conditionType: 'hvac_maintenance_overdue',
    intentTemplate:
      'HVAC maintenance records indicate the system is overdue for routine service. Deferred maintenance may affect air distribution and filtration performance.',
    bannedAlternatives: ['HVAC system failure', 'noncompliant HVAC', 'hazardous HVAC condition'],
    definitiveConclusionRequires: ['documented_records'],
    causationSupportRequires: ['documented_records'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'HVAC maintenance status was reported by facility staff and not independently verified.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Schedule comprehensive HVAC inspection including coil cleaning, belt inspection, and controls verification.' },
    ],
  },

  hvac_filter_loaded: {
    conditionType: 'hvac_filter_loaded',
    intentTemplate:
      'Air filters were observed to be heavily loaded or visibly soiled. Loaded filters reduce airflow and filtration efficiency.',
    bannedAlternatives: ['filter failure', 'hazardous filtration condition'],
    definitiveConclusionRequires: ['visual_olfactory_screening'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Filter condition was assessed visually. Differential pressure measurement was not performed.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Replace air filters. Inspect filter housing for bypass or damage.' },
    ],
  },

  hvac_filter_below_recommended_class: {
    conditionType: 'hvac_filter_below_recommended_class',
    intentTemplate:
      'Installed filter efficiency appears below the ASHRAE 62.1 recommended minimum (MERV 13 for recirculated air). Upgrading filtration may reduce indoor particulate levels.',
    bannedAlternatives: ['noncompliant filtration', 'filter violation'],
    definitiveConclusionRequires: ['documented_records'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Filter MERV rating was reported or estimated visually; laboratory testing of filter efficiency was not performed.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Evaluate feasibility of upgrading to MERV 13 or higher filtration. Verify system static pressure capacity.', standardReference: 'ASHRAE 62.1-2025' },
    ],
  },

  hvac_outdoor_air_damper_compromised: {
    conditionType: 'hvac_outdoor_air_damper_compromised',
    intentTemplate:
      'The outdoor air damper was observed in a position that may restrict outdoor air delivery. Damper position affects ventilation adequacy.',
    bannedAlternatives: ['ventilation failure', 'noncompliant outdoor air', 'damper failure confirmed'],
    definitiveConclusionRequires: ['documented_records'],
    causationSupportRequires: ['documented_records'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Damper position was observed at a single point in time. Damper operation may vary with controls sequence.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Verify outdoor air damper position, actuator operation, and controls sequence. Measure outdoor air fraction at the air handler.' },
    ],
  },

  hvac_drain_pan_microbial_reservoir: {
    conditionType: 'hvac_drain_pan_microbial_reservoir',
    intentTemplate:
      'Standing water or biological growth was observed in the HVAC condensate drain pan. This condition creates a potential microbial reservoir and should be addressed. Legionella risk should be evaluated per ASHRAE Standard 188 if a Water Management Program is not in place.',
    bannedAlternatives: ['Legionella confirmed', 'hazardous biological condition', 'unsafe HVAC system'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Microbial identification was not performed. Visual observation alone cannot determine species or pathogenicity.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Clean drain pan, treat with EPA-registered biocide, and verify proper slope and condensate disposal.' },
      { priority: 'short_term', timeframe: '7–30 days', action: 'Evaluate Legionella risk per ASHRAE Standard 188. Consider water sampling if building lacks a Water Management Program.', standardReference: 'ASHRAE Standard 188' },
    ],
  },
}
