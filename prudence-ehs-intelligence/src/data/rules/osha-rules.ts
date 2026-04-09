/**
 * OSHA Rule Packs Seed Data
 * Deterministic rules for OSHA program review.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 */

export interface SeedRule {
  ruleCode: string;
  topic: string;
  description: string;
  triggerConditions: { field: string; operator: string; value?: string }[];
  requiredEvidence: string[];
  findingTitle: string;
  findingClassification: string;
  defaultSeverity: string;
  citationBundle: string[];
  outputTemplate: string;
  escalationThreshold?: number;
  requiredElements: { elementKey: string; label: string; description: string; isCritical: boolean; sourceReference: string }[];
}

export interface SeedRulePack {
  packId: string;
  name: string;
  topic: string;
  domain: string;
  version: string;
  description: string;
  rules: SeedRule[];
}

export const oshaRulePacks: SeedRulePack[] = [
  // ==========================================
  // OSHA Hazard Communication Rule Pack
  // ==========================================
  {
    packId: 'osha-hazcom',
    name: 'OSHA Hazard Communication',
    topic: 'Hazard Communication',
    domain: 'Occupational Safety',
    version: '1.0.0',
    description: 'Reviews compliance with 29 CFR 1910.1200 Hazard Communication Standard requirements.',
    rules: [
      {
        ruleCode: 'HAZCOM-001',
        topic: 'Written Program',
        description: 'Checks for presence of a written hazard communication program.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['written_program'],
        findingTitle: 'Written Hazard Communication program not identified',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.1200(e)'],
        outputTemplate: 'Based on the materials reviewed, no written hazard communication program was clearly identified. 29 CFR 1910.1200(e)(1) requires employers to develop, implement, and maintain a written hazard communication program at each workplace.',
        requiredElements: [
          { elementKey: 'written_program', label: 'Written HazCom Program', description: 'A written program describing labeling, SDS, and training procedures', isCritical: true, sourceReference: '29 CFR 1910.1200(e)(1)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-002',
        topic: 'Labeling',
        description: 'Checks for a defined container labeling system.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['labeling_system'],
        findingTitle: 'Container labeling system not defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.1200(f)'],
        outputTemplate: 'Based on the materials reviewed, no container labeling system was clearly defined. 29 CFR 1910.1200(f) requires that containers of hazardous chemicals be labeled with product identifier, signal word, hazard statements, pictograms, and precautionary statements.',
        requiredElements: [
          { elementKey: 'labeling_system', label: 'Container Labeling System', description: 'System for labeling chemical containers per GHS requirements', isCritical: true, sourceReference: '29 CFR 1910.1200(f)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-003',
        topic: 'Safety Data Sheets',
        description: 'Checks for SDS access method and availability.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['sds_access'],
        findingTitle: 'SDS access method not clearly defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.1200(g)'],
        outputTemplate: 'Based on the materials reviewed, the method for ensuring employee access to Safety Data Sheets was not clearly defined. 29 CFR 1910.1200(g)(8) requires SDSs to be readily accessible during each work shift.',
        requiredElements: [
          { elementKey: 'sds_access', label: 'SDS Access Method', description: 'Method for employees to access SDSs during work shifts', isCritical: true, sourceReference: '29 CFR 1910.1200(g)(8)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-004',
        topic: 'Employee Training',
        description: 'Checks for employee training program on chemical hazards.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['employee_training'],
        findingTitle: 'Employee training program not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.1200(h)'],
        outputTemplate: 'Based on the materials reviewed, no employee training program for hazardous chemicals was clearly documented. 29 CFR 1910.1200(h)(1) requires employers to provide effective information and training on hazardous chemicals.',
        requiredElements: [
          { elementKey: 'employee_training', label: 'Employee Training Program', description: 'Training on chemical hazards, protective measures, and SDS/label use', isCritical: true, sourceReference: '29 CFR 1910.1200(h)(1)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-005',
        topic: 'Training Timing',
        description: 'Checks for training timing requirements (initial assignment and new hazards).',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['training_timing'],
        findingTitle: 'Training timing requirements not specified',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'moderate',
        citationBundle: ['OSHA-1910.1200(h)'],
        outputTemplate: 'Based on the materials reviewed, the timing of hazard communication training was not clearly specified. 29 CFR 1910.1200(h)(1) requires training at the time of initial assignment and whenever a new chemical hazard is introduced.',
        requiredElements: [
          { elementKey: 'training_timing', label: 'Training Timing', description: 'When training occurs (initial assignment, new hazards)', isCritical: false, sourceReference: '29 CFR 1910.1200(h)(1)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-006',
        topic: 'Non-Routine Tasks',
        description: 'Checks for non-routine task hazard communication.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['nonroutine_task_communication'],
        findingTitle: 'Non-routine task hazard communication not addressed',
        findingClassification: 'best_practice_improvement',
        defaultSeverity: 'moderate',
        citationBundle: ['OSHA-1910.1200(e)'],
        outputTemplate: 'Based on the materials reviewed, procedures for communicating hazards associated with non-routine tasks were not addressed. While not always explicitly required, addressing non-routine task hazards is a best practice that strengthens a hazard communication program.',
        requiredElements: [
          { elementKey: 'nonroutine_task_communication', label: 'Non-Routine Task Communication', description: 'Procedures for hazards during non-routine tasks', isCritical: false, sourceReference: '29 CFR 1910.1200(e)' },
        ],
      },
      {
        ruleCode: 'HAZCOM-007',
        topic: 'Contractor Communication',
        description: 'Checks for multi-employer/contractor hazard communication.',
        triggerConditions: [
          { field: 'document_type', operator: 'contains', value: 'hazcom' },
        ],
        requiredEvidence: ['contractor_communication'],
        findingTitle: 'Multi-employer workplace communication not addressed',
        findingClassification: 'best_practice_improvement',
        defaultSeverity: 'low',
        citationBundle: ['OSHA-1910.1200(e)'],
        outputTemplate: 'Based on the materials reviewed, procedures for communicating chemical hazards to contractors or in multi-employer workplaces were not addressed. 29 CFR 1910.1200(e)(2) requires employers to share hazard information with other employers at multi-employer sites.',
        requiredElements: [
          { elementKey: 'contractor_communication', label: 'Contractor Communication', description: 'Sharing hazard info with contractors/other employers', isCritical: false, sourceReference: '29 CFR 1910.1200(e)(2)' },
        ],
      },
    ],
  },

  // ==========================================
  // OSHA Lockout/Tagout Rule Pack
  // ==========================================
  {
    packId: 'osha-loto',
    name: 'OSHA Lockout/Tagout',
    topic: 'Control of Hazardous Energy',
    domain: 'Occupational Safety',
    version: '1.0.0',
    description: 'Reviews compliance with 29 CFR 1910.147 Control of Hazardous Energy (Lockout/Tagout) requirements.',
    rules: [
      {
        ruleCode: 'LOTO-001',
        topic: 'Program Scope',
        description: 'Checks for defined scope of the LOTO program.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['scope'],
        findingTitle: 'LOTO program scope not defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.147'],
        outputTemplate: 'Based on the materials reviewed, the scope of the lockout/tagout program was not clearly defined. 29 CFR 1910.147 requires a clear scope identifying covered activities, equipment, and employees.',
        requiredElements: [
          { elementKey: 'scope', label: 'Program Scope', description: 'Scope of machines, equipment, and activities covered', isCritical: true, sourceReference: '29 CFR 1910.147(c)(1)' },
        ],
      },
      {
        ruleCode: 'LOTO-002',
        topic: 'Energy Isolation Procedures',
        description: 'Checks for documented energy isolation procedures.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['energy_isolation_procedures'],
        findingTitle: 'Energy isolation procedures not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.147(c)(4)'],
        outputTemplate: 'Based on the materials reviewed, documented energy isolation procedures were not identified. 29 CFR 1910.147(c)(4) requires the employer to develop, document, implement, and enforce energy control procedures.',
        requiredElements: [
          { elementKey: 'energy_isolation_procedures', label: 'Energy Isolation Procedures', description: 'Step-by-step machine-specific lockout procedures', isCritical: true, sourceReference: '29 CFR 1910.147(c)(4)' },
        ],
      },
      {
        ruleCode: 'LOTO-003',
        topic: 'Employee Classification',
        description: 'Checks for authorized vs affected employee distinction.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['authorized_vs_affected'],
        findingTitle: 'Authorized vs affected employee distinction not established',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.147(c)(7)'],
        outputTemplate: 'Based on the materials reviewed, the distinction between authorized and affected employees was not clearly established. 29 CFR 1910.147(c)(7) requires different training for authorized, affected, and other employees.',
        requiredElements: [
          { elementKey: 'authorized_vs_affected', label: 'Employee Classification', description: 'Distinction between authorized and affected employees', isCritical: true, sourceReference: '29 CFR 1910.147(c)(7)(i)' },
        ],
      },
      {
        ruleCode: 'LOTO-004',
        topic: 'Training',
        description: 'Checks for LOTO training program.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['training'],
        findingTitle: 'LOTO training program not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.147(c)(7)'],
        outputTemplate: 'Based on the materials reviewed, a lockout/tagout training program was not clearly documented. 29 CFR 1910.147(c)(7) requires training to ensure employees understand the purpose and function of the energy control program.',
        requiredElements: [
          { elementKey: 'training', label: 'LOTO Training', description: 'Training for authorized, affected, and other employees', isCritical: true, sourceReference: '29 CFR 1910.147(c)(7)' },
        ],
      },
      {
        ruleCode: 'LOTO-005',
        topic: 'Periodic Inspections',
        description: 'Checks for periodic inspection requirements.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['periodic_inspections'],
        findingTitle: 'Periodic inspection requirements not addressed',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.147(c)(6)'],
        outputTemplate: 'Based on the materials reviewed, requirements for periodic inspections of energy control procedures were not addressed. 29 CFR 1910.147(c)(6) requires inspections at least annually.',
        requiredElements: [
          { elementKey: 'periodic_inspections', label: 'Periodic Inspections', description: 'Annual inspection of energy control procedures', isCritical: false, sourceReference: '29 CFR 1910.147(c)(6)' },
        ],
      },
      {
        ruleCode: 'LOTO-006',
        topic: 'Responsibilities',
        description: 'Checks for defined roles and responsibilities.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'loto' }],
        requiredEvidence: ['responsibilities'],
        findingTitle: 'Roles and responsibilities not clearly defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'moderate',
        citationBundle: ['OSHA-1910.147'],
        outputTemplate: 'Based on the materials reviewed, roles and responsibilities for the lockout/tagout program were not clearly defined. Clear assignment of responsibilities is essential for effective energy control.',
        requiredElements: [
          { elementKey: 'responsibilities', label: 'Roles and Responsibilities', description: 'Defined responsibilities for program administration', isCritical: false, sourceReference: '29 CFR 1910.147(c)' },
        ],
      },
    ],
  },

  // ==========================================
  // OSHA Emergency Action Plan Rule Pack
  // ==========================================
  {
    packId: 'osha-eap',
    name: 'OSHA Emergency Action Plan',
    topic: 'Emergency Action Plans',
    domain: 'Occupational Safety',
    version: '1.0.0',
    description: 'Reviews compliance with 29 CFR 1910.38 Emergency Action Plan requirements.',
    rules: [
      {
        ruleCode: 'EAP-001',
        topic: 'Emergency Reporting',
        description: 'Checks for emergency reporting procedures.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'eap' }],
        requiredEvidence: ['emergency_reporting'],
        findingTitle: 'Emergency reporting procedures not defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.38'],
        outputTemplate: 'Based on the materials reviewed, procedures for reporting a fire or other emergency were not clearly defined. 29 CFR 1910.38(c)(1) requires procedures for reporting fires and other emergencies.',
        requiredElements: [
          { elementKey: 'emergency_reporting', label: 'Emergency Reporting', description: 'Procedures for reporting fires and emergencies', isCritical: true, sourceReference: '29 CFR 1910.38(c)(1)' },
        ],
      },
      {
        ruleCode: 'EAP-002',
        topic: 'Evacuation',
        description: 'Checks for evacuation procedures and routes.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'eap' }],
        requiredEvidence: ['evacuation_procedures'],
        findingTitle: 'Evacuation procedures not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.38'],
        outputTemplate: 'Based on the materials reviewed, emergency escape procedures and route assignments were not clearly documented. 29 CFR 1910.38(c)(2) requires emergency escape procedures and route assignments.',
        requiredElements: [
          { elementKey: 'evacuation_procedures', label: 'Evacuation Procedures', description: 'Emergency escape procedures and route assignments', isCritical: true, sourceReference: '29 CFR 1910.38(c)(2)' },
        ],
      },
      {
        ruleCode: 'EAP-003',
        topic: 'Employee Accounting',
        description: 'Checks for post-evacuation employee accounting.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'eap' }],
        requiredEvidence: ['employee_accounting'],
        findingTitle: 'Employee accounting procedures not addressed',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.38'],
        outputTemplate: 'Based on the materials reviewed, procedures for accounting for all employees after evacuation were not addressed. 29 CFR 1910.38(c)(4) requires procedures to account for all employees after evacuation.',
        requiredElements: [
          { elementKey: 'employee_accounting', label: 'Employee Accounting', description: 'Procedures to account for all employees post-evacuation', isCritical: true, sourceReference: '29 CFR 1910.38(c)(4)' },
        ],
      },
      {
        ruleCode: 'EAP-004',
        topic: 'Rescue and Medical',
        description: 'Checks for rescue and medical duty assignments.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'eap' }],
        requiredEvidence: ['rescue_medical_duties'],
        findingTitle: 'Rescue and medical duty assignments not defined',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.38'],
        outputTemplate: 'Based on the materials reviewed, rescue and medical duties for assigned employees were not clearly defined. 29 CFR 1910.38(c)(5) requires designation of employees performing rescue and medical duties.',
        requiredElements: [
          { elementKey: 'rescue_medical_duties', label: 'Rescue and Medical Duties', description: 'Designated employees for rescue and medical duties', isCritical: false, sourceReference: '29 CFR 1910.38(c)(5)' },
        ],
      },
      {
        ruleCode: 'EAP-005',
        topic: 'Contact Persons',
        description: 'Checks for emergency contact persons.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'eap' }],
        requiredEvidence: ['contact_persons'],
        findingTitle: 'Emergency contact persons not identified',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'moderate',
        citationBundle: ['OSHA-1910.38'],
        outputTemplate: 'Based on the materials reviewed, names or job titles of persons to contact for further information about emergency duties were not identified. 29 CFR 1910.38(c)(6) requires this information.',
        requiredElements: [
          { elementKey: 'contact_persons', label: 'Emergency Contacts', description: 'Names or job titles of contact persons', isCritical: false, sourceReference: '29 CFR 1910.38(c)(6)' },
        ],
      },
    ],
  },

  // ==========================================
  // OSHA Respiratory Protection Rule Pack
  // ==========================================
  {
    packId: 'osha-resppro',
    name: 'OSHA Respiratory Protection',
    topic: 'Respiratory Protection',
    domain: 'Occupational Safety',
    version: '1.0.0',
    description: 'Reviews compliance with 29 CFR 1910.134 Respiratory Protection requirements.',
    rules: [
      {
        ruleCode: 'RESPPRO-001',
        topic: 'Hazard Basis',
        description: 'Checks for respiratory hazard assessment basis.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['hazard_basis'],
        findingTitle: 'Respiratory hazard basis not established',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.134', 'OSHA-1910.134(d)'],
        outputTemplate: 'Based on the materials reviewed, the respiratory hazard basis for the program was not clearly established. 29 CFR 1910.134(d) requires selection of respirators based on identified respiratory hazards and exposure assessment.',
        requiredElements: [
          { elementKey: 'hazard_basis', label: 'Hazard Assessment Basis', description: 'Identification of respiratory hazards and exposure levels', isCritical: true, sourceReference: '29 CFR 1910.134(d)(1)' },
        ],
      },
      {
        ruleCode: 'RESPPRO-002',
        topic: 'Respirator Selection',
        description: 'Checks for appropriate respirator selection.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['respirator_selection'],
        findingTitle: 'Respirator selection basis not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.134(d)'],
        outputTemplate: 'Based on the materials reviewed, the basis for respirator selection was not clearly documented. 29 CFR 1910.134(d) requires that respirators be selected based on the respiratory hazards to which workers are exposed.',
        requiredElements: [
          { elementKey: 'respirator_selection', label: 'Respirator Selection', description: 'Selection of appropriate NIOSH-certified respirator', isCritical: true, sourceReference: '29 CFR 1910.134(d)' },
        ],
      },
      {
        ruleCode: 'RESPPRO-003',
        topic: 'Medical Evaluation',
        description: 'Checks for medical evaluation requirements.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['medical_evaluation'],
        findingTitle: 'Medical evaluation requirements not addressed',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.134(e)'],
        outputTemplate: 'Based on the materials reviewed, medical evaluation requirements for respirator users were not addressed. 29 CFR 1910.134(e) requires a medical evaluation before fit testing or workplace respirator use.',
        requiredElements: [
          { elementKey: 'medical_evaluation', label: 'Medical Evaluation', description: 'Medical evaluation by PLHCP before respirator use', isCritical: true, sourceReference: '29 CFR 1910.134(e)' },
        ],
      },
      {
        ruleCode: 'RESPPRO-004',
        topic: 'Fit Testing',
        description: 'Checks for fit testing requirements.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['fit_testing'],
        findingTitle: 'Fit testing requirements not addressed',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'critical',
        citationBundle: ['OSHA-1910.134(f)'],
        outputTemplate: 'Based on the materials reviewed, fit testing requirements were not addressed. 29 CFR 1910.134(f) requires fit testing before initial use and at least annually thereafter.',
        requiredElements: [
          { elementKey: 'fit_testing', label: 'Fit Testing', description: 'Initial and annual fit testing with same make/model/size', isCritical: true, sourceReference: '29 CFR 1910.134(f)' },
        ],
      },
      {
        ruleCode: 'RESPPRO-005',
        topic: 'Training',
        description: 'Checks for respiratory protection training.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['training'],
        findingTitle: 'Respiratory protection training not documented',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'high',
        citationBundle: ['OSHA-1910.134'],
        outputTemplate: 'Based on the materials reviewed, respiratory protection training requirements were not clearly documented. Training must cover respiratory hazards, proper respirator use, limitations, and maintenance.',
        requiredElements: [
          { elementKey: 'training', label: 'Respirator Training', description: 'Training on hazards, use, limitations, and maintenance', isCritical: true, sourceReference: '29 CFR 1910.134(k)' },
        ],
      },
      {
        ruleCode: 'RESPPRO-006',
        topic: 'Maintenance',
        description: 'Checks for cleaning, storage, and maintenance procedures.',
        triggerConditions: [{ field: 'document_type', operator: 'contains', value: 'respiratory' }],
        requiredEvidence: ['cleaning_storage_maintenance'],
        findingTitle: 'Respirator cleaning, storage, and maintenance not addressed',
        findingClassification: 'regulatory_deficiency',
        defaultSeverity: 'moderate',
        citationBundle: ['OSHA-1910.134'],
        outputTemplate: 'Based on the materials reviewed, procedures for respirator cleaning, storage, inspection, and maintenance were not addressed. 29 CFR 1910.134(h) requires these procedures.',
        requiredElements: [
          { elementKey: 'cleaning_storage_maintenance', label: 'Cleaning/Storage/Maintenance', description: 'Procedures for respirator care and maintenance', isCritical: false, sourceReference: '29 CFR 1910.134(h)' },
        ],
      },
    ],
  },
];
