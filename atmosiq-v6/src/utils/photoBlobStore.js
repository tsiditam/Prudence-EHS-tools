/**
 * AtmosFlow — Photo Blob Store (IndexedDB)
 *
 * Stores captured field photos as Blobs in IndexedDB, keyed by an
 * opaque ID. Reads return Blobs; callers convert to data URLs via
 * blobToDataUrl() when they need an <img>-compatible value.
 *
 * Why IndexedDB. Photos are captured as 400px JPEG, ~30–80 KB each
 * after compression. A multi-zone assessment with 50+ photos pushes
 * 2–5 MB into the assessment JSON. localStorage caps at 5–10 MB per
 * origin, so a single photo-heavy assessment can exhaust the quota
 * and silently fail saves on subsequent assessments. IndexedDB has
 * a much larger quota (typically 50%+ of free disk) and stores Blobs
 * natively (no base64 inflation).
 *
 * Why this is best-effort. If IndexedDB is unavailable (private
 * browsing in some Safari versions, quota exhausted, user denied
 * storage), the caller falls back to inline base64 in localStorage
 * — same as today. Move 3b never makes the app *worse* on devices
 * that can't use IndexedDB.
 *
 * Test injection. Tests inject an in-memory Map backend via
 * __test.setBackend(map) to avoid a fake-indexeddb dep. Each test
 * resets via __test.reset(). Matches the established pattern from
 * api/webhook.js, api/narrative.js, api/customer-portal.ts.
 */

const DB_NAME = 'atmosflow-photos'
const STORE_NAME = 'photos'
const DB_VERSION = 1

// Injectable backend for tests. Default null → real IndexedDB. Map
// instance → in-memory. Setter ignores anything else (defensive).
let testBackend = null

function isTestMode() { return testBackend instanceof Map }

function getIndexedDB() {
  if (typeof indexedDB !== 'undefined') return indexedDB
  return null
}

async function openDB() {
  const idb = getIndexedDB()
  if (!idb) return null
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Put a Blob under the given id. Resolves to true on success, false
 * if the store is unavailable (private browsing, etc.). Never throws
 * — callers treat false as "fall back to inline base64."
 */
export async function putPhoto(id, blob) {
  if (!id || !blob) return false
  if (isTestMode()) { testBackend.set(id, blob); return true }
  try {
    const db = await openDB()
    if (!db) return false
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(blob, id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch { return false }
}

/**
 * Read a Blob by id. Resolves to the Blob, or null if missing or
 * the store is unavailable.
 */
export async function getPhoto(id) {
  if (!id) return null
  if (isTestMode()) { return testBackend.get(id) || null }
  try {
    const db = await openDB()
    if (!db) return null
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}

/** Delete a single photo by id. Best-effort — never throws. */
export async function deletePhoto(id) {
  if (!id) return false
  if (isTestMode()) { testBackend.delete(id); return true }
  try {
    const db = await openDB()
    if (!db) return false
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch { return false }
}

/**
 * Delete every photo whose id starts with the given prefix. Used to
 * clean up an entire assessment's photos on deleteAssessment, so
 * deleted assessments don't leak blob storage.
 */
export async function deletePhotosByPrefix(prefix) {
  if (!prefix) return 0
  if (isTestMode()) {
    let n = 0
    for (const id of Array.from(testBackend.keys())) {
      if (id.startsWith(prefix)) { testBackend.delete(id); n++ }
    }
    return n
  }
  try {
    const db = await openDB()
    if (!db) return 0
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor()
      let n = 0
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) { resolve(n); return }
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete()
          n++
        }
        cursor.continue()
      }
      req.onerror = () => resolve(n)
    })
  } catch { return 0 }
}

/**
 * Convenience: turn a Blob into a data: URL string for <img src=…>
 * or DOCX ImageRun embedding. Returns null on failure.
 */
export async function blobToDataUrl(blob) {
  if (!blob || typeof blob !== 'object') return null
  if (typeof FileReader === 'undefined') return null
  return await new Promise((resolve) => {
    try {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    } catch { resolve(null) }
  })
}

/**
 * Convenience: turn a data: URL string back into a Blob for putPhoto.
 * Returns null if the input isn't a recognizable data URL.
 */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  const isBase64 = /;base64/.test(dataUrl.slice(0, 40))
  const payload = m[2]
  try {
    if (isBase64) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes], { type: mime })
    }
    return new Blob([decodeURIComponent(payload)], { type: mime })
  } catch { return null }
}

/**
 * Returns true when IndexedDB is reachable. Cheap probe — opens and
 * immediately closes the database. Used by the compaction layer to
 * decide whether to attempt offload at all.
 */
export async function isAvailable() {
  if (isTestMode()) return true
  try {
    const db = await openDB()
    if (!db) return false
    db.close()
    return true
  } catch { return false }
}

// Test hooks — see CLAUDE.md "API handlers are CommonJS; vi.mock
// doesn't reliably intercept require() calls. Established pattern:
// each handler exports __test = { setX(mock), reset() }".
export const __test = {
  setBackend(map) { testBackend = map instanceof Map ? map : null },
  reset() { testBackend = null },
}
