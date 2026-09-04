/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * lazySafe — React.lazy / dynamic import() with the stale-chunk safety net.
 *
 * Why this exists. v2.6.1 made DocxReport a STATIC import because a
 * dynamic `import('./DocxReport')` failed for users whose cached
 * index.html referenced a chunk hash the server no longer had after a
 * redeploy: the request for the missing chunk returned the SPA HTML
 * fallback and the browser threw "'text/html' is not a valid JavaScript
 * MIME type". Bundling everything into the main chunk avoided that at
 * the cost of a 1.5 MB (445 KB gzip) first load on field phones.
 *
 * The safety net that makes lazy loading safe again lives in two places:
 *   1. main.jsx — a global `unhandledrejection` listener that recognises
 *      the chunk-load error signature, evicts the service-worker caches
 *      and offers a reload (that handler predates this module and is
 *      what makes any dynamic import() recoverable);
 *   2. here — `importSafe` wraps the importer so a `React.lazy` failure
 *      (which React routes to the nearest error boundary, NOT to
 *      `unhandledrejection`) gets the same eviction + reload offer, and
 *      ErrorBoundary shows update copy instead of a generic crash.
 *
 * With both in place a stale chunk costs the user one tap on "Reload"
 * instead of a dead export button, so the report, PDF, sensor, admin and
 * assistant screens can leave the main chunk.
 */

import { lazy } from 'react'
import { toast } from 'sonner'

export function isStaleChunkError(reason) {
  if (!reason) return false
  const message = (reason && reason.message) || String(reason)
  return /is not a valid JavaScript MIME type|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|error loading dynamically imported module/i
    .test(message)
}

export async function evictServiceWorkerCaches() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch { /* best effort */ }
}

export const UPDATE_AVAILABLE_COPY = 'AtmosFlow has been updated. Reload to load the latest version.'

let _reloadOffered = false
/**
 * One persistent "Reload" toast per page life. Replaces the blocking
 * `window.confirm` — a modal dialog on a field phone mid-export was the
 * wrong shape for a notice the user can act on when ready.
 */
export function offerReload(message = UPDATE_AVAILABLE_COPY) {
  if (_reloadOffered) return
  _reloadOffered = true
  toast.info(message, {
    id: 'af-update-available',
    duration: Infinity,
    action: { label: 'Reload', onClick: () => window.location.reload() },
  })
}

/** Test hook — lets a test offer the reload toast more than once. */
export function __resetReloadOffer() { _reloadOffered = false }

/**
 * Await a dynamic import; on a stale-chunk failure evict caches and offer
 * a reload before rethrowing so the caller's own error path still runs.
 */
export async function importSafe(importer) {
  try {
    return await importer()
  } catch (e) {
    if (isStaleChunkError(e)) {
      await evictServiceWorkerCaches()
      offerReload()
    }
    throw e
  }
}

/** React.lazy with the stale-chunk recovery above. */
export function lazySafe(importer) {
  return lazy(() => importSafe(importer))
}
