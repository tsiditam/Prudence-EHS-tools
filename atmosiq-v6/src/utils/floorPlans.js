/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * floorPlans — an assessment's floor plans as a list, and where each pin sits.
 *
 * An assessment used to carry ONE plan: `floorPlan`, a data URL on the
 * record, with every zone's `mapX` / `mapY` implicitly on it. A site with a
 * ground floor and a mezzanine, or two wings drawn separately, had to pick
 * one and lose the rest. The record now carries `floorPlans`, a list of
 * `{ id, label, image }`, and a pin says which plan it is on (`mapPlan` on a
 * zone, `outdoorMapPlan` on the building).
 *
 * Migration is by reading, not by rewriting. `normalizeFloorPlans` turns a
 * legacy single `floorPlan` into a one-item list under LEGACY_PLAN_ID, and a
 * pin with no plan resolves to the FIRST plan (`resolvePlanId`) — which is
 * the only plan a legacy record ever had. A stored record is never
 * migrated in place; every reader normalizes, so an old record and a new
 * one look the same to the report, the tab and the print path.
 *
 * Images live in IndexedDB, not in the record. One plan was already the
 * largest thing in an assessment's localStorage row; several plans of a
 * phone photo each would exhaust the 5–10 MB origin quota, and `STO.set`
 * fails SILENTLY on quota. So a plan's image goes through the photo blob
 * store under the assessment's own namespace (`atmosflow:<id>:…`), which
 * means deleteAssessment's purge and the finalize re-key already cover it.
 * In memory a plan carries both the ref and the image (`{ idbId, image }`);
 * on disk it carries the ref alone (`compactFloorPlans`); on the wire to the
 * cloud it carries the image alone (`expandFloorPlans`), because the cloud
 * cannot resolve a ref that lives in one browser's IndexedDB. When
 * IndexedDB is unavailable the image stays inline, which is exactly what the
 * record held before — never worse than today.
 */

import { putPhoto, getPhoto, blobToDataUrl, dataUrlToBlob } from './photoBlobStore'
import { makeIdbId } from './photoCompaction'

/** The id the legacy single plan is read under. */
export const LEGACY_PLAN_ID = 'plan-1'

export const isImageDataUrl = (s) => typeof s === 'string' && /^data:image\//.test(s) && s.includes(';base64,')

export function newPlanId() {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** What a reader calls the plan: its label, or a position when it has none. */
export function planLabel(plan, index = 0, count = 1) {
  const l = plan && typeof plan.label === 'string' ? plan.label.trim() : ''
  if (l) return l
  return count > 1 ? `Plan ${index + 1}` : 'Floor plan'
}

function sanitizePlan(p, i, seen) {
  if (!p || typeof p !== 'object') return null
  let id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `plan-${i + 1}`
  while (seen.has(id)) id = `${id}-${i + 1}`
  seen.add(id)
  const image = isImageDataUrl(p.image) ? p.image : null
  const idbId = typeof p.idbId === 'string' && p.idbId ? p.idbId : null
  // A composed figure (the export path's output) rides along untouched.
  const out = { id, label: typeof p.label === 'string' ? p.label : '', image, idbId }
  if (p.composed && typeof p.composed === 'object') out.composed = p.composed
  if (p._missingBlob) out._missingBlob = true
  return out
}

/**
 * The plans of a record, whatever shape it was saved in.
 *
 * @param {object} record  anything carrying `floorPlans` (new) or `floorPlan`
 *                         (legacy: a data URL, or the export path's composed
 *                         `{ imageDataUrl, width, height, pinsDrawn }`)
 * @returns {Array<{id, label, image, idbId, composed?}>}
 */
export function normalizeFloorPlans(record) {
  if (!record || typeof record !== 'object') return []
  if (Array.isArray(record.floorPlans)) {
    const seen = new Set()
    return record.floorPlans.map((p, i) => sanitizePlan(p, i, seen)).filter(Boolean)
  }
  const legacy = record.floorPlan
  if (isImageDataUrl(legacy)) return [{ id: LEGACY_PLAN_ID, label: '', image: legacy, idbId: null }]
  if (legacy && typeof legacy === 'object' && isImageDataUrl(legacy.imageDataUrl)) {
    return [{ id: LEGACY_PLAN_ID, label: '', image: legacy.imageDataUrl, idbId: null, composed: legacy }]
  }
  return []
}

/**
 * Which plan a pin is on. A pin that names no plan is on the first one —
 * the only plan a legacy record had — and a pin naming a plan that no
 * longer exists is on none.
 */
export function resolvePlanId(assigned, plans = []) {
  if (!plans.length) return null
  if (typeof assigned === 'string' && assigned) return plans.some((p) => p && p.id === assigned) ? assigned : null
  return plans[0].id
}

/** The image a plan shows, or null when it is not loaded. */
export function planImage(plan) {
  if (!plan) return null
  if (isImageDataUrl(plan.image)) return plan.image
  return null
}

/**
 * Lift every pin off one plan. Removing a plan removes its marks; a pin
 * that pointed at a plan the record no longer has would point at nothing.
 * Returns new zones / building objects; the inputs are not mutated.
 */
export function clearPinsOnPlan(zones = [], building = {}, planId, plans = []) {
  const onPlan = (assigned) => resolvePlanId(assigned, plans) === planId
  const nextZones = zones.map((z) => {
    if (!z || z.mapX == null || z.mapY == null) return z
    if (!onPlan(z.mapPlan)) return z
    return { ...z, mapX: null, mapY: null, mapPlan: null }
  })
  const b = building || {}
  const nextBuilding = (b.outdoorMapX != null && b.outdoorMapY != null && onPlan(b.outdoorMapPlan))
    ? { ...b, outdoorMapX: null, outdoorMapY: null, outdoorMapPlan: null }
    : b
  return { zones: nextZones, building: nextBuilding }
}

// ── IndexedDB ─────────────────────────────────────────────────────────────

/**
 * Store a plan's image under the assessment's namespace. Resolves to the
 * idbId, or null when IndexedDB is unavailable — the caller then keeps the
 * image inline, as the record always did.
 */
export async function storeFloorPlanImage(dataUrl, assessmentId) {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const id = makeIdbId(assessmentId)
  const ok = await putPhoto(id, blob)
  return ok ? id : null
}

/**
 * The on-disk shape: a plan that has a ref drops its inline image. Sync,
 * because the image was written to IndexedDB when it was added.
 */
export function compactFloorPlans(plans = []) {
  return (plans || []).map((p) => {
    if (!p || typeof p !== 'object') return p
    if (!p.idbId) return p
    const { image: _image, composed: _composed, ...rest } = p
    return rest
  })
}

/**
 * The in-memory and wire shape: every ref is resolved to its image. A ref
 * whose blob is gone (storage cleared) comes back with `image: null` and
 * `_missingBlob: true`, so the tab can say so rather than show nothing.
 */
export async function expandFloorPlans(plans = []) {
  const out = []
  for (const p of plans || []) {
    if (!p || typeof p !== 'object') continue
    if (isImageDataUrl(p.image) || !p.idbId) { out.push(p); continue }
    const blob = await getPhoto(p.idbId)
    const image = blob ? await blobToDataUrl(blob) : null
    out.push(image ? { ...p, image } : { ...p, image: null, _missingBlob: true })
  }
  return out
}

/**
 * Offload inline images to IndexedDB (the way down from the cloud, and a
 * record saved before plans had refs). A plan whose offload fails keeps
 * its inline image.
 */
export async function offloadFloorPlans(plans = [], assessmentId) {
  const out = []
  for (const p of plans || []) {
    if (!p || typeof p !== 'object' || p.idbId || !isImageDataUrl(p.image)) { out.push(p); continue }
    const idbId = await storeFloorPlanImage(p.image, assessmentId)
    out.push(idbId ? { ...p, idbId } : p)
  }
  return out
}

/**
 * Re-home the blobs under a new assessment id. Finalize turns `draft-…`
 * into `rpt-…` and purges the draft's namespace, so a plan added under the
 * draft must be copied across first or the issued report loses it. Mirrors
 * photoCompaction.rekeyPhotos.
 */
export async function rekeyFloorPlans(plans = [], newAssessmentId) {
  if (!newAssessmentId) return plans || []
  const prefix = `atmosflow:${newAssessmentId}:`
  const out = []
  for (const p of plans || []) {
    if (!p || typeof p !== 'object' || !p.idbId || p.idbId.startsWith(prefix)) { out.push(p); continue }
    const blob = await getPhoto(p.idbId)
    if (!blob) { out.push(p); continue }
    const nextId = makeIdbId(newAssessmentId)
    const ok = await putPhoto(nextId, blob)
    out.push(ok ? { ...p, idbId: nextId } : p)
  }
  return out
}

// ── Upload ────────────────────────────────────────────────────────────────

/** Longest edge a stored plan keeps. Wide enough for the 1600px export figure. */
export const PLAN_MAX_EDGE = 2200

/**
 * Bound an uploaded plan's size before it is stored. A phone photo of a
 * drawing is 4000px and several megabytes; nothing downstream needs more
 * than the export's 1600px, and the cloud payload carries the image inline.
 * Browser-only; anywhere else, or on any failure, the input comes back as
 * is. A JPEG stays JPEG; a drawing (PNG) stays lossless.
 */
export function downscaleImageDataUrl(dataUrl, maxEdge = PLAN_MAX_EDGE) {
  return new Promise((resolve) => {
    if (!isImageDataUrl(dataUrl) || typeof document === 'undefined' || typeof Image === 'undefined') { resolve(dataUrl); return }
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const w = img.naturalWidth
          const h = img.naturalHeight
          if (!w || !h || Math.max(w, h) <= maxEdge) { resolve(dataUrl); return }
          const scale = maxEdge / Math.max(w, h)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(w * scale)
          canvas.height = Math.round(h * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(dataUrl); return }
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const jpeg = /^data:image\/jpe?g/i.test(dataUrl)
          const out = jpeg ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png')
          resolve(isImageDataUrl(out) ? out : dataUrl)
        } catch { resolve(dataUrl) }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch { resolve(dataUrl) }
  })
}
