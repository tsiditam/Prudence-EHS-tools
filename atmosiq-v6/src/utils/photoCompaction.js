/**
 * AtmosFlow — Photo Compaction
 *
 * Translates between two shapes of the assessment.photos object:
 *
 *   INLINE  (legacy + wire format used by Supabase + the in-memory state)
 *     {
 *       "z0-dp": [{ src: "data:image/jpeg;base64,...", ts: "..." }, ...],
 *       "z1-mi": [...],
 *     }
 *
 *   COMPACT (local-only — what we persist in localStorage)
 *     {
 *       "z0-dp": [{ idbId: "atmosflow:<assessment-id>:<uuid>", ts: "..." }, ...],
 *       "z1-mi": [...],
 *     }
 *
 * Compaction (compactPhotos): walks the photos object, writes each
 * inline base64 blob to IndexedDB, replaces the `src` field with an
 * `idbId` reference. Photos that are already compacted (no `src`
 * field) pass through unchanged. Photos whose offload to IndexedDB
 * fails (private browsing, quota) ALSO pass through unchanged — the
 * caller still gets a valid assessment, just one that didn't shrink.
 *
 * Expansion (expandPhotos): the inverse. Walks the photos object,
 * for each `idbId` reference reads the Blob from IndexedDB and
 * inlines it as `src`. References whose Blob is missing (storage
 * cleared, corruption) pass through with `src: null` so the
 * renderer's existing fallback (display "[Photo: …]" placeholder)
 * kicks in instead of throwing.
 *
 * Wire-format invariant. Anything that sends data out of the SPA
 * (Supabase upsert, DOCX render, PrintReport HTML) MUST receive
 * expanded photos. The supabaseStorage layer enforces this at the
 * sync seam; consumers above that layer never see compact refs.
 */

import { putPhoto, getPhoto, deletePhotosByPrefix, blobToDataUrl, dataUrlToBlob } from './photoBlobStore'

const IDB_KEY_PREFIX = 'atmosflow'

function isInlinePhoto(photo) {
  return photo && typeof photo === 'object' && typeof photo.src === 'string' && photo.src.startsWith('data:')
}

function isCompactPhoto(photo) {
  return photo && typeof photo === 'object' && typeof photo.idbId === 'string'
}

export function makeIdbId(assessmentId) {
  const aid = assessmentId || 'orphan'
  // crypto.randomUUID is widely supported on every browser AtmosFlow
  // ships to (Safari 15.4+, Chrome 92+, Firefox 95+). Fall back to a
  // timestamp+rand if not.
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${IDB_KEY_PREFIX}:${aid}:${uuid}`
}

/**
 * Compact an assessment.photos object — offload inline base64 blobs
 * to IndexedDB and replace them with idbId references. Returns a NEW
 * photos object; the input is not mutated.
 *
 * @param {object} photos        the photos object (key → array of photo refs)
 * @param {string} assessmentId  the parent assessment id (for blob key namespacing)
 * @returns {Promise<{ photos: object, offloaded: number, skipped: number }>}
 */
export async function compactPhotos(photos, assessmentId) {
  if (!photos || typeof photos !== 'object') {
    return { photos: photos || {}, offloaded: 0, skipped: 0 }
  }
  const out = {}
  let offloaded = 0
  let skipped = 0
  for (const key of Object.keys(photos)) {
    const arr = Array.isArray(photos[key]) ? photos[key] : []
    const outArr = []
    for (const photo of arr) {
      if (!photo) continue
      if (isCompactPhoto(photo)) {
        outArr.push(photo)
        continue
      }
      if (isInlinePhoto(photo)) {
        const blob = dataUrlToBlob(photo.src)
        if (!blob) { outArr.push(photo); skipped++; continue }
        const id = makeIdbId(assessmentId)
        const ok = await putPhoto(id, blob)
        if (ok) {
          outArr.push({ idbId: id, ts: photo.ts || null, mime: blob.type || 'image/jpeg' })
          offloaded++
        } else {
          outArr.push(photo)
          skipped++
        }
        continue
      }
      // Unknown shape — pass through as-is.
      outArr.push(photo)
    }
    out[key] = outArr
  }
  return { photos: out, offloaded, skipped }
}

/**
 * Expand an assessment.photos object — read idbId references from
 * IndexedDB and inline them as `src` data URLs. Returns a NEW photos
 * object; the input is not mutated.
 *
 * Missing blobs (deleted, corrupt, storage cleared) are passed
 * through with `src: null`. The DOCX renderer at sections-v21client
 * line 1238 already wraps its ImageRun call in try/catch and emits a
 * "[Photo: <label>]" placeholder on error, so a missing blob never
 * blocks report generation.
 *
 * @param {object} photos  the photos object (compact or inline or mixed)
 * @returns {Promise<{ photos: object, expanded: number, missing: number }>}
 */
export async function expandPhotos(photos) {
  if (!photos || typeof photos !== 'object') {
    return { photos: photos || {}, expanded: 0, missing: 0 }
  }
  const out = {}
  let expanded = 0
  let missing = 0
  for (const key of Object.keys(photos)) {
    const arr = Array.isArray(photos[key]) ? photos[key] : []
    const outArr = []
    for (const photo of arr) {
      if (!photo) continue
      if (isInlinePhoto(photo)) {
        outArr.push(photo)
        continue
      }
      if (isCompactPhoto(photo)) {
        const blob = await getPhoto(photo.idbId)
        if (!blob) {
          outArr.push({ src: null, ts: photo.ts || null, _missingBlob: true })
          missing++
          continue
        }
        const dataUrl = await blobToDataUrl(blob)
        if (!dataUrl) {
          outArr.push({ src: null, ts: photo.ts || null, _missingBlob: true })
          missing++
          continue
        }
        // Keep everything else on the record (aiAnalysis, caption…) —
        // only the reference is swapped for the image.
        // eslint-disable-next-line no-unused-vars
        const { idbId, ...rest } = photo
        outArr.push({ ...rest, src: dataUrl, ts: photo.ts || null })
        expanded++
        continue
      }
      // Unknown shape — pass through as-is.
      outArr.push(photo)
    }
    out[key] = outArr
  }
  return { photos: out, expanded, missing }
}

/**
 * Tear down every blob belonging to an assessment. Called from
 * deleteAssessment so deleted assessments don't leak storage.
 */
export async function purgeAssessmentPhotos(assessmentId) {
  if (!assessmentId) return 0
  return await deletePhotosByPrefix(`${IDB_KEY_PREFIX}:${assessmentId}:`)
}

// ── Capture-time API (PhotoCapture / thumbnails) ─────────────────────
//
// Photos no longer enter React state as base64 (audit 2026-09 §6). The
// capture component writes the Blob here and keeps only `{ idbId, ts }`
// in state; thumbnails resolve the id with resolvePhotoSrc (cached by
// src/hooks/usePhotoSrc.js) and every export path expands the whole map
// with expandPhotos before the renderer sees it.

/** The inline image of a record, if it carries one (legacy shape or string). */
export function photoInlineSrc(photo) {
  if (!photo) return null
  if (typeof photo === 'string') return photo
  return typeof photo.src === 'string' && photo.src ? photo.src : null
}

/**
 * Store a captured data URL under the assessment's namespace. Resolves to
 * the new idbId, or null when IndexedDB is unavailable — the caller then
 * keeps the inline `src` exactly as before (never worse than today).
 */
export async function storePhoto(dataUrl, assessmentId) {
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return null
  const id = makeIdbId(assessmentId)
  const ok = await putPhoto(id, blob)
  return ok ? id : null
}

/** Data URL for one record — inline source, or the blob behind its idbId. */
export async function resolvePhotoSrc(photo) {
  const inline = photoInlineSrc(photo)
  if (inline) return inline
  const id = photo && typeof photo === 'object' ? photo.idbId : null
  if (!id) return null
  const blob = await getPhoto(id)
  return blob ? await blobToDataUrl(blob) : null
}

/**
 * Re-home an assessment's blobs under a new id. Finalize turns
 * `draft-…` into `rpt-…` and then DELETES the draft — including its
 * IndexedDB namespace — so refs captured under the draft id must be
 * copied across first or the issued report loses its photos. Records
 * already under `newAssessmentId`, inline records and unknown shapes pass
 * through unchanged; a blob that cannot be read keeps its old ref (the
 * purge is best-effort and the expand path reports it as missing).
 */
export async function rekeyPhotos(photos, newAssessmentId) {
  if (!photos || typeof photos !== 'object' || !newAssessmentId) {
    return { photos: photos || {}, moved: 0 }
  }
  const prefix = `${IDB_KEY_PREFIX}:${newAssessmentId}:`
  const out = {}
  let moved = 0
  for (const key of Object.keys(photos)) {
    const arr = Array.isArray(photos[key]) ? photos[key] : []
    const outArr = []
    for (const photo of arr) {
      if (!isCompactPhoto(photo) || photo.idbId.startsWith(prefix)) { outArr.push(photo); continue }
      const blob = await getPhoto(photo.idbId)
      if (!blob) { outArr.push(photo); continue }
      const nextId = makeIdbId(newAssessmentId)
      const ok = await putPhoto(nextId, blob)
      if (!ok) { outArr.push(photo); continue }
      outArr.push({ ...photo, idbId: nextId })
      moved++
    }
    out[key] = outArr
  }
  return { photos: out, moved }
}
