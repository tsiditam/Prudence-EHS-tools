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
      'Carbon monoxide was detected at levels that warrant further investigation. Screening-level measurements are not equivalent to a formal exposure assessment.',
    bannedAlternatives: ['CO exceeds OSHA PEL', 'CO violation', 'unsafe CO levels'],
    definitiveConclusionRequires: ['documented_8hr_twa'],
    causationSupportRequires: ['documented_8hr_twa'],
    regulatoryConclusionRequires: ['documented_8hr_twa'],
    defaultLimitations: [
      'CO measurement was a screening-level grab or short-duration reading, not an 8-hour TWA as required for OSHA PEL comparison.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Investigate potential combustion sources. Consider continuous CO monitoring during occupied hours.' },
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
      'Total volatile organic compounds (TVOCs) were elevated during screening. TVOC is a screening indicator only — no regulatory limit exists for total VOCs, and TVOC measurement does not identify individual compounds. TO-17 speciation is recommended if source investigation is warranted.',
    bannedAlternatives: ['TVOC exceeds limit', 'VOC violation', 'unsafe VOC levels', 'toxic VOCs confirmed'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: ['laboratory_speciation'],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'TVOC is measured by PID and represents total ionizable compounds. Individual compound identification requires TO-17 thermal desorption GC/MS.',
      'Mølhave (1991) TVOC tiers are advisory screening benchmarks, not regulatory limits.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Collect sorbent tube samples for TO-17 speciation (thermal desorption GC/MS) to identify individual VOC compounds.', standardReference: 'EPA TO-17' },
    ],
  },

  pm_above_naaqs_documented: {
    conditionType: 'pm_above_naaqs_documented',
    intentTemplate:
      'PM2.5 mass concentration exceeded the EPA NAAQS 24-hour standard during the assessment period. This finding is supported by continuous monitoring with outdoor baseline comparison.',
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
      'PM2.5 mass concentration was elevated relative to outdoor conditions or expected indoor levels. This is a screening-level observation and does not constitute a formal particulate assessment.',
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
      'Indoor/outdoor PM2.5 ratio is a screening indicator. Source identification requires additional investigation.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Identify and mitigate indoor particulate sources. Review filtration and housekeeping practices.' },
    ],
  },

  particle_screening_only: {
    conditionType: 'particle_screening_only',
    intentTemplate:
      'Particle conditions warrant further evaluation. ISO 14644-1 cleanroom classification cannot be determined without particle count testing at the applicable size thresholds and a sample plan per ISO 14644-1 Annex A.',
    bannedAlternatives: ['the space does not meet ISO requirements', 'ISO Class 8 confirmed', 'fails ISO 14644'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'ISO 14644-1 classification requires a formal particle-count sample plan; this assessment did not include such measurements.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Deploy calibrated particle counter at ISO 14644-1 size thresholds (≥0.5 µm, ≥1 µm, ≥5 µm). Sample plan per ISO 14644-1:2015 Annex B.', standardReference: 'ISO 14644-1:2015' },
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
      'The presence of an odor does not necessarily indicate a health hazard.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Investigate odor source. Consider TVOC/speciation sampling if source is not readily identifiable.' },
    ],
  },

  possible_corrosive_environment: {
    conditionType: 'possible_corrosive_environment',
    intentTemplate:
      'Field observations suggest conditions that may be consistent with environments associated with increased corrosion potential. Confirmatory testing per ANSI/ISA 71.04-2013 is recommended.',
    bannedAlternatives: ['elevated corrosion risk', 'G2 environment', 'G3 environment', 'corrosive atmosphere confirmed'],
    definitiveConclusionRequires: ['laboratory_speciation'],
    causationSupportRequires: [],
    regulatoryConclusionRequires: [],
    defaultLimitations: [
      'No gas-phase contaminant measurements were collected.',
      'No copper/silver reactivity coupons were deployed.',
      'No laboratory analysis was performed.',
      'Gaseous corrosion severity is professional judgment based on visual/olfactory indicators — not instrument measurement.',
    ],
    defaultRecommendedActions: [
      { priority: 'short_term', timeframe: '7–30 days', action: 'Deploy ANSI/ISA 71.04-compliant copper and silver reactivity coupons for 30-day passive exposure.', standardReference: 'ANSI/ISA 71.04-2013' },
    ],
  },
}
