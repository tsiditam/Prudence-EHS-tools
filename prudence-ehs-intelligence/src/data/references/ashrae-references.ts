/**
 * ASHRAE Reference Seed Data
 * Consensus standard references for IAQ and ventilation review.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 */

import type { SeedReference } from './osha-references';

export const ashraeReferences: SeedReference[] = [
  // --- ASHRAE 62.1 ---
  {
    referenceId: 'ASHRAE-62.1',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'ASHRAE Standard 62.1 specifies minimum ventilation rates and other measures intended to provide indoor air quality that is acceptable to human occupants and that minimizes adverse health effects.',
    title: 'Ventilation for Acceptable Indoor Air Quality',
    sectionNumber: 'ASHRAE 62.1-2022',
    effectiveDate: '2022-10-29',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2',
    plainLanguageSummary:
      'This standard sets minimum ventilation requirements for commercial and institutional buildings to maintain acceptable indoor air quality.',
    applicabilityTags: ['ventilation', 'IAQ', 'nonresidential', 'commercial', 'office', 'school', 'institutional'],
    triggerTags: ['ventilation_basis', 'outdoor_air', 'iaq_review'],
    requiredElements: {
      ventilation_rate_procedure: 'Ventilation Rate Procedure (Section 6.2)',
      iaq_procedure: 'IAQ Procedure (Section 6.3)',
      outdoor_air_treatment: 'Outdoor Air Treatment (Section 6.2.1)',
      zone_calculations: 'Zone Outdoor Airflow (Table 6.2.2.1)',
    },
    exceptions: ['Single-family residential', 'Spaces with unusual contaminant sources requiring industrial ventilation'],
    crossReferences: ['ASHRAE 62.2', 'ASHRAE 170', 'IMC Chapter 4'],
    enforceabilityLevel: 'consensus_standard',
  },
  {
    referenceId: 'ASHRAE-62.1-S6',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'Ventilation systems shall be designed using either the Ventilation Rate Procedure or the IAQ Procedure to determine the minimum outdoor airflow rates.',
    title: 'ASHRAE 62.1 Section 6 - Procedures',
    sectionNumber: 'ASHRAE 62.1-2022, Section 6',
    effectiveDate: '2022-10-29',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2',
    plainLanguageSummary:
      'Buildings must use one of two ASHRAE procedures to calculate the minimum amount of outdoor air needed for ventilation.',
    applicabilityTags: ['ventilation_rate', 'outdoor_air', 'design'],
    triggerTags: ['ventilation_basis', 'outdoor_air_method'],
    requiredElements: {
      procedure_selection: 'Selection of ventilation rate or IAQ procedure',
      outdoor_air_rate: 'Calculated minimum outdoor air rate',
      space_type: 'Identification of space occupancy category',
    },
    exceptions: [],
    crossReferences: ['Table 6.2.2.1'],
    enforceabilityLevel: 'consensus_standard',
  },
  {
    referenceId: 'ASHRAE-62.1-S5',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'Systems and equipment shall be maintained in accordance with Section 5, including regular inspection and maintenance of ventilation system components.',
    title: 'ASHRAE 62.1 Section 5 - Systems and Equipment',
    sectionNumber: 'ASHRAE 62.1-2022, Section 5',
    effectiveDate: '2022-10-29',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2',
    plainLanguageSummary:
      'Ventilation systems must be properly maintained including regular filter changes, cleaning, and inspection of all components.',
    applicabilityTags: ['maintenance', 'O&M', 'ventilation_system'],
    triggerTags: ['om_responsibilities', 'filtration_basis'],
    requiredElements: {
      maintenance_program: 'Documented maintenance program',
      filter_maintenance: 'Filter inspection and replacement schedule',
      outdoor_air_verification: 'Periodic verification of outdoor air delivery',
    },
    exceptions: [],
    crossReferences: ['ASHRAE 62.1 Section 8'],
    enforceabilityLevel: 'consensus_standard',
  },

  // --- ASHRAE 62.2 ---
  {
    referenceId: 'ASHRAE-62.2',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'This standard defines the roles of and minimum requirements for mechanical and natural ventilation systems and the building envelope intended to provide acceptable indoor air quality in low-rise residential buildings.',
    title: 'Ventilation and Acceptable Indoor Air Quality in Residential Buildings',
    sectionNumber: 'ASHRAE 62.2-2022',
    effectiveDate: '2022-10-29',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/standards-62-1-62-2',
    plainLanguageSummary:
      'This standard sets ventilation requirements for homes and apartments to ensure good indoor air quality for residents.',
    applicabilityTags: ['residential', 'ventilation', 'dwelling', 'apartment', 'IAQ'],
    triggerTags: ['whole_dwelling_ventilation', 'residential_iaq'],
    requiredElements: {
      whole_building_ventilation: 'Whole-building mechanical ventilation',
      local_exhaust: 'Local exhaust for kitchens and bathrooms',
      source_control: 'Source control measures',
    },
    exceptions: ['Transient housing less than 30 days', 'Nursing facilities'],
    crossReferences: ['ASHRAE 62.1', 'IRC M1505'],
    enforceabilityLevel: 'consensus_standard',
  },

  // --- ASHRAE 55 ---
  {
    referenceId: 'ASHRAE-55',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'This standard specifies conditions for acceptable thermal environments and is intended for use in design, commissioning, and testing of buildings and other occupied spaces.',
    title: 'Thermal Environmental Conditions for Human Occupancy',
    sectionNumber: 'ASHRAE 55-2023',
    effectiveDate: '2023-01-01',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/standard-55-702',
    plainLanguageSummary:
      'This standard defines acceptable temperature, humidity, and air movement conditions for occupied spaces to ensure thermal comfort.',
    applicabilityTags: ['thermal_comfort', 'temperature', 'humidity', 'comfort'],
    triggerTags: ['temperature_criteria', 'humidity_criteria', 'thermal_comfort'],
    requiredElements: {
      operative_temperature: 'Operative temperature range for comfort zone',
      humidity_ratio: 'Humidity ratio limits',
      air_speed: 'Air speed considerations',
      metabolic_rate: 'Assumed metabolic rate for occupant activity',
      clothing_insulation: 'Assumed clothing insulation',
    },
    exceptions: ['Vehicles', 'Sleeping occupants (may use different criteria)', 'Outdoor spaces'],
    crossReferences: ['ASHRAE 62.1', 'ISO 7730'],
    enforceabilityLevel: 'consensus_standard',
  },

  // --- ASHRAE 241 ---
  {
    referenceId: 'ASHRAE-241',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'This standard establishes minimum requirements to reduce the risk of disease transmission through exposure to infectious aerosols in new buildings, existing buildings, and major renovations.',
    title: 'Control of Infectious Aerosols',
    sectionNumber: 'ASHRAE 241-2023',
    effectiveDate: '2023-06-21',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/ashrae-standard-241',
    plainLanguageSummary:
      'This standard sets requirements for buildings to control airborne disease transmission, including ventilation, filtration, and air cleaning strategies.',
    applicabilityTags: ['infection_control', 'aerosol', 'pandemic', 'air_cleaning', 'UVGI'],
    triggerTags: ['infection_control_objective', 'equivalent_clean_airflow', 'infectious_aerosol'],
    requiredElements: {
      infection_risk_management: 'Building Readiness Plan (Section 5)',
      eca_targets: 'Equivalent Clean Air (ECA) targets per zone',
      air_cleaning: 'Air cleaning device selection and safety',
      commissioning: 'Verification of ECA delivery',
      activation_protocol: 'Infection-Risk Management Mode activation criteria',
    },
    exceptions: ['Single-family detached homes', 'Healthcare facilities covered by ASHRAE 170'],
    crossReferences: ['ASHRAE 62.1', 'ASHRAE 170', 'CDC guidelines'],
    enforceabilityLevel: 'consensus_standard',
  },
  {
    referenceId: 'ASHRAE-241-S6',
    authorityName: 'ASHRAE',
    authorityType: 'consensus_standard',
    domain: 'Indoor Air Quality',
    jurisdiction: 'National',
    citationText:
      'When Infection-Risk Management Mode is activated, the building or space shall be provided with the equivalent clean airflow rate determined in accordance with this section.',
    title: 'ASHRAE 241 Section 6 - Equivalent Clean Airflow',
    sectionNumber: 'ASHRAE 241-2023, Section 6',
    effectiveDate: '2023-06-21',
    status: 'active',
    officialSourceUrl: 'https://www.ashrae.org/technical-resources/bookstore/ashrae-standard-241',
    plainLanguageSummary:
      'Buildings must be able to deliver a target amount of clean air (through ventilation, filtration, or air cleaning) when disease risk is elevated.',
    applicabilityTags: ['ECA', 'equivalent_clean_airflow', 'infection_control'],
    triggerTags: ['equivalent_clean_airflow', 'eca_strategy'],
    requiredElements: {
      eca_calculation: 'Equivalent clean airflow calculation per zone',
      delivery_methods: 'Combination of outdoor air, filtration, and air cleaning',
      verification: 'Verification that ECA target is achievable',
    },
    exceptions: [],
    crossReferences: ['ASHRAE 241 Table 6.2.1.1'],
    enforceabilityLevel: 'consensus_standard',
  },
];
