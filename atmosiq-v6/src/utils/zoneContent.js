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
 * the stable id every zone is stamped with on creation (`ensureZoneIds`),
 * the (possibly empty) equipment mapping, and the outdoor baseline readings, which setZF and
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
 * Stable zone identity
 * --------------------
 * A zone's position in `zones` is not an identity: ‹ Prev / Next › moves the
 * pointer, "Remove zone" shifts every later index down, and a draft is
 * reopened wherever it was left. Anything that has to name a zone across
 * time keys on `zid` instead — the equipment mapping (`servedZoneIds`), and
 * a Jasper proposal, which is made while one zone is open and accepted
 * after the assessor may have walked on to the next room.
 *
 * `ensureZoneIds` is the guarantee: every zone carries an id from the
 * moment it exists. The client runs it on every seed, add and hydration,
 * so a draft saved before ids existed gets them the first time it is
 * opened, and a proposal never has to fall back to "whichever zone is open
 * when they tap".
 */

/** True when the record carries a usable stable id. */
export function hasZoneId(z) {
  return !!(z && typeof z.zid === 'string' && z.zid.trim() !== '')
}

/**
 * Mint a zone id. Time plus position keeps ids minted in one pass apart;
 * the random tail keeps a zone added later from colliding with one removed
 * earlier in the same millisecond bucket.
 */
export function newZoneId(idx = 0) {
  return 'z-' + Date.now().toString(36) + '-' + idx + '-' + Math.random().toString(36).slice(2, 6)
}

/**
 * Return `zones` with a `zid` on every entry. Entries that already have
 * one are returned as-is, and when nothing is missing the SAME array comes
 * back, so a functional `setZones(ensureZoneIds)` is a no-op render-wise
 * once the guarantee holds. Never mutates its input.
 */
export function ensureZoneIds(zones) {
  const list = Array.isArray(zones) ? zones : []
  if (list.every(hasZoneId)) return list
  const taken = new Set(list.filter(hasZoneId).map((z) => z.zid))
  return list.map((z, i) => {
    if (hasZoneId(z)) return z
    let zid = newZoneId(i)
    while (taken.has(zid)) zid = newZoneId(i)
    taken.add(zid)
    return { ...(z || {}), zid }
  })
}

/**
 * Append a zone, already carrying its id, and say where it landed.
 *
 * The id is minted HERE rather than on the next mount. `ensureZoneIds` runs
 * on load and on the add-zone button, so a zone created anywhere else used
 * to have no id until the draft was reopened — and a caller that creates a
 * zone and hands it straight to another surface in the same breath would
 * offer one that cannot be referenced yet. Logger Studio's dataset-to-zone
 * association is exactly that caller: it keys on `zid`, so a zone without
 * one is a zone the assessor can see and cannot link to.
 *
 * `ensureZoneIds` does the minting, so there is one convention and one
 * collision rule; every zone already carrying an id keeps it untouched.
 *
 * @param {Array} zones
 * @param {string} [name] the zone name; falls back to the positional label
 * @returns {{zones: Array, index: number}}
 */
export function appendZone(zones, name) {
  const list = Array.isArray(zones) ? zones : []
  const zn = (typeof name === 'string' ? name : '').trim()
  const next = ensureZoneIds([...list, { zn: zn || `Zone ${list.length + 1}` }])
  return { zones: next, index: next.length - 1 }
}

/** Position of the zone carrying `zid`, or -1. An empty id matches nothing. */
export function zoneIndexById(zones, zid) {
  if (typeof zid !== 'string' || zid.trim() === '') return -1
  return (zones || []).findIndex((z) => !!z && z.zid === zid)
}

/**
 * The zone a Jasper proposal is allowed to land on.
 *
 * A zone-scoped proposal (`record_zone_observation` in zone scope,
 * `add_zone_note`) is bound by the dispatcher to the zone that was open
 * when the model proposed it, as `action.zid`. This resolves that binding
 * against the zones as they are NOW — after any navigation or removal in
 * between — and fails closed: no binding, or a binding to a zone that no
 * longer exists, is -1, never "the current zone". The current zone is
 * deliberately not an input here; that is the fallback this exists to
 * remove.
 *
 * @returns {number} index into `zones`, or -1 when the proposal must not
 *   be applied
 */
export function resolveProposalZone(zones, action) {
  if (!action || typeof action !== 'object') return -1
  return zoneIndexById(zones, action.zid)
}

/**
 * Append a note to the zone at `idx` (the `znt` field the walkthrough
 * renders), on a new line when one is already there. Pure; returns the
 * input unchanged when the index is out of range or the text is blank.
 */
export function appendZoneNote(zones, idx, text) {
  const list = Array.isArray(zones) ? zones : []
  const note = typeof text === 'string' ? text.trim() : ''
  if (!note || !Number.isInteger(idx) || idx < 0 || idx >= list.length) return list
  const zone = list[idx] || {}
  const prev = typeof zone.znt === 'string' ? zone.znt : ''
  const next = [...list]
  next[idx] = { ...zone, znt: prev ? `${prev}\n${note}` : note }
  return next
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
