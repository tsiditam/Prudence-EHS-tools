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

function makeIdbId(assessmentId) {
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
        outArr.push({ src: dataUrl, ts: photo.ts || null })
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
