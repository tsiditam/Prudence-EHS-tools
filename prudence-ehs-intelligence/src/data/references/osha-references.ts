/**
 * OSHA Reference Seed Data
 * Real OSHA CFR citations for EHS program review.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 */

export interface SeedReference {
  referenceId: string;
  authorityName: string;
  authorityType: 'regulatory' | 'consensus_standard' | 'guidance' | 'internal_memo';
  domain: string;
  jurisdiction: string;
  citationText: string;
  title: string;
  sectionNumber: string;
  effectiveDate: string;
  status: 'active' | 'superseded' | 'draft';
  officialSourceUrl: string;
  plainLanguageSummary: string;
  applicabilityTags: string[];
  triggerTags: string[];
  requiredElements: Record<string, string>;
  exceptions: string[];
  crossReferences: string[];
  enforceabilityLevel: string;
}

export const oshaReferences: SeedReference[] = [
  // --- Hazard Communication (1910.1200) ---
  {
    referenceId: 'OSHA-1910.1200',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The purpose of this section is to ensure that the hazards of all chemicals produced or imported are classified, and that information concerning the classified hazards is transmitted to employers and employees.',
    title: 'Hazard Communication',
    sectionNumber: '29 CFR 1910.1200',
    effectiveDate: '2012-03-26',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200',
    plainLanguageSummary:
      'Employers must have a program to inform workers about chemical hazards in the workplace, including labels, safety data sheets, and training.',
    applicabilityTags: ['chemical', 'hazcom', 'manufacturing', 'construction', 'general_industry'],
    triggerTags: ['hazardous_chemical', 'chemical_exposure', 'hazcom_program'],
    requiredElements: {
      written_program: 'Written hazard communication program',
      labeling: 'Container labeling system',
      sds: 'Safety data sheet access',
      training: 'Employee information and training',
    },
    exceptions: [
      'Hazardous waste subject to RCRA regulations',
      'Tobacco products',
      'Wood or wood products not processed',
      'Articles as defined in the standard',
    ],
    crossReferences: ['29 CFR 1910.1200(e)', '29 CFR 1910.1200(f)', '29 CFR 1910.1200(g)', '29 CFR 1910.1200(h)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.1200(e)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'Employers shall develop, implement, and maintain at each workplace, a written hazard communication program which at least describes how the criteria specified in paragraphs (f), (g), and (h) of this section for labels and other forms of warning, safety data sheets, and employee information and training will be met.',
    title: 'Written Hazard Communication Program',
    sectionNumber: '29 CFR 1910.1200(e)(1)',
    effectiveDate: '2012-03-26',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200',
    plainLanguageSummary:
      'Every workplace with hazardous chemicals must have a written plan describing how they will handle labels, SDSs, and employee training.',
    applicabilityTags: ['written_program', 'hazcom'],
    triggerTags: ['written_program', 'hazcom_program'],
    requiredElements: {
      list_of_chemicals: 'List of known hazardous chemicals',
      labeling_methods: 'Methods for labeling containers',
      sds_maintenance: 'Methods for maintaining SDSs',
      training_program: 'Description of training program',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.1200(f)', '29 CFR 1910.1200(g)', '29 CFR 1910.1200(h)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.1200(f)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The chemical manufacturer, importer, or distributor shall ensure that each container of hazardous chemicals leaving the workplace is labeled, tagged, or marked with the product identifier, signal word, hazard statement(s), pictogram(s), precautionary statement(s), and name, address and telephone number of the responsible party.',
    title: 'Labels and Other Forms of Warning',
    sectionNumber: '29 CFR 1910.1200(f)',
    effectiveDate: '2012-03-26',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200',
    plainLanguageSummary:
      'All containers of hazardous chemicals must have proper GHS-aligned labels with hazard information, pictograms, and precautionary statements.',
    applicabilityTags: ['labeling', 'GHS', 'container'],
    triggerTags: ['labeling_system', 'container_labels'],
    requiredElements: {
      product_identifier: 'Product identifier on label',
      signal_word: 'Signal word (Danger or Warning)',
      hazard_statements: 'Hazard statement(s)',
      pictograms: 'GHS pictogram(s)',
      precautionary_statements: 'Precautionary statement(s)',
      responsible_party: 'Name and contact of responsible party',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.1200(f)(1)', '29 CFR 1910.1200(f)(6)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.1200(g)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'Employers shall maintain in the workplace copies of the required safety data sheets for each hazardous chemical, and shall ensure that they are readily accessible during each work shift to employees when they are in their work area(s).',
    title: 'Safety Data Sheets',
    sectionNumber: '29 CFR 1910.1200(g)(8)',
    effectiveDate: '2012-03-26',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200',
    plainLanguageSummary:
      'Employers must keep SDSs for every hazardous chemical on site and make sure employees can access them at any time during their shift.',
    applicabilityTags: ['sds', 'safety_data_sheets'],
    triggerTags: ['sds_access', 'sds_maintenance'],
    requiredElements: {
      sds_availability: 'SDSs readily accessible during each work shift',
      sds_location: 'Known location for SDS access',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.1200(g)(1)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.1200(h)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'Employers shall provide employees with effective information and training on hazardous chemicals in their work area at the time of their initial assignment, and whenever a new chemical hazard the employees have not previously been trained about is introduced into their work area.',
    title: 'Employee Information and Training',
    sectionNumber: '29 CFR 1910.1200(h)(1)',
    effectiveDate: '2012-03-26',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.1200',
    plainLanguageSummary:
      'Workers must receive training about chemical hazards when they start their job and whenever a new chemical hazard is introduced.',
    applicabilityTags: ['training', 'hazcom'],
    triggerTags: ['employee_training', 'training_timing'],
    requiredElements: {
      initial_training: 'Training at initial assignment',
      new_hazard_training: 'Training when new chemical hazard introduced',
      training_content: 'Requirements of the HazCom standard, chemical locations, SDS access, protective measures',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.1200(h)(2)', '29 CFR 1910.1200(h)(3)'],
    enforceabilityLevel: 'mandatory',
  },

  // --- Lockout/Tagout (1910.147) ---
  {
    referenceId: 'OSHA-1910.147',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'This standard covers the servicing and maintenance of machines and equipment in which the unexpected energization or start up of the machines or equipment, or release of stored energy could cause injury to employees.',
    title: 'The Control of Hazardous Energy (Lockout/Tagout)',
    sectionNumber: '29 CFR 1910.147',
    effectiveDate: '1990-01-02',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147',
    plainLanguageSummary:
      'Employers must establish procedures to disable machinery during maintenance to prevent unexpected startup that could injure workers.',
    applicabilityTags: ['lockout', 'tagout', 'LOTO', 'energy_control', 'maintenance'],
    triggerTags: ['energy_isolation', 'lockout_tagout', 'machine_maintenance'],
    requiredElements: {
      energy_control_program: 'Energy control program',
      energy_control_procedures: 'Machine-specific energy control procedures',
      training: 'Employee training',
      periodic_inspection: 'Periodic inspection of procedures',
    },
    exceptions: [
      'Construction and agriculture',
      'Oil and gas well drilling and servicing',
      'Installations under exclusive control of electric utilities',
    ],
    crossReferences: ['29 CFR 1910.147(c)', '29 CFR 1910.147(d)', '29 CFR 1910.147(e)', '29 CFR 1910.147(f)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.147(c)(4)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall develop, document, implement, and enforce energy control procedures.',
    title: 'Energy Control Procedures',
    sectionNumber: '29 CFR 1910.147(c)(4)',
    effectiveDate: '1990-01-02',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147',
    plainLanguageSummary:
      'Written step-by-step procedures must exist for controlling hazardous energy on each machine or piece of equipment.',
    applicabilityTags: ['energy_control_procedures', 'lockout'],
    triggerTags: ['energy_isolation_procedures'],
    requiredElements: {
      scope: 'Intended use of the procedure',
      steps_for_shutdown: 'Specific procedural steps for shutting down',
      steps_for_isolation: 'Steps for isolating energy',
      lockout_application: 'Application of lockout/tagout devices',
      verification: 'Verification of isolation (stored energy release)',
      release_from_lockout: 'Steps for release from lockout/tagout',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.147(c)(4)(i)', '29 CFR 1910.147(c)(4)(ii)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.147(c)(7)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall provide training to ensure that the purpose and function of the energy control program are understood by employees and that the knowledge and skills required for the safe application, usage, and removal of the energy controls are acquired by employees.',
    title: 'LOTO Training and Communication',
    sectionNumber: '29 CFR 1910.147(c)(7)',
    effectiveDate: '1990-01-02',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147',
    plainLanguageSummary:
      'All employees involved in or affected by lockout/tagout procedures must be trained on the energy control program.',
    applicabilityTags: ['training', 'lockout'],
    triggerTags: ['loto_training', 'authorized_affected'],
    requiredElements: {
      authorized_training: 'Training for authorized employees on energy control procedures',
      affected_training: 'Training for affected employees on purpose and use of procedures',
      other_training: 'Instruction for other employees on prohibition of restarting',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.147(c)(7)(i)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.147(c)(6)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall conduct a periodic inspection of the energy control procedure at least annually to ensure that the procedure and the requirements of this standard are being followed.',
    title: 'Periodic Inspection of LOTO Procedures',
    sectionNumber: '29 CFR 1910.147(c)(6)',
    effectiveDate: '1990-01-02',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.147',
    plainLanguageSummary:
      'At least once per year, the employer must inspect lockout/tagout procedures to make sure they are being properly followed.',
    applicabilityTags: ['periodic_inspection', 'lockout'],
    triggerTags: ['periodic_inspections', 'loto_audit'],
    requiredElements: {
      annual_inspection: 'Inspection performed at least annually',
      authorized_inspector: 'Performed by authorized employee other than one using the procedure',
      documentation: 'Certification of inspection including date, employees, and equipment',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.147(c)(6)(i)', '29 CFR 1910.147(c)(6)(ii)'],
    enforceabilityLevel: 'mandatory',
  },

  // --- Emergency Action Plan (1910.38) ---
  {
    referenceId: 'OSHA-1910.38',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'An emergency action plan must be in writing, kept in the workplace, and available to employees for review.',
    title: 'Emergency Action Plans',
    sectionNumber: '29 CFR 1910.38',
    effectiveDate: '2002-11-07',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.38',
    plainLanguageSummary:
      'Workplaces must have a written emergency action plan that covers evacuation, reporting, and employee responsibilities during emergencies.',
    applicabilityTags: ['emergency', 'evacuation', 'fire', 'EAP'],
    triggerTags: ['emergency_action_plan', 'evacuation'],
    requiredElements: {
      reporting: 'Procedures for reporting fires or emergencies',
      evacuation: 'Emergency escape procedures and route assignments',
      critical_operations: 'Procedures for employees performing critical operations before evacuating',
      accounting: 'Procedures to account for all employees after evacuation',
      rescue_medical: 'Rescue and medical duties for assigned employees',
      contact_persons: 'Names or job titles of persons to contact',
    },
    exceptions: ['Employers with 10 or fewer employees may communicate the plan orally'],
    crossReferences: ['29 CFR 1910.38(c)', '29 CFR 1910.39'],
    enforceabilityLevel: 'mandatory',
  },

  // --- Respiratory Protection (1910.134) ---
  {
    referenceId: 'OSHA-1910.134',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall develop and implement a written respiratory protection program with required worksite-specific procedures and elements for required respirator use.',
    title: 'Respiratory Protection',
    sectionNumber: '29 CFR 1910.134',
    effectiveDate: '1998-04-08',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134',
    plainLanguageSummary:
      'When respirators are required, employers must have a comprehensive written program including selection, fit testing, medical evaluation, training, and maintenance.',
    applicabilityTags: ['respiratory', 'PPE', 'airborne_hazard'],
    triggerTags: ['respirator', 'respiratory_protection', 'airborne_exposure'],
    requiredElements: {
      written_program: 'Written respiratory protection program',
      hazard_evaluation: 'Procedures for selecting respirators',
      medical_evaluation: 'Medical evaluations of employees',
      fit_testing: 'Fit testing procedures',
      use_procedures: 'Procedures for proper use in routine and emergency situations',
      maintenance: 'Procedures for cleaning, disinfecting, storing, inspecting, repairing, discarding, and maintaining',
      training: 'Training of employees in respiratory hazards and proper use',
      program_evaluation: 'Procedures for regularly evaluating effectiveness',
    },
    exceptions: ['Voluntary use with filtering facepiece (dust mask) only requires Appendix D'],
    crossReferences: ['29 CFR 1910.134(c)', '29 CFR 1910.134(d)', '29 CFR 1910.134(e)', '29 CFR 1910.134(f)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.134(d)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall select and provide an appropriate respirator based on the respiratory hazard(s) to which the worker is exposed and workplace and user factors that affect respirator performance and reliability.',
    title: 'Selection of Respirators',
    sectionNumber: '29 CFR 1910.134(d)',
    effectiveDate: '1998-04-08',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134',
    plainLanguageSummary:
      'Respirators must be chosen based on the specific hazards present, considering the type and amount of exposure.',
    applicabilityTags: ['respirator_selection'],
    triggerTags: ['respirator_selection', 'hazard_basis'],
    requiredElements: {
      hazard_identification: 'Identification of respiratory hazard',
      exposure_assessment: 'Assessment of worker exposure levels',
      niosh_certified: 'Selection of NIOSH-certified respirator',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.134(d)(1)', '29 CFR 1910.134(d)(3)'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.134(e)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'The employer shall provide a medical evaluation to determine the employee\'s ability to use a respirator, before the employee is fit tested or required to use the respirator in the workplace.',
    title: 'Medical Evaluation',
    sectionNumber: '29 CFR 1910.134(e)',
    effectiveDate: '1998-04-08',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134',
    plainLanguageSummary:
      'Before using a respirator, employees must be medically evaluated to confirm they can safely wear one.',
    applicabilityTags: ['medical_evaluation', 'respiratory'],
    triggerTags: ['medical_evaluation', 'PLHCP'],
    requiredElements: {
      medical_questionnaire: 'OSHA medical questionnaire (Appendix C) or equivalent',
      plhcp_review: 'Review by physician or licensed health care professional',
      follow_up: 'Follow-up medical examination if needed',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.134(e)(1)', 'Appendix C'],
    enforceabilityLevel: 'mandatory',
  },
  {
    referenceId: 'OSHA-1910.134(f)',
    authorityName: 'OSHA',
    authorityType: 'regulatory',
    domain: 'Occupational Safety',
    jurisdiction: 'Federal',
    citationText:
      'Before an employee may be required to use any respirator with a negative or positive pressure tight-fitting facepiece, the employee must be fit tested with the same make, model, style, and size of respirator that will be used.',
    title: 'Fit Testing',
    sectionNumber: '29 CFR 1910.134(f)',
    effectiveDate: '1998-04-08',
    status: 'active',
    officialSourceUrl:
      'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.134',
    plainLanguageSummary:
      'Employees must pass a fit test with the exact respirator they will use. Fit tests must be repeated annually.',
    applicabilityTags: ['fit_testing', 'respiratory'],
    triggerTags: ['fit_testing'],
    requiredElements: {
      initial_fit_test: 'Fit test before initial use',
      annual_retest: 'Fit test at least annually thereafter',
      same_model: 'Test with same make, model, style, and size',
      accepted_protocols: 'Qualitative or quantitative fit test protocol',
    },
    exceptions: [],
    crossReferences: ['29 CFR 1910.134(f)(1)', '29 CFR 1910.134(f)(2)', 'Appendix A'],
    enforceabilityLevel: 'mandatory',
  },
];
