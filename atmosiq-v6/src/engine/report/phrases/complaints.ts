import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'

export const COMPLAINTS_PHRASES: Partial<Record<ConditionType, PhraseLibraryEntry>> = {
  occupant_symptoms_anecdotal: {
    conditionType: 'occupant_symptoms_anecdotal',
    intentTemplate:
      'Anecdotal occupant feedback suggests a potential building-related pattern. A structured symptom survey was not conducted at the time of assessment.',
    bannedAlternatives: [
      'the building is causing symptoms',
      'occupants are being made sick',
      'building-related illness was confirmed',
      'sick building syndrome confirmed',
    ],
    definitiveConclusionRequires: ['occupant_survey_structured'],
    causationSupportRequires: ['occupant_survey_structured', 'laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Reported symptoms were collected informally and not through a validated symptom-survey instrument.',
      'Causation between building conditions and symptoms cannot be established from anecdotal report alone.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Administer a structured occupant symptom survey (NIOSH IEQ questionnaire or equivalent) across affected zones.' },
    ],
  },

  occupant_cluster_anecdotal: {
    conditionType: 'occupant_cluster_anecdotal',
    intentTemplate:
      'Multiple occupants in the same area reported similar symptoms, suggesting a potential spatial cluster. Formal epidemiological evaluation was not performed.',
    bannedAlternatives: [
      'disease cluster confirmed',
      'outbreak identified',
      'occupants are being poisoned',
      'building-related illness cluster confirmed',
    ],
    definitiveConclusionRequires: ['occupant_survey_structured'],
    causationSupportRequires: ['occupant_survey_structured', 'documented_8hr_twa'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Symptom clustering was identified informally and has not been confirmed through epidemiological analysis.',
      'Spatial clustering alone does not establish causation.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Conduct structured symptom survey with spatial mapping of affected and unaffected occupants.' },
      { priority: 'short_term', timeframe: '7–30 days', action: 'Implement occupant risk communication plan per ATSDR guidance.' },
    ],
  },

  symptoms_resolve_away_from_building: {
    conditionType: 'symptoms_resolve_away_from_building',
    intentTemplate:
      'Occupants report that symptoms improve when away from the building, which is an epidemiological indicator consistent with building-related illness. This pattern supports the hypothesis of a building-related contributor but does not confirm causation.',
    bannedAlternatives: [
      'building-related illness confirmed',
      'the building is making people sick',
      'causation established',
    ],
    definitiveConclusionRequires: ['occupant_survey_structured', 'documented_8hr_twa'],
    causationSupportRequires: ['occupant_survey_structured', 'documented_8hr_twa', 'laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Symptom resolution pattern was self-reported and not confirmed through controlled observation.',
      'Multiple confounding factors (weather, commute, psychosocial) may influence symptom patterns.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Prioritize ventilation and source investigation in zones where symptom resolution pattern is reported.' },
    ],
  },
}
