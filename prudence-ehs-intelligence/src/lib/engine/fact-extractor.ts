/**
 * Fact Extraction Pipeline
 * Deterministic extraction of normalized facts from document text.
 * Uses keyword/pattern matching — no LLM dependency.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

export interface ExtractedFact {
  factKey: string;
  factValue: string;
  factStatus: 'confirmed' | 'inferred' | 'not_found' | 'contradicted';
  sourceExcerpt?: string;
  sourcePage?: string;
  confidence: number;
}

interface FactPattern {
  factKey: string;
  label: string;
  patterns: RegExp[];
  negativePatterns?: RegExp[];
}

// --- OSHA Fact Patterns ---

const HAZCOM_PATTERNS: FactPattern[] = [
  {
    factKey: 'written_program',
    label: 'Written HazCom Program',
    patterns: [
      /written\s+(hazard\s+communication|hazcom|haz\s*com)\s+(program|plan|policy)/i,
      /hazard\s+communication\s+(program|plan|policy)\s+(has\s+been|is)\s+(developed|established|written|maintained)/i,
      /written\s+program\s+.*hazard\s+commun/i,
    ],
  },
  {
    factKey: 'labeling_system',
    label: 'Container Labeling System',
    patterns: [
      /label(ing|s)?\s+(system|program|procedure|requirement)/i,
      /container\s+label/i,
      /GHS\s+label/i,
      /hazard\s+warning\s+label/i,
      /secondary\s+container\s+label/i,
    ],
  },
  {
    factKey: 'sds_access',
    label: 'SDS Access Method',
    patterns: [
      /safety\s+data\s+sheet/i,
      /SDS\s+(access|avail|maintain|location|binder|electronic|system)/i,
      /material\s+safety\s+data\s+sheet/i,
      /MSDS/i,
    ],
  },
  {
    factKey: 'employee_training',
    label: 'Employee Training Program',
    patterns: [
      /training\s+.*hazard\s+commun/i,
      /hazcom\s+training/i,
      /employee\s+.*training\s+.*(chemical|hazard)/i,
      /train(ed|ing)\s+.*chemical\s+hazard/i,
    ],
  },
  {
    factKey: 'training_timing',
    label: 'Training Timing Requirements',
    patterns: [
      /(initial|new\s+hire|before\s+starting|prior\s+to|at\s+time\s+of\s+assignment)\s+.*training/i,
      /training\s+.*(initial|new\s+(hire|employee)|before\s+work|at\s+the\s+time)/i,
      /new\s+chemical\s+.*training/i,
      /annual\s+.*refresher\s+.*training/i,
    ],
  },
  {
    factKey: 'nonroutine_task_communication',
    label: 'Non-Routine Task Hazard Communication',
    patterns: [
      /non[\s-]?routine\s+task/i,
      /unusual\s+task/i,
      /infrequent\s+.*task\s+.*hazard/i,
    ],
  },
  {
    factKey: 'contractor_communication',
    label: 'Contractor/Multi-Employer Communication',
    patterns: [
      /contractor\s+.*hazard\s+commun/i,
      /multi[\s-]?employer/i,
      /outside\s+contractor/i,
      /contractor\s+.*chemical/i,
      /shared\s+workplace/i,
    ],
  },
];

const LOTO_PATTERNS: FactPattern[] = [
  {
    factKey: 'scope',
    label: 'Program Scope',
    patterns: [
      /scope\s+.*(lockout|tagout|LOTO|energy\s+control)/i,
      /(lockout|LOTO)\s+.*scope/i,
      /applies\s+to\s+.*servic(ing|e)\s+and\s+maintenance/i,
    ],
  },
  {
    factKey: 'energy_isolation_procedures',
    label: 'Energy Isolation Procedures',
    patterns: [
      /energy\s+isolation\s+procedure/i,
      /energy\s+control\s+procedure/i,
      /lockout\s+procedure/i,
      /isolation\s+device/i,
      /zero\s+energy\s+state/i,
    ],
  },
  {
    factKey: 'authorized_vs_affected',
    label: 'Authorized vs Affected Employee Distinction',
    patterns: [
      /authorized\s+employee/i,
      /affected\s+employee/i,
      /authorized\s+.*affected/i,
    ],
  },
  {
    factKey: 'training',
    label: 'LOTO Training Program',
    patterns: [
      /training\s+.*(lockout|tagout|LOTO|energy\s+control)/i,
      /(lockout|LOTO)\s+.*training/i,
    ],
  },
  {
    factKey: 'periodic_inspections',
    label: 'Periodic Inspections',
    patterns: [
      /periodic\s+inspection/i,
      /annual\s+.*inspection\s+.*(lockout|energy\s+control)/i,
      /(lockout|LOTO)\s+.*audit/i,
    ],
  },
  {
    factKey: 'responsibilities',
    label: 'Roles and Responsibilities',
    patterns: [
      /responsibilit(y|ies)\s+.*(lockout|LOTO|energy\s+control)/i,
      /(lockout|LOTO)\s+.*responsibilit/i,
      /supervisor\s+.*responsib.*energy/i,
    ],
  },
];

const EAP_PATTERNS: FactPattern[] = [
  {
    factKey: 'emergency_reporting',
    label: 'Emergency Reporting Procedures',
    patterns: [
      /emergency\s+report/i,
      /report(ing)?\s+.*emergency/i,
      /fire\s+alarm/i,
      /call\s+911/i,
      /emergency\s+notification/i,
    ],
  },
  {
    factKey: 'evacuation_procedures',
    label: 'Evacuation Procedures',
    patterns: [
      /evacuation\s+(procedure|route|plan|map)/i,
      /emergency\s+exit/i,
      /assembly\s+(point|area|location)/i,
    ],
  },
  {
    factKey: 'employee_accounting',
    label: 'Employee Accounting After Evacuation',
    patterns: [
      /account(ing)?\s+.*employee/i,
      /head\s+count/i,
      /roster/i,
      /personnel\s+accounting/i,
    ],
  },
  {
    factKey: 'rescue_medical_duties',
    label: 'Rescue and Medical Duties',
    patterns: [
      /rescue\s+.*dut/i,
      /medical\s+dut/i,
      /first\s+aid/i,
      /CPR/i,
      /AED/i,
      /emergency\s+medical/i,
    ],
  },
  {
    factKey: 'contact_persons',
    label: 'Emergency Contact Persons',
    patterns: [
      /contact\s+person/i,
      /emergency\s+coordinator/i,
      /emergency\s+contact/i,
      /responsible\s+person.*emergency/i,
    ],
  },
];

const RESPPRO_PATTERNS: FactPattern[] = [
  {
    factKey: 'hazard_basis',
    label: 'Respiratory Hazard Basis',
    patterns: [
      /hazard\s+assessment\s+.*respirat/i,
      /exposure\s+assessment/i,
      /airborne\s+hazard/i,
      /respiratory\s+hazard/i,
      /PEL|TLV|REL|STEL|TWA/i,
    ],
  },
  {
    factKey: 'respirator_selection',
    label: 'Respirator Selection',
    patterns: [
      /respirator\s+selection/i,
      /select(ed|ion)\s+.*respirator/i,
      /N95|P100|half[\s-]?face|full[\s-]?face|SCBA|PAPR|APR|SAR/i,
    ],
  },
  {
    factKey: 'medical_evaluation',
    label: 'Medical Evaluation',
    patterns: [
      /medical\s+evaluation/i,
      /medical\s+clearance/i,
      /physician.*respirator/i,
      /PLHCP/i,
      /medical\s+questionnaire/i,
    ],
  },
  {
    factKey: 'fit_testing',
    label: 'Fit Testing',
    patterns: [
      /fit\s+test/i,
      /qualitative\s+fit/i,
      /quantitative\s+fit/i,
      /user\s+seal\s+check/i,
    ],
  },
  {
    factKey: 'training',
    label: 'Respiratory Protection Training',
    patterns: [
      /training\s+.*respirat/i,
      /respirat.*training/i,
      /instruct.*respirator\s+use/i,
    ],
  },
  {
    factKey: 'cleaning_storage_maintenance',
    label: 'Cleaning, Storage, and Maintenance',
    patterns: [
      /(clean|sanitiz|disinfect).*respirator/i,
      /respirator.*(storage|stored|maintenance|inspect)/i,
      /respirator\s+care/i,
    ],
  },
];

// --- ASHRAE Fact Patterns ---

const ASHRAE_621_PATTERNS: FactPattern[] = [
  {
    factKey: 'occupancy_basis',
    label: 'Occupancy or Space-Use Basis',
    patterns: [
      /occupan(cy|t)\s+(type|category|density|load|basis)/i,
      /space[\s-]?use\s+(type|category|basis)/i,
      /zone\s+category/i,
      /office|classroom|retail|assembly|healthcare/i,
    ],
  },
  {
    factKey: 'ventilation_basis',
    label: 'Ventilation Basis Identified',
    patterns: [
      /ventilation\s+(rate|basis|standard|requirement|design)/i,
      /ASHRAE\s+62\.?1/i,
      /ventilation\s+rate\s+procedure/i,
      /IAQ\s+procedure/i,
      /cfm\s+per\s+(person|area|occupant)/i,
    ],
  },
  {
    factKey: 'outdoor_air_method',
    label: 'Outdoor Air Method or Basis',
    patterns: [
      /outdoor\s+air\s+(rate|intake|method|supply|volume|quantity)/i,
      /minimum\s+outdoor\s+air/i,
      /fresh\s+air\s+(intake|supply|requirement)/i,
      /OA\s+rate/i,
    ],
  },
  {
    factKey: 'air_distribution',
    label: 'Air Distribution or System Basis',
    patterns: [
      /air\s+distribution\s+(system|method|design)/i,
      /supply\s+air\s+(diffuser|register|system)/i,
      /return\s+air/i,
      /duct\s+(system|design|layout)/i,
      /air\s+handling\s+unit|AHU/i,
    ],
  },
  {
    factKey: 'local_exhaust',
    label: 'Local Exhaust Discussion',
    patterns: [
      /local\s+exhaust/i,
      /exhaust\s+(fan|ventilation|system|hood)/i,
      /restroom\s+exhaust/i,
      /kitchen\s+exhaust/i,
      /laboratory\s+(hood|exhaust)/i,
    ],
  },
  {
    factKey: 'filtration_basis',
    label: 'Filtration Basis',
    patterns: [
      /filter\s+(type|rating|basis|requirement|efficiency|MERV)/i,
      /MERV\s*\d/i,
      /HEPA\s+filter/i,
      /air\s+filtration/i,
      /particulate\s+filter/i,
    ],
  },
  {
    factKey: 'om_responsibilities',
    label: 'O&M Responsibilities',
    patterns: [
      /operation\s+and\s+maintenance/i,
      /O\s*&\s*M\s+(responsibilit|plan|schedule|procedure)/i,
      /maintenance\s+(schedule|responsibilit|plan|procedure)/i,
      /preventive\s+maintenance/i,
    ],
  },
  {
    factKey: 'complaint_response',
    label: 'IAQ Complaint Response Pathway',
    patterns: [
      /complaint\s+(response|procedure|pathway|process|investigation)/i,
      /IAQ\s+complaint/i,
      /occupant\s+complaint/i,
      /indoor\s+air\s+quality\s+complaint/i,
    ],
  },
  {
    factKey: 'moisture_contaminant_sources',
    label: 'Moisture or Contaminant Source Considerations',
    patterns: [
      /moisture\s+(source|control|management|issue|problem)/i,
      /contaminant\s+source/i,
      /mold/i,
      /water\s+(damage|intrusion|leak)/i,
      /humidity\s+control/i,
    ],
  },
];

const ASHRAE_622_PATTERNS: FactPattern[] = [
  {
    factKey: 'whole_dwelling_ventilation',
    label: 'Whole-Dwelling Ventilation Basis',
    patterns: [
      /whole[\s-]?(dwelling|house|building)\s+ventilation/i,
      /continuous\s+ventilation/i,
      /mechanical\s+ventilation\s+.*dwelling/i,
      /ASHRAE\s+62\.?2/i,
    ],
  },
  {
    factKey: 'local_exhaust_kitchen_bath',
    label: 'Local Exhaust for Kitchen/Bath',
    patterns: [
      /kitchen\s+exhaust/i,
      /bath(room)?\s+exhaust/i,
      /range\s+hood/i,
      /exhaust\s+fan\s+.*(kitchen|bath)/i,
    ],
  },
  {
    factKey: 'operation_maintenance',
    label: 'Operation and Maintenance',
    patterns: [
      /operation\s+and\s+maintenance/i,
      /O\s*&\s*M/i,
      /maintenance\s+.*ventilation/i,
    ],
  },
  {
    factKey: 'moisture_source_control',
    label: 'Moisture and Source Control',
    patterns: [
      /moisture\s+(control|source|management)/i,
      /source\s+control/i,
      /mold\s+prevent/i,
      /condensation\s+control/i,
    ],
  },
  {
    factKey: 'occupant_instructions',
    label: 'Occupant Instructions',
    patterns: [
      /occupant\s+(instruction|guide|information|manual)/i,
      /resident\s+(instruction|guide)/i,
      /tenant\s+(instruction|guide)/i,
    ],
  },
];

const ASHRAE_55_PATTERNS: FactPattern[] = [
  {
    factKey: 'temperature_criteria',
    label: 'Temperature Criteria',
    patterns: [
      /temperature\s+(criteria|range|setpoint|standard|limit|requirement)/i,
      /thermostat\s+set/i,
      /operative\s+temperature/i,
      /dry[\s-]?bulb\s+temperature/i,
      /\d+\s*°?\s*[FC]\s*(to|[-–])\s*\d+\s*°?\s*[FC]/i,
    ],
  },
  {
    factKey: 'humidity_criteria',
    label: 'Humidity Criteria',
    patterns: [
      /humidity\s+(criteria|range|level|setpoint|limit|requirement|ratio)/i,
      /relative\s+humidity/i,
      /RH\s*(%|\s+level)/i,
      /dew\s*point/i,
    ],
  },
  {
    factKey: 'air_speed_considerations',
    label: 'Air Speed or Draft Considerations',
    patterns: [
      /air\s+(speed|velocity|movement|draft)/i,
      /draft\s+(complaint|risk|control)/i,
      /elevated\s+air\s+speed/i,
    ],
  },
  {
    factKey: 'personal_factors',
    label: 'Personal Factors Documentation',
    patterns: [
      /personal\s+factor/i,
      /clothing\s+insulation/i,
      /metabolic\s+rate/i,
      /clo\s+value/i,
      /met\s+value/i,
      /activity\s+level/i,
    ],
  },
  {
    factKey: 'evaluation_basis',
    label: 'Comfort Evaluation Basis',
    patterns: [
      /comfort\s+(evaluation|assessment|survey|criteria|standard)/i,
      /thermal\s+comfort\s+(evaluation|survey|study)/i,
      /PMV|PPD/i,
      /ASHRAE\s+55/i,
      /comfort\s+zone/i,
    ],
  },
];

const ASHRAE_241_PATTERNS: FactPattern[] = [
  {
    factKey: 'infection_control_objective',
    label: 'Infectious Aerosol Control Objective',
    patterns: [
      /infect(ion|ious)\s+.*control\s+objective/i,
      /infectious\s+aerosol/i,
      /airborne\s+infection/i,
      /pathogen\s+control/i,
      /ASHRAE\s+241/i,
    ],
  },
  {
    factKey: 'assessment_planning',
    label: 'Assessment and Planning Basis',
    patterns: [
      /assessment\s+.*infect/i,
      /planning\s+.*(infection|aerosol|pathogen)/i,
      /risk\s+assessment\s+.*airborne/i,
      /infection\s+control\s+plan/i,
    ],
  },
  {
    factKey: 'equivalent_clean_airflow',
    label: 'Equivalent Clean Airflow Strategy',
    patterns: [
      /equivalent\s+clean\s+air/i,
      /ECA\s*(flow|rate|strategy|delivery)/i,
      /clean\s+air\s+(delivery|rate|flow|equivalent)/i,
    ],
  },
  {
    factKey: 'filtration_aircleaner_basis',
    label: 'Filtration or Air-Cleaner Basis',
    patterns: [
      /air[\s-]?clean(er|ing)\s+(device|system|technology|basis|selection)/i,
      /UVGI|ultraviolet\s+germicidal/i,
      /bipolar\s+ionization/i,
      /photocatalytic\s+oxidation/i,
      /portable\s+air\s+clean/i,
      /HEPA\s+.*(clean|purif|filter)/i,
    ],
  },
  {
    factKey: 'om_responsibilities',
    label: 'O&M for Infection Controls',
    patterns: [
      /maintenance\s+.*infect/i,
      /O\s*&\s*M\s+.*infect/i,
      /maintenance\s+.*air[\s-]?clean/i,
      /filter\s+replacement\s+.*schedule/i,
    ],
  },
  {
    factKey: 'commissioning_verification',
    label: 'Commissioning or Verification',
    patterns: [
      /commission(ing)?\s+.*(verification|testing|airflow|clean\s+air)/i,
      /verif(ication|y)\s+.*(airflow|performance|clean\s+air)/i,
      /performance\s+test/i,
    ],
  },
  {
    factKey: 'activation_criteria',
    label: 'Control Activation or Escalation Criteria',
    patterns: [
      /activation\s+(criteria|trigger|threshold)/i,
      /escalation\s+(criteria|level|mode)/i,
      /infection\s+control\s+mode/i,
      /pandemic\s+mode/i,
      /outbreak\s+response/i,
    ],
  },
  {
    factKey: 'aircleaner_safety_basis',
    label: 'Air-Cleaner Safety Basis',
    patterns: [
      /air[\s-]?clean(er|ing)\s+.*safe/i,
      /ozone\s+(emission|generation|limit)/i,
      /byproduct/i,
      /UL\s+2998/i,
      /safety\s+.*air[\s-]?clean/i,
    ],
  },
];

// --- Track to Pattern Map ---

const OSHA_TRACK_PATTERNS: Record<string, FactPattern[]> = {
  hazcom: HAZCOM_PATTERNS,
  loto: LOTO_PATTERNS,
  eap: EAP_PATTERNS,
  respiratory: RESPPRO_PATTERNS,
};

const ASHRAE_TRACK_PATTERNS: Record<string, FactPattern[]> = {
  'ashrae-62.1': ASHRAE_621_PATTERNS,
  'ashrae-62.2': ASHRAE_622_PATTERNS,
  'ashrae-55': ASHRAE_55_PATTERNS,
  'ashrae-241': ASHRAE_241_PATTERNS,
};

// --- Core Extraction Functions ---

function searchForFact(text: string, pattern: FactPattern): ExtractedFact {
  const normalizedText = text.replace(/\s+/g, ' ');
  let bestMatch: { excerpt: string; confidence: number } | null = null;

  for (const regex of pattern.patterns) {
    const match = normalizedText.match(regex);
    if (match) {
      const start = Math.max(0, match.index! - 100);
      const end = Math.min(normalizedText.length, match.index! + match[0].length + 100);
      const excerpt = normalizedText.slice(start, end).trim();
      const confidence = match[0].length > 15 ? 0.9 : 0.75;

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { excerpt, confidence };
      }
    }
  }

  // Check for negative patterns (contradictions)
  if (bestMatch && pattern.negativePatterns) {
    for (const neg of pattern.negativePatterns) {
      if (neg.test(normalizedText)) {
        return {
          factKey: pattern.factKey,
          factValue: bestMatch.excerpt.slice(0, 200),
          factStatus: 'contradicted',
          sourceExcerpt: bestMatch.excerpt,
          confidence: 0.5,
        };
      }
    }
  }

  if (bestMatch) {
    return {
      factKey: pattern.factKey,
      factValue: normalizeFactValue(bestMatch.excerpt),
      factStatus: bestMatch.confidence >= 0.8 ? 'confirmed' : 'inferred',
      sourceExcerpt: bestMatch.excerpt,
      confidence: bestMatch.confidence,
    };
  }

  return {
    factKey: pattern.factKey,
    factValue: `No evidence identified for: ${pattern.label}`,
    factStatus: 'not_found',
    sourceExcerpt: undefined,
    confidence: 0,
  };
}

export function normalizeFactValue(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .trim()
    .slice(0, 500);
}

export function assessFactConfidence(fact: Partial<ExtractedFact>): number {
  if (!fact.factStatus) return 0;
  if (fact.factStatus === 'not_found') return 0;
  if (fact.factStatus === 'contradicted') return 0.3;
  if (fact.factStatus === 'confirmed') return fact.confidence || 0.85;
  if (fact.factStatus === 'inferred') return fact.confidence || 0.6;
  return 0.5;
}

export function extractOSHAFacts(text: string, track: string): ExtractedFact[] {
  const patterns = OSHA_TRACK_PATTERNS[track];
  if (!patterns) return [];
  return patterns.map((p) => searchForFact(text, p));
}

export function extractASHRAEFacts(text: string, track: string): ExtractedFact[] {
  const patterns = ASHRAE_TRACK_PATTERNS[track];
  if (!patterns) return [];
  return patterns.map((p) => searchForFact(text, p));
}

export function extractFacts(
  text: string,
  documentType: string,
  standardTrack: string
): ExtractedFact[] {
  const isOSHA = ['hazcom', 'loto', 'eap', 'respiratory'].includes(standardTrack);
  const isASHRAE = standardTrack.startsWith('ashrae-');

  if (isOSHA) {
    return extractOSHAFacts(text, standardTrack);
  }

  if (isASHRAE) {
    return extractASHRAEFacts(text, standardTrack);
  }

  // Unknown track — try all OSHA patterns as fallback
  const allFacts: ExtractedFact[] = [];
  for (const [, patterns] of Object.entries(OSHA_TRACK_PATTERNS)) {
    allFacts.push(...patterns.map((p) => searchForFact(text, p)));
  }
  return allFacts;
}
