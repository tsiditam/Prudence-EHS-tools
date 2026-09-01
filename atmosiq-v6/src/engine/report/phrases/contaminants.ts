import type { ConditionType, PhraseLibraryEntry } from '../../types/domain'

export const CONTAMINANTS_PHRASES: Partial<Record<ConditionType, PhraseLibraryEntry>> = {
  co_above_pel_documented: {
    conditionType: 'co_above_pel_documented',
    intentTemplate:
      'Carbon monoxide measurements documented during the assessment exceed the OSHA 8-hour permissible exposure limit. This finding is supported by direct measurement using validated methodology.',
    bannedAlternatives: [],
    definitiveConclusionRequires: ['documented_8hr_twa', 'screening_continuous'],
    causationSupportRequires: ['documented_8hr_twa'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'Source identification was not within the scope of this assessment.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Identify and eliminate combustion source; verify with continuous monitoring.', standardReference: '29 CFR 1910.1000 Table Z-1' },
    ],
  },

  co_screening_elevated: {
    conditionType: 'co_screening_elevated',
    intentTemplate:
      'Carbon monoxide was detected at levels that warrant further investigation. These measurements are not equivalent to a formal exposure assessment.',
    bannedAlternatives: ['CO exceeds OSHA PEL', 'CO violation', 'unsafe CO levels'],
    definitiveConclusionRequires: ['documented_8hr_twa'],
    causationSupportRequires: ['documented_8hr_twa'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'CO measurement was a grab or short-duration reading, not an 8-hour TWA as required for OSHA PEL comparison.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Investigate potential combustion sources — attached garage, loading dock, boiler room, and any fuel-fired appliance. Log CO continuously through an occupied cycle.' },
    ],
  },

  hcho_above_pel_documented: {
    conditionType: 'hcho_above_pel_documented',
    intentTemplate:
      'Formaldehyde measurements documented during the assessment exceed the OSHA permissible exposure limit. This finding is supported by validated integrated sampling methodology.',
    bannedAlternatives: [],
    definitiveConclusionRequires: ['documented_8hr_twa', 'laboratory_speciation'],
    causationSupportRequires: ['documented_8hr_twa'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'Source apportionment was not performed.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Implement exposure controls per 29 CFR 1910.1048. Identify and mitigate emission sources.', standardReference: '29 CFR 1910.1048' },
    ],
  },

  hcho_screening_elevated: {
    conditionType: 'hcho_screening_elevated',
    intentTemplate:
      'Formaldehyde was detected at levels that exceed the NIOSH recommended exposure limit (health-protective recommendation) but remain below the OSHA action level and PEL. This is not a regulatory violation. Confirmatory integrated sampling per NIOSH 2016 is recommended.',
    bannedAlternatives: ['formaldehyde violation', 'exceeds OSHA PEL', 'unsafe formaldehyde'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'Formaldehyde was measured with a direct-reading instrument, not NIOSH 2016 (DNPH cartridge) integrated sampling.',
      'Direct-reading HCHO instruments have limited specificity and may respond to interfering compounds.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Collect integrated formaldehyde sample per NIOSH 2016 (DNPH cartridge, 2–4 hour TWA) for confirmatory analysis.', standardReference: 'NIOSH Method 2016' },
    ],
  },

  tvoc_screening_elevated: {
    conditionType: 'tvoc_screening_elevated',
    intentTemplate:
      'Total volatile organic compounds (TVOCs) were elevated. TVOC is an indicator only — no regulatory limit exists for total VOCs, and TVOC measurement does not identify individual compounds. TO-17 speciation is recommended if source investigation is warranted.',
    bannedAlternatives: ['TVOC exceeds limit', 'VOC violation', 'unsafe VOC levels', 'toxic VOCs confirmed'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'TVOC is measured by PID and represents total ionizable compounds. Individual compound identification requires TO-17 thermal desorption GC/MS.',
    ],
    technicalContext: [
      // Was 'Mølhave (1991) TVOC tiers are advisory benchmarks, not regulatory
      // limits.' until 2026-08. A caveat that a tier is only advisory still
      // puts the tier in front of the reader, which is the whole mechanism by
      // which those figures kept reaching client-facing text. AtmosFlow now
      // applies no TVOC threshold at all, so there is no tier to qualify.
      'No consensus health-based exposure limit exists for total VOCs, and none is applied here. A TVOC result is an aggregate indicator, not a basis for judging acceptability.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Collect sorbent tube samples for TO-17 speciation (thermal desorption GC/MS) to identify individual VOC compounds.', standardReference: 'EPA TO-17' },
    ],
  },

  pm_above_naaqs_documented: {
    conditionType: 'pm_above_naaqs_documented',
    intentTemplate:
      'PM2.5 mass concentration was above the EPA 24-hour NAAQS at the time of measurement. The NAAQS is a 24-hour average and an ambient standard applied here as an indoor benchmark; a reading taken during the assessment cannot establish a 24-hour mean.',
    bannedAlternatives: [],
    definitiveConclusionRequires: ['screening_continuous'],
    causationSupportRequires: ['screening_continuous'],
    regulatoryConclusionRequires: ['screening_continuous'],
    defaultLimitations: [
      'EPA NAAQS are ambient air quality standards applied here as indoor benchmarks. Indoor PM2.5 standards do not exist.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Upgrade filtration to MERV 13 or higher. Evaluate filter housing for bypass. Investigate indoor particulate sources.' },
    ],
  },

  pm_screening_elevated: {
    conditionType: 'pm_screening_elevated',
    intentTemplate:
      'PM2.5 mass concentration was elevated relative to outdoor conditions or expected indoor levels. This observation does not constitute a formal particulate assessment.',
    bannedAlternatives: ['PM2.5 exceeds standard', 'PM violation', 'hazardous particulate levels'],
    definitiveConclusionRequires: ['screening_continuous'],
    causationSupportRequires: ['screening_continuous'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'PM2.5 was measured by optical light-scattering instrument, which may differ from gravimetric reference methods.',
    ],
    defaultRecommendedActions: [
      { priority: 'further_evaluation', timeframe: '30–90 days', action: 'Evaluate filtration adequacy and indoor particulate sources.' },
    ],
  },

  pm_indoor_amplification_screening: {
    conditionType: 'pm_indoor_amplification_screening',
    intentTemplate:
      'Indoor PM2.5 concentration exceeds outdoor levels, suggesting an indoor particulate source. The indoor/outdoor ratio warrants source investigation.',
    bannedAlternatives: ['indoor air pollution confirmed', 'hazardous indoor particles'],
    definitiveConclusionRequires: ['screening_continuous'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Indoor/outdoor PM2.5 ratio is an indicator. Source identification requires additional investigation.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Identify and mitigate indoor particulate sources. Review filtration and housekeeping practices.' },
    ],
  },

  apparent_microbial_growth: {
    conditionType: 'apparent_microbial_growth',
    intentTemplate:
      'Apparent fungal or microbial growth was observed. Species and viability were not determined. Confirmatory bulk, tape-lift, or air sampling with laboratory analysis is recommended if characterization is required.',
    bannedAlternatives: ['confirmed mold', 'toxic mold', 'black mold', 'Stachybotrys', 'mold exposure confirmed', 'mold contamination'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation', 'documented_records'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Visual identification cannot distinguish fungal species or confirm viability.',
      'Health implications cannot be inferred without species identification and exposure pathway analysis.',
    ],
    defaultRecommendedActions: [
      { priority: 'immediate', timeframe: '0–7 days', action: 'Isolate affected materials and limit access pending confirmatory sampling.', standardReference: 'EPA Mold Remediation in Schools and Commercial Buildings' },
      { priority: 'short_term', timeframe: '7–30 days', action: 'Collect bulk or tape-lift samples per ASTM D7338 with laboratory speciation.', standardReference: 'ASTM D7338' },
    ],
  },

  objectionable_odor: {
    conditionType: 'objectionable_odor',
    intentTemplate:
      'An objectionable odor was identified during the assessment. Odor perception is subjective and does not by itself indicate a health hazard. Source investigation is recommended.',
    bannedAlternatives: ['toxic odor', 'hazardous odor', 'unsafe air quality confirmed by odor'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'Odor assessment is qualitative and subjective. Odor detection thresholds vary among individuals.',
    ],
    technicalContext: [
      'The presence of an odor does not necessarily indicate a health hazard.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Trace the odor to its source, working from the areas of greatest intensity toward the suspected origin.' },
    ],
  },
}
