/**
 * AtmosFlow FM Mode — Question Sets
 * Simplified question flow for facility managers.
 * Writes to the same underlying assessment schema as IH mode.
 */

import { DEVICE_TIERS } from './terminology'

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
