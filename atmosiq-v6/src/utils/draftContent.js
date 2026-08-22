/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Contact: tsidi@prudenceehs.com
 *
 * ── Has this assessment been started, or only opened? ─────────────────
 *
 * The autosave used to persist an assessment 1.2 seconds after "New
 * Assessment" was tapped, whatever was in it — which was nothing, because
 * proceedAfterDisclaimer sets `bldg` to `{}` and navigates straight to
 * quickstart. Backing out after more than a second left a permanent
 * "Untitled" row in the drafts list, and nothing in the app ever pruned
 * one. They accumulated for the life of the install.
 *
 * The test deliberately does NOT look at `presurvey`. It is pre-filled
 * from the user's profile at creation (Profiles.toPresurvey), so it is
 * non-empty before the assessor has typed anything — using it would make
 * every abandoned start look like real work.
 */

const filled = (v) => {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return String(v).trim() !== ''
}

/**
 * True once the assessor has entered something worth keeping.
 *
 * @param {object} d  { bldg, zones, equipment, photos, sensorData, floorPlan }
 */
export function hasDraftContent(d) {
  if (!d) return false
  if (filled(d.bldg && d.bldg.fn)) return true
  if (filled(d.equipment) || filled(d.floorPlan) || filled(d.sensorData)) return true
  // Photos arrive keyed by zone slot; an empty bucket is not content.
  if (d.photos && Object.values(d.photos).some(filled)) return true
  // A zone row is seeded as `{}`. Any value in any zone counts, including
  // the zone name on its own — naming a room is a real edit.
  return (d.zones || []).some((z) => z && Object.values(z).some(filled))
}

/**
 * True for a stored draft body that was never actually started — the rows
 * the guard above now prevents, for installs that already have them.
 * Finalized reports are never empty by this test (they carry zones), but
 * the id check makes the intent explicit at the call site.
 */
export function isAbandonedDraft(body) {
  return !!body && !hasDraftContent(body)
}
