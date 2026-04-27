/**
 * AtmosFlow Building-Type Profiles — v2.4
 * Zone-level field suppression, additional fields, threshold overrides,
 * ACH overrides, and context findings per building type.
 *
 * Every facility type offered in questions.js has a profile here.
 */

export const BUILDING_PROFILES = {
  DATA_CENTER: {
    id: 'data_center',
    label: 'Data Center',
    additionalStandards: ['ANSI/ISA 71.04-2013 (Gaseous Corrosion)', 'ISO 14644-1 (Cleanroom Particle Counts)'],
    zoneSubtypes: [
      { id: 'data_hall', label: 'Data Hall / Server Room' },
      { id: 'noc_office', label: 'NOC / Operations Center' },
      { id: 'battery_room', label: 'Battery Room' },
      { id: 'mechanical', label: 'Mechanical Room' },
      { id: 'office', label: 'Office / Administrative' },
    ],
    suppressFields: {
      data_hall: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
      battery_room: ['tc', 'hp'],
    },
    additionalFields: {
      data_hall: [
        { id: 'gaseous_corrosion', sec: 'Data Center', q: 'ISA-71.04 gaseous corrosion classification?', t: 'ch', ic: '⚗️',
          opts: ['G1 — Mild', 'G2 — Moderate', 'G3 — Harsh', 'GX — Severe', 'Not assessed'],
          ref: 'ANSI/ISA 71.04-2013' },
        { id: 'dp_temp', sec: 'Data Center', q: 'Dew point temperature?', t: 'num', ic: '💧', u: '°F',
          ph: 'e.g. 42', ref: 'ASHRAE TC 9.9: 41.9–59°F recommended' },
        { id: 'iso_class', sec: 'Data Center', q: 'ISO 14644-1 particle count class?', t: 'ch', ic: '🔬',
          opts: ['ISO Class 5', 'ISO Class 6', 'ISO Class 7', 'ISO Class 8', 'Not assessed'],
          ref: 'ISO 14644-1:2015' },
      ],
      battery_room: [
        { id: 'h2_monitoring', sec: 'Battery Room', q: 'Hydrogen monitoring in place?', t: 'ch', ic: '⚠️',
          opts: ['Yes — continuous monitor', 'Yes — periodic checks', 'No', 'Unknown'],
          ref: 'IEEE 1635; NFPA 855' },
        { id: 'h2_ppm', sec: 'Battery Room', q: 'Hydrogen concentration (if measured)?', t: 'num', sk: 1, ic: '⚠️', u: 'ppm',
          ph: 'e.g. 500', ref: 'H₂ LEL = 40,000 ppm (4% vol); IEEE 1635 ceiling = 2% (20,000 ppm)' },
        { id: 'exhaust_cfm_sqft', sec: 'Battery Room', q: 'Exhaust rate?', t: 'num', ic: '💨', u: 'cfm/sq ft',
          ph: 'e.g. 1.0', ref: 'IEEE 1635: minimum 1 cfm/sq ft continuous' },
      ],
    },
    rhOverrides: {
      data_hall: { min: 20, max: 60, label: 'Static control range (ASHRAE TC 9.9)' },
      default: { min: 30, max: 60, label: 'ASHRAE 55 comfort range' },
    },
    tempOverrides: {
      data_hall: { min: 64.4, max: 80.6, oMin: 64.4, oMax: 80.6, label: 'ASHRAE TC 9.9 A1 envelope' },
    },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'noc_office' || z.zone_subtype === 'office',
        text: 'Verify NOC/office zones have dedicated outdoor air, not return from data hall.',
        sev: 'medium', std: 'ASHRAE 62.1' },
      { condition: (z) => z.zone_subtype === 'battery_room',
        text: 'Battery room: verify hydrogen monitoring and ventilation per IEEE 1635/ASHRAE Guideline 21 and NFPA 855. Minimum 1 cfm/sq ft continuous exhaust.',
        sev: 'high', std: 'IEEE 1635; NFPA 855' },
      { condition: (z) => z.zone_subtype === 'battery_room' && z.h2_monitoring === 'No',
        text: 'No hydrogen monitoring installed. NFPA 855 requires continuous gas detection for stationary battery installations. Recommend immediate installation of H₂ detector with alarm at 25% LEL (10,000 ppm).',
        sev: 'critical', std: 'NFPA 855 §11.1.2' },
      { condition: (z) => z.zone_subtype === 'battery_room' && z.exhaust_cfm_sqft && +z.exhaust_cfm_sqft < 1,
        text: 'Battery room exhaust rate below IEEE 1635 minimum of 1 cfm/sq ft continuous. Inadequate ventilation increases hydrogen accumulation risk.',
        sev: 'high', std: 'IEEE 1635 §6.3' },
      { condition: (z) => z.zone_subtype === 'data_hall' && z.gaseous_corrosion && z.gaseous_corrosion.includes('G3'),
        text: 'Visual and olfactory indicators suggest possible sulfur-bearing contamination in the data hall environment. Sources warranting investigation include outdoor air ingress, gas-phase filter media age and condition, and recent process changes in adjacent spaces. Elevated risk of equipment corrosion damage warrants definitive assessment via 30-day reactivity coupon deployment.',
        sev: 'high', std: 'ANSI/ISA 71.04-2013 (screening)' },
      { condition: (z) => z.zone_subtype === 'data_hall' && z.gaseous_corrosion && z.gaseous_corrosion.includes('GX'),
        text: 'Screening indicators suggest severe gaseous contamination risk. Investigate sulfur-bearing sources including outdoor air ingress, gas-phase filtration failure, and adjacent-space process changes. Equipment corrosion damage risk is significant. Definitive classification requires 30-day passive copper+silver reactivity coupon deployment per ANSI/ISA 71.04-2013.',
        sev: 'high', std: 'ANSI/ISA 71.04-2013 (screening)' },
    ],
  },

  HEALTHCARE: {
    id: 'healthcare',
    label: 'Healthcare',
    additionalStandards: ['ASHRAE 170-2021 (Ventilation of Health Care Facilities)'],
    zoneSubtypes: [
      { id: 'exam_room', label: 'Exam Room' },
      { id: 'waiting', label: 'Waiting Area' },
      { id: 'office', label: 'Office' },
      { id: 'procedure', label: 'Procedure Room' },
      { id: 'pharmacy', label: 'Pharmacy' },
      { id: 'lab', label: 'Laboratory' },
      { id: 'patient_room', label: 'Patient Room' },
      { id: 'isolation', label: 'Isolation Room' },
    ],
    suppressFields: {},
    additionalFields: {},
    rhOverrides: {
      default: { min: 30, max: 60, label: 'ASHRAE 55' },
    },
    achOverrides: {
      exam_room: { min: 6, label: 'ASHRAE 170-2021 Table 7-1' },
      procedure: { min: 6, label: 'ASHRAE 170-2021 Table 7-1' },
      waiting: { min: 4, label: 'ASHRAE 170-2021 Table 7-1' },
      pharmacy: { min: 12, label: 'ASHRAE 170-2021 Table 7-1 (ISO Class 7)' },
      lab: { min: 6, label: 'ASHRAE 170-2021 Table 7-1' },
      patient_room: { min: 4, label: 'ASHRAE 170-2021 Table 7-1' },
      isolation: { min: 12, label: 'ASHRAE 170-2021 Table 7-1 (protective environment)' },
      office: { min: 4, label: 'ASHRAE 62.1' },
    },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'pharmacy',
        text: 'Pharmacy compounding areas require minimum 12 ACH per ASHRAE 170-2021. Verify pressure relationship (negative to adjacent spaces for hazardous compounding, positive for non-hazardous).',
        sev: 'medium', std: 'ASHRAE 170-2021' },
      { condition: (z) => z.zone_subtype === 'isolation',
        text: 'Isolation rooms require minimum 12 ACH and continuous negative pressure monitoring per ASHRAE 170-2021. Verify pressure differential ≥0.01" w.g.',
        sev: 'high', std: 'ASHRAE 170-2021' },
      { condition: (z) => z.zone_subtype === 'procedure',
        text: 'Procedure rooms require minimum 6 ACH with positive pressure relative to corridors per ASHRAE 170-2021.',
        sev: 'medium', std: 'ASHRAE 170-2021' },
      { condition: (z) => z.mi && z.mi !== 'None' && z.mi !== 'Suspected discoloration',
        text: 'Visible mold in healthcare facility requires immediate evaluation per ASHRAE 170 and facility infection control risk assessment (ICRA) protocols.',
        sev: 'critical', std: 'ASHRAE 170-2021; Joint Commission' },
    ],
  },

  SCHOOL_K12: {
    id: 'school_k12',
    label: 'School (K-12)',
    additionalStandards: ['EPA IAQ Tools for Schools Action Kit', 'ASHRAE 62.1-2025 (15 cfm/person classrooms)'],
    zoneSubtypes: [
      { id: 'classroom', label: 'Classroom' },
      { id: 'gymnasium', label: 'Gymnasium' },
      { id: 'cafeteria', label: 'Cafeteria' },
      { id: 'office', label: 'Office' },
      { id: 'library', label: 'Library' },
      { id: 'lab', label: 'Science Lab' },
      { id: 'auditorium', label: 'Auditorium' },
      { id: 'nurse', label: "Nurse's Office" },
    ],
    suppressFields: {},
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'classroom',
        text: 'Classroom outdoor air minimum per EPA Tools for Schools: 15 cfm/person. Verify OA damper is open and design OA delivery rate is documented.',
        sev: 'medium', std: 'EPA TfS; ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'classroom' && z.co2 && +z.co2 > 800,
        text: 'CO₂ exceeds 800 ppm in classroom. Per EPA Tools for Schools, elevated CO₂ correlates with reduced cognitive performance and increased absenteeism in students.',
        sev: 'high', std: 'EPA TfS; Petersen et al. 2016' },
      { condition: (z) => z.zone_subtype === 'gymnasium',
        text: 'Large assembly spaces require elevated outdoor air per ASHRAE 62.1 Table 6-1. Confirm HVAC can handle intermittent peak occupancy loads.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'lab',
        text: 'Science labs require minimum 6 ACH with 100% exhaust (no recirculation) when chemical fume hoods are present.',
        sev: 'high', std: 'ASHRAE 62.1-2025; NFPA 45' },
    ],
  },

  COMMERCIAL_OFFICE: {
    id: 'commercial_office',
    label: 'Commercial Office',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'open_office', label: 'Open Office' },
      { id: 'private_office', label: 'Private Office' },
      { id: 'conference', label: 'Conference Room' },
      { id: 'break_room', label: 'Break Room / Kitchen' },
      { id: 'lobby', label: 'Lobby / Reception' },
      { id: 'restroom', label: 'Restroom' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
      restroom: ['tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'conference' && z.co2 && +z.co2 > 1000,
        text: 'Conference room CO₂ elevated during occupancy. Verify dedicated outdoor air supply — conference rooms often lack adequate OA for peak occupancy.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
    ],
  },

  INDUSTRIAL: {
    id: 'industrial',
    label: 'Industrial / Manufacturing',
    additionalStandards: ['OSHA 29 CFR 1910 (General Industry)', 'ACGIH TLVs'],
    zoneSubtypes: [
      { id: 'production', label: 'Production Floor' },
      { id: 'warehouse', label: 'Warehouse / Storage' },
      { id: 'office', label: 'Office' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'loading_dock', label: 'Loading Dock' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      loading_dock: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'production',
        text: 'Production floor IAQ assessment should include process-specific contaminant evaluation. Verify LEV (local exhaust ventilation) is operational at all emission sources.',
        sev: 'medium', std: 'OSHA 29 CFR 1910.1000' },
      { condition: (z) => z.zone_subtype === 'loading_dock',
        text: 'Loading dock: evaluate diesel exhaust exposure during delivery operations. Ensure dock doors close when not in active use to prevent exhaust migration to occupied spaces.',
        sev: 'medium', std: 'OSHA diesel particulate guidance' },
    ],
  },

  RETAIL: {
    id: 'retail',
    label: 'Retail',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'sales_floor', label: 'Sales Floor' },
      { id: 'stockroom', label: 'Stockroom' },
      { id: 'office', label: 'Office' },
      { id: 'break_room', label: 'Break Room' },
    ],
    suppressFields: {},
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'sales_floor' && z.co2 && +z.co2 > 1000,
        text: 'Sales floor CO₂ elevated. Retail spaces with variable occupancy may require demand-controlled ventilation (DCV) per ASHRAE 62.1.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
    ],
  },

  GOVERNMENT: {
    id: 'government',
    label: 'Government',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'open_office', label: 'Open Office' },
      { id: 'private_office', label: 'Private Office' },
      { id: 'conference', label: 'Conference Room' },
      { id: 'public_area', label: 'Public Area / Lobby' },
      { id: 'courtroom', label: 'Courtroom / Hearing Room' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'courtroom' && z.co2 && +z.co2 > 1000,
        text: 'Courtroom/hearing room CO₂ elevated during occupancy. High-density assembly spaces require elevated OA delivery per ASHRAE 62.1 Table 6-1.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
    ],
  },

  LABORATORY: {
    id: 'laboratory',
    label: 'Laboratory',
    additionalStandards: ['ANSI/AIHA Z9.5 (Laboratory Ventilation)', 'NFPA 45 (Fire Protection for Labs)'],
    zoneSubtypes: [
      { id: 'wet_lab', label: 'Wet Lab / Chemistry' },
      { id: 'dry_lab', label: 'Dry Lab / Analytical' },
      { id: 'bio_lab', label: 'Biological Lab' },
      { id: 'office', label: 'Office / Write-Up' },
      { id: 'storage', label: 'Chemical Storage' },
      { id: 'corridor', label: 'Corridor / Support' },
    ],
    suppressFields: {
      storage: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    achOverrides: {
      wet_lab: { min: 8, label: 'ANSI/AIHA Z9.5' },
      dry_lab: { min: 6, label: 'ANSI/AIHA Z9.5' },
      bio_lab: { min: 6, label: 'ANSI/AIHA Z9.5; CDC/NIH BMBL' },
      storage: { min: 6, label: 'NFPA 45' },
    },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'wet_lab',
        text: 'Wet laboratory: verify fume hood face velocity 80-120 fpm per ANSI/AIHA Z9.5. All hoods should be operational during occupied hours. 100% exhaust (no recirculation).',
        sev: 'high', std: 'ANSI/AIHA Z9.5' },
      { condition: (z) => z.zone_subtype === 'bio_lab',
        text: 'Biological laboratory: verify directional airflow from clean to less clean areas. BSCs must be certified annually per NSF 49.',
        sev: 'high', std: 'CDC/NIH BMBL; NSF 49' },
      { condition: (z) => z.zone_subtype === 'storage',
        text: 'Chemical storage room: verify continuous exhaust ventilation minimum 6 ACH per NFPA 45. Incompatible chemicals must be stored in separate ventilated cabinets.',
        sev: 'high', std: 'NFPA 45' },
    ],
  },

  WAREHOUSE: {
    id: 'warehouse',
    label: 'Warehouse',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'main_floor', label: 'Main Warehouse Floor' },
      { id: 'office', label: 'Office' },
      { id: 'loading_dock', label: 'Loading Dock' },
      { id: 'break_room', label: 'Break Room' },
      { id: 'cold_storage', label: 'Cold Storage' },
    ],
    suppressFields: {
      loading_dock: ['tc', 'hp'],
      cold_storage: ['tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'loading_dock',
        text: 'Loading dock: evaluate diesel/vehicle exhaust exposure during operations. Ensure adequate separation between dock area and occupied office spaces.',
        sev: 'medium', std: 'OSHA diesel particulate guidance' },
      { condition: (z) => z.zone_subtype === 'main_floor' && z.co && +z.co > 5,
        text: 'Elevated CO on warehouse floor suggests vehicle exhaust accumulation (forklifts, delivery trucks). Evaluate ventilation adequacy and consider propane/electric equipment alternatives.',
        sev: 'high', std: 'OSHA 29 CFR 1910.1000' },
    ],
  },

  MIXED_USE: {
    id: 'mixed_use',
    label: 'Mixed Use',
    additionalStandards: [],
    zoneSubtypes: [
      { id: 'office', label: 'Office' },
      { id: 'retail', label: 'Retail' },
      { id: 'residential', label: 'Residential' },
      { id: 'restaurant', label: 'Restaurant / Food Service' },
      { id: 'common_area', label: 'Common Area / Lobby' },
      { id: 'parking', label: 'Parking Garage' },
      { id: 'mechanical', label: 'Mechanical Room' },
    ],
    suppressFields: {
      parking: ['tc', 'hp'],
      mechanical: ['cx', 'ac', 'sy', 'sr', 'cc', 'tc', 'hp'],
    },
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'restaurant',
        text: 'Restaurant/food service: verify kitchen exhaust hood operation and makeup air balance. Cross-contamination of cooking odors to adjacent spaces indicates makeup air deficiency.',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'parking',
        text: 'Parking garage: evaluate CO accumulation during peak vehicle traffic. Verify ventilation meets ASHRAE 62.1 requirements for enclosed parking (0.75 cfm/sq ft).',
        sev: 'medium', std: 'ASHRAE 62.1-2025' },
      { condition: (z) => z.zone_subtype === 'parking' && z.co && +z.co > 25,
        text: 'CO exceeds 25 ppm in parking garage. ASHRAE 62.1 recommends maintaining CO below 25 ppm in enclosed parking. Evaluate ventilation fan operation and controls.',
        sev: 'high', std: 'ASHRAE 62.1-2025' },
    ],
  },
}

export function getBuildingProfile(buildingType) {
  const n = (buildingType || '').toLowerCase().replace(/[\s\/]/g, '_')
  if (n.includes('data') && n.includes('center')) return BUILDING_PROFILES.DATA_CENTER
  if (n.includes('healthcare') || n.includes('hospital') || n.includes('clinic')) return BUILDING_PROFILES.HEALTHCARE
  if (n.includes('school') || n.includes('education') || n.includes('university')) return BUILDING_PROFILES.SCHOOL_K12
  if (n.includes('office') && !n.includes('mixed')) return BUILDING_PROFILES.COMMERCIAL_OFFICE
  if (n.includes('industrial') || n.includes('manufacturing')) return BUILDING_PROFILES.INDUSTRIAL
  if (n.includes('retail')) return BUILDING_PROFILES.RETAIL
  if (n.includes('government')) return BUILDING_PROFILES.GOVERNMENT
  if (n.includes('lab')) return BUILDING_PROFILES.LABORATORY
  if (n.includes('warehouse')) return BUILDING_PROFILES.WAREHOUSE
  if (n.includes('mixed')) return BUILDING_PROFILES.MIXED_USE
  return null
}

export function getSuppressedFields(profile, zoneSubtype) {
  if (!profile?.suppressFields) return []
  return profile.suppressFields[zoneSubtype] || []
}

export function getAdditionalFields(profile, zoneSubtype) {
  if (!profile?.additionalFields) return []
  return profile.additionalFields[zoneSubtype] || []
}

export function getProfileContextFindings(profile, zoneData) {
  if (!profile?.contextFindings) return []
  return profile.contextFindings
    .filter(cf => cf.condition(zoneData))
    .map(cf => ({ t: cf.text, sev: cf.sev, std: cf.std || '' }))
}

export function getRHOverride(profile, zoneSubtype) {
  if (!profile?.rhOverrides) return null
  return profile.rhOverrides[zoneSubtype] || profile.rhOverrides.default || null
}

export function getTempOverride(profile, zoneSubtype) {
  if (!profile?.tempOverrides) return null
  return profile.tempOverrides[zoneSubtype] || profile.tempOverrides.default || null
}

export function getACHOverride(profile, zoneSubtype) {
  if (!profile?.achOverrides) return null
  return profile.achOverrides[zoneSubtype] || null
}
