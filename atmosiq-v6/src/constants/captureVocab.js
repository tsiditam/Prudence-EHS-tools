/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Vocabularies for the structured capture records — the event timeline,
 * the pathway checks and the logger event log — shared by the walkthrough
 * editors (components/walkthrough/CaptureRecords.jsx), the report model
 * (report/reportModel.js) and the demo data. Pure data, browser-safe.
 *
 * These are facts about what happened, was tested or was seen. None of
 * them is a verdict, and no engine reads them: the readers are the report's
 * background paragraph, its observation sentences, its conceptual site
 * model and its logger captions. See docs/WALKTHROUGH_CAPTURE.md.
 */

/** Event kinds on the presurvey timeline (`ps_timeline`). */
export const TIMELINE_KINDS = [
  { id: 'renovation_started',  label: 'Renovation started' },
  { id: 'renovation_completed', label: 'Renovation completed' },
  { id: 'materials_installed', label: 'Materials installed' },
  { id: 'reoccupied',          label: 'Space re-occupied' },
  { id: 'complaints_began',    label: 'First complaints' },
  { id: 'prior_action',        label: 'Prior action taken' },
  { id: 'hvac_change',         label: 'HVAC change' },
  { id: 'water_event',         label: 'Water event' },
  { id: 'logger_placed',       label: 'Logger placed' },
  { id: 'logger_retrieved',    label: 'Logger retrieved' },
  { id: 'other',               label: 'Other' },
]

/** The pathway checks a zone record can carry (`zone_checks`). */
export const ZONE_CHECKS = [
  { id: 'door_smoke',       label: 'Door smoke test',              results: ['Air flows into the zone', 'Air flows out of the zone', 'Neutral / indeterminate'] },
  { id: 'diffuser_airflow', label: 'Supply diffuser airflow',      results: ['Normal', 'Weak / reduced', 'None detected'] },
  { id: 'damper_seen',      label: 'Outdoor-air damper position',  results: ['Open', 'Closed / minimum', 'Stuck / inoperable', 'Not accessible'] },
  { id: 'drain_pan_seen',   label: 'Condensate drain pan',         results: ['Clean — draining', 'Standing water', 'Growth observed', 'Not accessible'] },
  { id: 'grille_flow',      label: 'Grille airflow measurement',   results: ['Measured — value recorded', 'Attempted — not measurable'] },
]

/** How a check was made. */
export const CHECK_METHODS = ['Smoke pencil', 'Tissue / ribbon', 'Felt by hand', 'Visual', 'Balometer / flow hood', 'Anemometer']

/** Event kinds during a logging period (`logger_deployment.events`). */
export const LOGGER_EVENT_KINDS = [
  { id: 'cleaning',      label: 'Cleaning' },
  { id: 'cooking',       label: 'Cooking / food preparation' },
  { id: 'hvac_schedule', label: 'HVAC schedule change' },
  { id: 'doors_windows', label: 'Doors / windows open' },
  { id: 'delivery',      label: 'Materials or furniture delivered' },
  { id: 'occupancy',     label: 'Occupancy change' },
  { id: 'maintenance',   label: 'Maintenance activity' },
  { id: 'other',         label: 'Other' },
]

/** Where a logger sat, as a short vocabulary the caption can print. */
export const LOGGER_POSITIONS = ['Desk / work surface', 'Shelf', 'Tripod / stand', 'Wall mount', 'Floor', 'Other']

const labelOf = (list, id) => { const hit = list.find(k => k.id === id); return hit ? hit.label : (id || '') }
export const timelineKindLabel = (id) => labelOf(TIMELINE_KINDS, id)
export const loggerEventLabel = (id) => labelOf(LOGGER_EVENT_KINDS, id)
export const zoneCheckLabel = (id) => labelOf(ZONE_CHECKS, id)

/** Sources a zone ticked, as the list the detail cards are keyed by. */
export function tickedSources(zone = {}) {
  const NONE = new Set(['None identified', 'None of concern'])
  const list = (v) => (Array.isArray(v) ? v : []).filter(s => typeof s === 'string' && s.trim() && !NONE.has(s))
  const out = [...list(zone.src_internal), ...list(zone.src_adjacent)]
  for (const key of ['src_internal_other', 'src_adjacent_other']) {
    const v = zone[key]
    if (typeof v === 'string' && v.trim()) out.push(v.trim())
  }
  return [...new Set(out)]
}
