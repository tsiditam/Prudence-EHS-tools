/**
 * AtmosFlow FM Mode — Question Sets
 * Simplified question flow for facility managers.
 * Writes to the same underlying assessment schema as IH mode.
 */

import { DEVICE_TIERS } from './terminology'

export const BUILDING_ACTIVITIES = [
  { id: 'normal_occupancy', label: 'Normal occupancy — no special activity' },
  { id: 'construction_or_renovation', label: 'Active construction or renovation' },
  { id: 'recent_renovation_past_90_days', label: 'Recent renovation (past 90 days)' },
  { id: 'water_damage_event_past_180_days', label: 'Water damage event (past 180 days)' },
  { id: 'pest_remediation_past_90_days', label: 'Pest remediation (past 90 days)' },
  { id: 'chemical_spill_past_180_days', label: 'Chemical spill (past 180 days)' },
  { id: 'hvac_service_past_30_days', label: 'HVAC service (past 30 days)' },
  { id: 'other', label: 'Other' },
]

export const CONSTRUCTION_SUBTYPES = [
  'Concrete cutting', 'Masonry work', 'Drywall demolition', 'Paint disturbance',
  'Flooring replacement', 'Ceiling tile disturbance', 'HVAC modification',
  'Plumbing', 'Electrical', 'Other',
]

export const Q_FM_BUILDING_ACTIVITY = [
  { id: 'fm_activity', sec: 'Activity', q: 'Current building activity?', t: 'ch', req: 1, ic: '🏗️',
    opts: BUILDING_ACTIVITIES.map(a => a.label) },
  { id: 'fm_construction_year', sec: 'Activity', q: 'Building construction year?', t: 'num', sk: 1, ic: '📅',
    cond: { f: 'fm_activity', in: ['Active construction or renovation', 'Recent renovation (past 90 days)'] },
    ph: 'e.g. 1975' },
  { id: 'fm_activity_subtype', sec: 'Activity', q: 'Type of construction activity?', t: 'multi', sk: 1, ic: '🔨',
    cond: { f: 'fm_activity', in: ['Active construction or renovation', 'Recent renovation (past 90 days)'] },
    opts: CONSTRUCTION_SUBTYPES },
  { id: 'fm_activity_status', sec: 'Activity', q: 'Is the activity ongoing or completed?', t: 'ch', sk: 1, ic: '📋',
    cond: { f: 'fm_activity', in: ['Active construction or renovation', 'Recent renovation (past 90 days)'] },
    opts: ['Currently ongoing', 'Completed'] },
  { id: 'fm_abatement_plan', sec: 'Activity', q: 'Contractor provided silica/asbestos/lead abatement plan?', t: 'ch', sk: 1, ic: '🛡️',
    cond: { f: 'fm_activity', in: ['Active construction or renovation', 'Recent renovation (past 90 days)'] },
    opts: ['Yes', 'No', 'Unknown'] },
  { id: 'fm_water_event_date', sec: 'Activity', q: 'Date of water event?', t: 'date', sk: 1, ic: '📅',
    cond: { f: 'fm_activity', eq: 'Water damage event (past 180 days)' } },
  { id: 'fm_water_sqft', sec: 'Activity', q: 'Affected area (sq ft)?', t: 'num', sk: 1, ic: '📐',
    cond: { f: 'fm_activity', eq: 'Water damage event (past 180 days)' } },
  { id: 'fm_dryout_documented', sec: 'Activity', q: 'Documented dry-out within 48-72 hours?', t: 'ch', sk: 1, ic: '✅',
    cond: { f: 'fm_activity', eq: 'Water damage event (past 180 days)' },
    opts: ['Yes', 'No', 'Unknown'] },
  { id: 'fm_spill_substance', sec: 'Activity', q: 'What substance was spilled?', t: 'text', sk: 1, ic: '⚗️',
    cond: { f: 'fm_activity', eq: 'Chemical spill (past 180 days)' } },
  { id: 'fm_spill_cleanup', sec: 'Activity', q: 'Cleanup method documented?', t: 'ch', sk: 1, ic: '📋',
    cond: { f: 'fm_activity', eq: 'Chemical spill (past 180 days)' },
    opts: ['Yes', 'No', 'Unknown'] },
]

export const Q_FM_DEVICE_TIER = [
  { id: 'fm_device_tier', sec: 'Device', q: 'What are you using to measure the air?', t: 'ch', req: 1, ic: '📱',
    opts: DEVICE_TIERS.map(d => d.label) },
  { id: 'fm_device_model', sec: 'Device', q: 'Device make and model?', t: 'text', sk: 1, ic: '📏',
    cond: { f: 'fm_device_tier', ne: 'No instruments — just logging complaints' },
    ph: 'e.g. Temtop M2000, AirThings Wave Plus' },
]

export const Q_FM_BUILDING = [
  { id: 'ft', sec: 'Building', q: 'Building type?', t: 'ch', req: 1, ic: '🏢',
    opts: ['Office', 'Retail', 'Warehouse', 'Healthcare', 'Education', 'Mixed-use', 'Residential multifamily'] },
  { id: 'ba', sec: 'Building', q: 'Approximate building age?', t: 'ch', ic: '📅',
    opts: ['< 10 years', '10–30 years', '30–50 years', '> 50 years', 'Unknown'] },
  { id: 'ht', sec: 'Building', q: 'HVAC system type?', t: 'ch', ic: '❄️',
    opts: ['Package rooftop unit', 'VAV (variable air volume)', 'DOAS (dedicated outdoor air)', 'Window units / mini-splits', 'Central boiler/chiller', 'Unknown'] },
  { id: 'fm_recent_reno', sec: 'Building', q: 'Any renovations in the last 12 months?', t: 'ch', ic: '🏗️',
    opts: ['No', 'Yes'] },
  { id: 'fm_reno_desc', sec: 'Building', q: 'What was renovated?', t: 'ta', sk: 1, ic: '📝',
    cond: { f: 'fm_recent_reno', eq: 'Yes' }, ph: 'Painting, flooring, furniture, etc.' },
  { id: 'fm_water_event', sec: 'Building', q: 'Any water events in the last 24 months?', t: 'ch', ic: '💧',
    opts: ['No', 'Yes — resolved', 'Yes — ongoing', 'Unsure'] },
  { id: 'fm_water_loc', sec: 'Building', q: 'Where did the water event occur?', t: 'ta', sk: 1, ic: '📍',
    cond: { f: 'fm_water_event', ne: 'No' }, ph: 'Roof, basement, pipe, etc.' },
  { id: 'fn', sec: 'Building', q: 'Building name?', t: 'text', req: 1, ic: '🏷️',
    ph: 'e.g. Meridian Business Park — Building A' },
  { id: 'fl', sec: 'Building', q: 'Building address?', t: 'text', sk: 1, ic: '📍',
    ph: '123 Main St, Suite 200' },
  { id: 'fm_occupancy', sec: 'Building', q: 'Approximate occupancy right now?', t: 'num', ic: '👥',
    ph: 'Number of people in the building' },
]

export const Q_FM_ZONE = [
  { id: 'zn', sec: 'Area', q: 'Area name?', t: 'text', req: 1, ic: '📍',
    ph: 'e.g. 3rd Floor Open Office, Lobby, Break Room' },
  { id: 'su', sec: 'Area', q: 'What is this space used for?', t: 'ch', req: 1, ic: '🪑',
    opts: ['Office', 'Classroom', 'Retail', 'Healthcare', 'Lab', 'Warehouse',
           'Conference room', 'Break room / kitchen', 'Lobby', 'Restroom', 'Other'] },
  { id: 'za', sec: 'Area', q: 'Approximate area size?', t: 'num', sk: 1, ic: '📐', u: 'sq ft' },
  { id: 'zo', sec: 'Area', q: 'How many people work here?', t: 'num', sk: 1, ic: '👥' },
  // Complaints (same field IDs as IH for engine compatibility)
  { id: 'cx', sec: 'Complaints', q: 'Are there complaints about this area?', t: 'ch', ic: '🗣️',
    opts: ['No complaints', 'Yes — complaints reported'] },
  { id: 'ac', sec: 'Complaints', q: 'How many people are affected?', t: 'ch', ic: '👥',
    cond: { f: 'cx', eq: 'Yes — complaints reported' },
    opts: ['1-2', '3-5', '6-10', 'More than 10'] },
  { id: 'sy', sec: 'Complaints', q: 'What symptoms are reported?', t: 'multi', ic: '🤒',
    cond: { f: 'cx', eq: 'Yes — complaints reported' },
    opts: ['Headache', 'Fatigue', 'Eye irritation', 'Throat irritation', 'Cough',
           'Shortness of breath', 'Nausea', 'Dizziness', 'Concentration issues', 'Odor'] },
  // Environment (same field IDs)
  { id: 'tc', sec: 'Comfort', q: 'Temperature comfort?', t: 'ch', ic: '🌡️',
    opts: ['Comfortable', 'Too hot', 'Too cold', 'Varies throughout the day'] },
  { id: 'hp', sec: 'Comfort', q: 'Humidity feel?', t: 'ch', ic: '💧',
    opts: ['Comfortable', 'Too humid / stuffy', 'Too dry', 'Variable'] },
  { id: 'od', sec: 'Environment', q: 'Any unusual odors?', t: 'ch', ic: '👃',
    opts: ['None', 'Musty / moldy', 'Chemical / solvent', 'Sewage / drain', 'Smoke', 'Other'] },
  { id: 'wd', sec: 'Environment', q: 'Any visible water damage?', t: 'ch', ic: '🚿',
    opts: ['None', 'Old staining', 'Active leak', 'Extensive damage'] },
  { id: 'mi', sec: 'Environment', q: 'Any visible mold?', t: 'ch', ic: '🦠',
    opts: ['None', 'Suspected discoloration', 'Small (< 10 sq ft)', 'Moderate (10-100 sq ft)', 'Extensive (> 100 sq ft)'] },
  { id: 'vd', sec: 'Environment', q: 'Visible dust or particles?', t: 'ch', ic: '🌫️',
    opts: ['None', 'Light surface dust', 'Airborne haze', 'Heavy accumulation'] },
  // HVAC observables
  { id: 'sa', sec: 'Airflow', q: 'Can you feel air coming from vents?', t: 'ch', ic: '💨',
    opts: ['Yes — good airflow', 'Weak / reduced', 'No airflow detected', 'No vents in this area'] },
  // Measurements (only if device tier supports it — gated in FM flow)
  { id: '_sensors', sec: 'Readings', q: 'Enter your device readings', t: 'sensors', sk: 1, ic: '📏' },
]

export const Q_FM_MEASUREMENT_INTENT = [
  { id: 'fm_intent', sec: 'Method', q: 'How would you like to document this area?', t: 'ch', req: 1, ic: '📋',
    opts: [
      'Observation only — document what you see, feel, and smell',
      'Observation + measurements — document AND enter readings',
      'Measurements only — enter readings from your device',
    ] },
]

export function getMeasurementIntent(val) {
  if (!val) return null
  if (val.startsWith('Observation only')) return 'observation_only'
  if (val.startsWith('Observation + ')) return 'mixed'
  return 'measurements_only'
}

export function getDeviceTierCeiling(tierLabel) {
  const tier = DEVICE_TIERS.find(d => d.label === tierLabel)
  return tier?.ceiling || null
}

export function shouldShowTVOC(tierLabel) {
  const tier = DEVICE_TIERS.find(d => d.label === tierLabel)
  return tier?.id === 'prosumer' || tier?.id === 'professional'
}

export function isComplaintOnly(tierLabel) {
  const tier = DEVICE_TIERS.find(d => d.label === tierLabel)
  return tier?.id === 'none'
}
