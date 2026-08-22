/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Photo key index — the one place that knows how assessment photos are keyed.
 *
 * The walkthrough stores photos in a single flat map keyed by zone INDEX and
 * the question that prompted them:
 *
 *   photos['z0-dp'] = [{ src, ts, aiAnalysis? }, …]
 *
 * (`MobileApp.jsx`, the `q.photo` branch — `photos[\`z${curZone}-${q.id}\`]`.)
 * Only three questions carry `photo:1` today — `dp` (condensate drain pan),
 * `wd` (water damage) and `mi` (mold indicators) — so a zone has at most three
 * groups, each holding any number of images.
 *
 * `photoOverrides` is a DIFFERENT map keyed by zone NAME
 * (`photoOverrides[zones[curZone].zn] = { reason }`). That asymmetry is real
 * and is why this module exists: a reader that assumes one shape gets the
 * other one silently wrong.
 *
 * ── The defect this was extracted to fix ──────────────────────────────
 * `src/engines/validation.js` looked photos up as `photos[zoneName]`. Nothing
 * has ever written that shape, so the HARD blocker "Critical/High finding
 * without photo" fired for every zone with a serious finding no matter how
 * many photos the assessor took — clearable only by filing a
 * "photo capture not feasible" override, which is the opposite of what the
 * gate is for. Its tests pinned the fictional shape
 * (`photos: { 'Zone 1': [{ id: 'p1' }] }`), so the gate and its tests agreed
 * with each other and with nothing else.
 *
 * Only the real shape is parsed here. Accepting the name-keyed shape "just in
 * case" would preserve the ability for a caller to be wrong in the same way,
 * and no stored assessment carries it.
 */

import { getField } from '../constants/field-registry.js'

/** `z3-mi` → `{ zoneIndex: 3, fieldId: 'mi' }`. Null for anything else. */
export function parsePhotoKey(key) {
  if (typeof key !== 'string') return null
  const m = /^z(\d+)-(.+)$/.exec(key)
  if (!m) return null
  const zoneIndex = Number(m[1])
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0) return null
  return { zoneIndex, fieldId: m[2] }
}

/**
 * Every photo recorded against a zone, flattened across its question groups.
 * Each entry keeps the key and field it came from so a caption can name what
 * the assessor was photographing.
 */
export function photosForZone(photos, zoneIndex) {
  if (!photos || typeof photos !== 'object') return []
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0) return []
  const out = []
  for (const [key, list] of Object.entries(photos)) {
    const parsed = parsePhotoKey(key)
    if (!parsed || parsed.zoneIndex !== zoneIndex) continue
    if (!Array.isArray(list)) continue
    for (const photo of list) {
      if (photo && typeof photo === 'object') out.push({ key, fieldId: parsed.fieldId, photo })
    }
  }
  return out
}

/** True when the zone has at least one photo. The predicate the gate needs. */
export function zoneHasPhotos(photos, zoneIndex) {
  return photosForZone(photos, zoneIndex).length > 0
}

/**
 * Reader-facing caption for a photo group.
 *
 * The label is resolved from `FIELD_REGISTRY`, which derives it from
 * `questions.js` — so the caption is the question the assessor answered,
 * not a re-typed guess at it. Before this existed the report ran the raw key
 * through a title-caser and captioned a zone-3 mould photo **"Mi"**.
 */
export function photoCaption(key, zones) {
  const parsed = parsePhotoKey(key)
  if (!parsed) return null
  const field = getField(parsed.fieldId)
  const label = field?.label || parsed.fieldId
  const zone = Array.isArray(zones) ? zones[parsed.zoneIndex] : null
  const zoneName = (zone && typeof zone.zn === 'string' && zone.zn.trim())
    || `Zone ${parsed.zoneIndex + 1}`
  return `${label} — ${zoneName}`
}
