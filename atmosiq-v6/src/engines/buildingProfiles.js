/**
 * AtmosFlow Building-Type Profiles — v2.3
 * Applies type-specific standards, zone subtypes, and threshold overrides.
 */

export const BUILDING_PROFILES = {
  DATA_CENTER: {
    id: 'data_center',
    label: 'Data Center',
    additionalStandards: ['ANSI/ISA 71.04-2013 (G1/G2 gaseous corrosion)'],
    zoneSubtypes: ['data_hall', 'noc_office', 'battery_room', 'mechanical', 'office'],
    rhOverrides: {
      data_hall: { min: 20, max: 60, label: 'Static control range' },
      default: { min: 30, max: 60, label: 'ASHRAE 55 comfort range' },
    },
    contextFindings: [
      { condition: (z) => z.su === 'noc_office' || z.su === 'office', text: 'Verify NOC/office zones have dedicated outdoor air, not return from data hall.', sev: 'medium' },
      { condition: (z) => z.su === 'battery_room', text: 'Battery room: verify hydrogen monitoring and ventilation per NFPA 1. Minimum 1 cfm/sq ft continuous exhaust.', sev: 'high' },
    ],
    ventilationAppliesTo: ['noc_office', 'office', 'conference'],
  },
  HEALTHCARE: {
    id: 'healthcare',
    label: 'Healthcare',
    additionalStandards: ['ASHRAE 170-2021 (Ventilation of Health Care Facilities)'],
    zoneSubtypes: ['exam_room', 'waiting', 'office', 'procedure', 'pharmacy', 'lab'],
    // TODO: Populate ASHRAE 170 ACH minimums per zone subtype
    // exam_room: 6 ACH, procedure: 15 ACH, pharmacy: 4 ACH
    contextFindings: [],
    ventilationAppliesTo: null,
  },
  SCHOOL_K12: {
    id: 'school_k12',
    label: 'School (K-12)',
    additionalStandards: ['EPA IAQ Tools for Schools Action Kit'],
    zoneSubtypes: ['classroom', 'gymnasium', 'cafeteria', 'office', 'library', 'lab'],
    // TODO: Populate EPA TfS-specific checks
    // classrooms: verify 15 cfm/person OA per ASHRAE 62.1
    contextFindings: [],
    ventilationAppliesTo: null,
  },
}

export function getBuildingProfile(buildingType) {
  const normalized = (buildingType || '').toLowerCase().replace(/[\s\/]/g, '_')
  if (normalized.includes('data') && normalized.includes('center')) return BUILDING_PROFILES.DATA_CENTER
  if (normalized.includes('healthcare') || normalized.includes('hospital') || normalized.includes('clinic')) return BUILDING_PROFILES.HEALTHCARE
  if (normalized.includes('school') || normalized.includes('education')) return BUILDING_PROFILES.SCHOOL_K12
  return null
}

export function getProfileContextFindings(profile, zoneData) {
  if (!profile || !profile.contextFindings) return []
  return profile.contextFindings
    .filter(cf => cf.condition(zoneData))
    .map(cf => ({ t: cf.text, sev: cf.sev, std: profile.additionalStandards[0] || '' }))
}

export function getRHOverride(profile, zoneSubtype) {
  if (!profile?.rhOverrides) return null
  return profile.rhOverrides[zoneSubtype] || profile.rhOverrides.default || null
}
