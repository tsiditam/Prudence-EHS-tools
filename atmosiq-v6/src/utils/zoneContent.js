/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Zone content — which zones the assessor has actually recorded anything
 * in, and how to take one out of an assessment without corrupting the
 * state that is keyed by zone position.
 *
 * Why this exists
 * ---------------
 * The walkthrough seeds every zone as a bare `{}` ("+ Add another zone"),
 * and the zone-to-zone ‹ Prev / Next › control lets the assessor step away
 * from one without answering a single question. Nothing then stopped an
 * untouched zone from reaching finalize: scoreZone ran over every entry
 * in `zones`, so a row that was never more than a mis-tap appeared in the
 * findings census, the zone count on the results hero, and the report.
 * And there was no way to take it back out — no remove-zone control
 * existed at all.
 *
 * Two things make "remove a zone" more than a `splice`:
 *
 *   • Photos are keyed by zone INDEX (`photos['z2-dp']`, see photoIndex.js),
 *     so every zone after the removed one has to have its groups re-keyed
 *     one slot down or its photos silently attach to the wrong room.
 *   • Equipment carries the inverse of `zone.servingEquipmentIds` in
 *     `servedZoneIds`, keyed by the zone's stable `zid`; a removed zone's
 *     id has to come out of every unit that listed it.
 *
 * `photoOverrides` is keyed by zone NAME and is left alone unless the
 * removed zone was the only one carrying that name.
 */

const filled = (v) => {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return String(v).trim() !== ''
}

/**
 * Keys a zone can carry without the assessor having entered anything:
 * the stable id stamped on first equipment toggle, the (possibly empty)
 * equipment mapping, and the outdoor baseline readings, which setZF and
 * runScoring both propagate into EVERY zone from wherever they were
 * captured. None of these mean the room was surveyed.
 */
const STRUCTURAL_KEYS = new Set(['zid', 'servingEquipmentIds'])

/**
 * True when nothing the assessor recorded lives in this zone.
 *
 * @param {object} z            a zone record
 * @param {Iterable<string>} outdoorIds  field ids propagated site-wide (SENSOR_FIELDS outdoor:1)
 */
export function isBlankZone(z, outdoorIds = []) {
  if (!z || typeof z !== 'object') return true
  const skip = new Set(outdoorIds)
  for (const [k, v] of Object.entries(z)) {
    if (STRUCTURAL_KEYS.has(k) || skip.has(k)) continue
    if (filled(v)) return false
  }
  return true
}

/** Indices of the zones `isBlankZone` is true for. */
export function blankZoneIndices(zones, outdoorIds = []) {
  return (zones || []).map((z, i) => (isBlankZone(z, outdoorIds) ? i : -1)).filter((i) => i >= 0)
}

/**
 * Human label for a zone in a prompt: its name when it has one, else its
 * 1-based position, which is how the walkthrough header refers to it.
 */
export function zoneLabel(zones, idx) {
  const z = (zones || [])[idx]
  const name = z && typeof z.zn === 'string' ? z.zn.trim() : ''
  return name || `Zone ${idx + 1}`
}

/**
 * Remove the zone at `idx` and return the state that depends on zone
 * position, all re-keyed. Pure. Refuses (returns the input unchanged) when
 * the index is out of range or it would leave no zone: an assessment
 * always has at least one, and the caller never offers removal below
 * two.
 *
 * @param {object} s  { zones, photos, photoOverrides, equipment, curZone }
 * @param {number} idx
 */
export function removeZoneAt(s, idx) {
  const zones = Array.isArray(s?.zones) ? s.zones : []
  if (!Number.isInteger(idx) || idx < 0 || idx >= zones.length || zones.length <= 1) return s
  const removed = zones[idx] || {}
  const nextZones = zones.filter((_, i) => i !== idx)

  // Photos: drop the removed slot, shift every later slot down by one.
  const photos = s.photos && typeof s.photos === 'object' ? s.photos : {}
  const nextPhotos = {}
  for (const [key, list] of Object.entries(photos)) {
    const m = /^z(\d+)-(.+)$/.exec(key)
    if (!m) { nextPhotos[key] = list; continue }
    const zi = Number(m[1])
    if (zi === idx) continue
    nextPhotos[zi > idx ? `z${zi - 1}-${m[2]}` : key] = list
  }

  // Overrides are by name; keep the entry if another zone still bears it.
  const overrides = s.photoOverrides && typeof s.photoOverrides === 'object' ? s.photoOverrides : {}
  const name = typeof removed.zn === 'string' ? removed.zn : ''
  const nameStillUsed = !!name && nextZones.some((z) => z && z.zn === name)
  const nextOverrides = { ...overrides }
  if (name && !nameStillUsed) delete nextOverrides[name]

  // Equipment: forget the removed zone's stable id.
  const equipment = Array.isArray(s.equipment) ? s.equipment : []
  const nextEquipment = removed.zid
    ? equipment.map((e) => (Array.isArray(e?.servedZoneIds) && e.servedZoneIds.includes(removed.zid)
      ? { ...e, servedZoneIds: e.servedZoneIds.filter((id) => id !== removed.zid) }
      : e))
    : equipment

  // The current zone slides down with everything after the removed slot.
  const cur = Number.isInteger(s.curZone) ? s.curZone : 0
  const nextCur = Math.max(0, Math.min(cur > idx ? cur - 1 : cur, nextZones.length - 1))

  return { ...s, zones: nextZones, photos: nextPhotos, photoOverrides: nextOverrides, equipment: nextEquipment, curZone: nextCur }
}

/**
 * Remove several zones by index in one pass (highest first, so the
 * remaining indices stay valid as each one goes).
 */
export function removeZonesAt(s, indices) {
  const sorted = [...new Set((indices || []).filter(Number.isInteger))].sort((a, b) => b - a)
  return sorted.reduce((acc, i) => removeZoneAt(acc, i), s)
}
