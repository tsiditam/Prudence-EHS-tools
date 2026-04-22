/**
 * AtmosFlow Building-Type Profiles — v2.3
 * Zone-level field suppression, additional fields, and threshold overrides.
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
          ref: 'NFPA 1' },
        { id: 'exhaust_cfm_sqft', sec: 'Battery Room', q: 'Exhaust rate?', t: 'num', ic: '💨', u: 'cfm/sq ft',
          ph: 'e.g. 1.0', ref: 'NFPA 1: minimum 1 cfm/sq ft continuous' },
      ],
    },
    rhOverrides: {
      data_hall: { min: 20, max: 60, label: 'Static control range (ASHRAE TC 9.9)' },
      default: { min: 30, max: 60, label: 'ASHRAE 55 comfort range' },
    },
    contextFindings: [
      { condition: (z) => z.zone_subtype === 'noc_office' || z.zone_subtype === 'office',
        text: 'Verify NOC/office zones have dedicated outdoor air, not return from data hall.',
        sev: 'medium', std: 'ASHRAE 62.1' },
      { condition: (z) => z.zone_subtype === 'battery_room',
        text: 'Battery room: verify hydrogen monitoring and ventilation per NFPA 1. Minimum 1 cfm/sq ft continuous exhaust.',
        sev: 'high', std: 'NFPA 1' },
      { condition: (z) => z.zone_subtype === 'data_hall' && z.gaseous_corrosion && z.gaseous_corrosion.includes('G3'),
        text: 'ISA-71.04 Harsh (G3) gaseous environment — investigate sulfur-bearing contamination sources. Equipment damage risk.',
        sev: 'high', std: 'ANSI/ISA 71.04-2013' },
      { condition: (z) => z.zone_subtype === 'data_hall' && z.gaseous_corrosion && z.gaseous_corrosion.includes('GX'),
        text: 'ISA-71.04 Severe (GX) gaseous environment — immediate investigation required. Active equipment corrosion likely.',
        sev: 'critical', std: 'ANSI/ISA 71.04-2013' },
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
    ],
    suppressFields: {},
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [],
    // TODO: ASHRAE 170 ACH minimums per zone subtype
  },
  SCHOOL_K12: {
    id: 'school_k12',
    label: 'School (K-12)',
    additionalStandards: ['EPA IAQ Tools for Schools Action Kit'],
    zoneSubtypes: [
      { id: 'classroom', label: 'Classroom' },
      { id: 'gymnasium', label: 'Gymnasium' },
      { id: 'cafeteria', label: 'Cafeteria' },
      { id: 'office', label: 'Office' },
      { id: 'library', label: 'Library' },
      { id: 'lab', label: 'Science Lab' },
    ],
    suppressFields: {},
    additionalFields: {},
    rhOverrides: { default: { min: 30, max: 60, label: 'ASHRAE 55' } },
    contextFindings: [],
    // TODO: EPA TfS-specific checks, 15 cfm/person OA for classrooms
  },
}

export function getBuildingProfile(buildingType) {
  const n = (buildingType || '').toLowerCase().replace(/[\s\/]/g, '_')
  if (n.includes('data') && n.includes('center')) return BUILDING_PROFILES.DATA_CENTER
  if (n.includes('healthcare') || n.includes('hospital') || n.includes('clinic')) return BUILDING_PROFILES.HEALTHCARE
  if (n.includes('school') || n.includes('education')) return BUILDING_PROFILES.SCHOOL_K12
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
