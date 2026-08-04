/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold module — intake question sets.
 *
 * Declarative field descriptors, the SAME shape as questions.js
 * (`{ id, sec, q, t, req, sk, ic, opts, ph, cond }`) so the existing form
 * renderer can drive them unchanged when the mold mode UI lands. These capture
 * the observations the mold screening engine projects from; they never score.
 *
 * Field id prefixes: `mps_` = mold presurvey (assessment-level), `mz_` = mold
 * per-zone. The mapper `buildMoldInput` (src/engines/mold/buildInput.js) reads
 * exactly these ids, so the intake schema and the engine input stay in step.
 */

// Moisture material options — mirror the keys in MOISTURE_INDICATORS so a
// captured material maps directly to its screening reference.
export const MOLD_MOISTURE_MATERIALS = [
  { value: 'wood', label: 'Wood / wood-based' },
  { value: 'drywall', label: 'Gypsum board / drywall' },
  { value: 'concrete', label: 'Concrete / masonry' },
  { value: 'other', label: 'Other' },
]

const YES_NO = ['Yes', 'No']

/** Assessment-level mold context. */
export const Q_MOLD_PRESURVEY = [
  { id: 'mps_trigger', sec: 'Mold Context', q: 'What prompted the mold assessment?', t: 'ch', req: 1, ic: '🎯',
    opts: ['Water intrusion event', 'Visible growth reported', 'Musty odor', 'Occupant complaint', 'Real-estate / due diligence', 'Post-remediation verification', 'Other'] },
  { id: 'mps_water_event', sec: 'Mold Context', q: 'Known water intrusion in the past 12 months?', t: 'ch', req: 1, ic: '💧', opts: YES_NO },
  { id: 'mps_hvac_involved', sec: 'Mold Context', q: 'Is HVAC implicated as a moisture source or pathway?', t: 'ch', sk: 1, ic: '🌀', opts: YES_NO },
  { id: 'mps_prior_remediation', sec: 'Mold Context', q: 'Prior mold remediation at this location?', t: 'ch', sk: 1, ic: '🧯', opts: YES_NO },
]

/** Per-zone mold observations. */
export const Q_MOLD_ZONE = [
  { id: 'mz_water_source', sec: 'Water', q: 'Water source (if any) affecting this area', t: 'text', sk: 1, ic: '🚰', ph: 'e.g. supply-line leak, sewage backup, roof leak' },
  { id: 'mz_water_date', sec: 'Water', q: 'Approx. date of the water event', t: 'date', sk: 1, ic: '📅', cond: { f: 'mz_water_source', neq: '' } },
  { id: 'mz_water_prolonged', sec: 'Water', q: 'Standing water or prolonged saturation?', t: 'ch', sk: 1, ic: '⏳', opts: YES_NO, cond: { f: 'mz_water_source', neq: '' } },
  { id: 'mz_visible_growth', sec: 'Growth', q: 'Visible mold growth in this area?', t: 'ch', req: 1, ic: '🦠', opts: YES_NO },
  { id: 'mz_growth_area', sec: 'Growth', q: 'Approx. affected area (ft²)', t: 'num', sk: 1, ic: '📐', cond: { f: 'mz_visible_growth', eq: 'Yes' } },
  { id: 'mz_porous', sec: 'Growth', q: 'Is the affected material porous (drywall, carpet, ceiling tile)?', t: 'ch', sk: 1, ic: '🧱', opts: YES_NO, cond: { f: 'mz_visible_growth', eq: 'Yes' } },
  { id: 'mz_musty_odor', sec: 'Growth', q: 'Musty / earthy odor present?', t: 'ch', sk: 1, ic: '👃', opts: YES_NO },
  { id: 'mz_hidden_suspected', sec: 'Growth', q: 'Hidden growth suspected (wall cavity, above ceiling, HVAC)?', t: 'ch', sk: 1, ic: '🔍', opts: YES_NO },
  { id: 'mz_moisture_material', sec: 'Moisture', q: 'Material for the moisture reading', t: 'ch', sk: 1, ic: '🪵', opts: MOLD_MOISTURE_MATERIALS.map((m) => m.label) },
  { id: 'mz_moisture_value', sec: 'Moisture', q: 'Moisture reading (material native scale)', t: 'num', sk: 1, ic: '💦', cond: { f: 'mz_moisture_material', neq: '' } },
  { id: 'mz_moisture_location', sec: 'Moisture', q: 'Reading location within the area', t: 'text', sk: 1, ic: '📍', ph: 'e.g. N wall base behind casework', cond: { f: 'mz_moisture_material', neq: '' } },
]

// Map a captured moisture-material LABEL back to its engine key.
export const moldMaterialKey = (label) =>
  (MOLD_MOISTURE_MATERIALS.find((m) => m.label === label || m.value === label)?.value) || 'other'
