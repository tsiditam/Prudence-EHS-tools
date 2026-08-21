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
      { priority: 'short_term', timeframe: '7–30 days', action: 'Upgrade to MERV 13 or higher filtration, verifying static pressure capacity at the air handler before specifying the filter.', standardReference: 'ASHRAE 62.1-2025' },
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
      'Standing water or biological growth was observed in the HVAC condensate drain pan. This condition creates a potential microbial reservoir and should be addressed by cleaning the drain pan and associated components, correcting drainage or slope deficiencies contributing to standing water, and evaluating the source of the standing water.',
    bannedAlternatives: ['Legionella confirmed', 'hazardous biological condition', 'unsafe HVAC system'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Microbial identification was not performed. Visual observation alone cannot determine species or pathogenicity.',
    ],
    // The automatic Legionella / ASHRAE 188 escalation and the automatic
    // EPA-registered-biocide instruction were removed: a soiled condensate
    // pan does not by itself establish a recognized Legionella exposure
    // pathway, and biocide selection is a maintenance decision, not a
    // screening finding. Cleaning + drainage correction is the defensible
    // recommendation; Legionella evaluation belongs only where system
    // characteristics actually warrant it.
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Clean the condensate drain pan and associated components in accordance with manufacturer recommendations and applicable HVAC maintenance procedures; correct drainage and slope deficiencies contributing to standing water.' },
    ],
  },
}
