/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import EarlyAccessPage from './components/EarlyAccessPage'
import DevPreviewButton from './components/dev/DevPreviewButton'
import { Toaster } from 'sonner'
import { initSentryClient } from '../lib/sentry-client'
import { bootTheme, getTheme } from './utils/theme'
import { isKnowledgeGraphEnabled } from './utils/featureFlags'

initSentryClient()
bootTheme()

const isEarlyAccess = window.location.pathname === '/early-access'

// Knowledge Graph surfaces (the /dev preview, the KG Preview button, and the
// in-app Evidence tab) share one gate. Enabled on preview/localhost; OFF on
// the production host until merged; flip on a live demo with ?kg=1. See
// src/utils/featureFlags.js.
const kgEnabled = isKnowledgeGraphEnabled()
const isDevEvidenceMap = kgEnabled && window.location.pathname === '/dev/evidence-map'

// Lazy so the preview (and the demo data + engine pipeline it pulls in) never
// lands in the production bundle — it loads only when the dev route is hit.
const DevEvidenceMapPreview = React.lazy(() => import('./components/dev/DevEvidenceMapPreview'))

const root = isEarlyAccess
  ? <EarlyAccessPage />
  : isDevEvidenceMap
    ? <React.Suspense fallback={null}><DevEvidenceMapPreview /></React.Suspense>
    : <App />

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {root}
      {kgEnabled && !isDevEvidenceMap && <DevPreviewButton />}
      <Toaster theme={getTheme()} richColors closeButton position="top-center" />
    </ErrorBoundary>
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window._pwaPrompt = e
})

// v2.6.1 — Global stale-chunk safety net.
//
// When the user has a cached index.html that references a chunk
// hash the deployed server no longer has, the dynamic import for
// that chunk receives the SPA HTML fallback and the browser
// throws "'text/html' is not a valid JavaScript MIME type".
// Combined with the service worker (which caches index.html and
// chunks across deploys), this is the single most common
// production failure mode.
//
// We listen for unhandled rejections, detect the chunk-load error
// signature, evict the service-worker cache, and prompt the user
// to reload — a single click recovers them. Without this handler
// the user sees "Please try again" and the same failure repeats.
let _staleChunkPromptShown = false
function isStaleChunkError(reason) {
  if (!reason) return false
  const message = (reason && reason.message) || String(reason)
  return /is not a valid JavaScript MIME type|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i
    .test(message)
}
async function evictServiceWorkerCaches() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {}
}
window.addEventListener('unhandledrejection', async (event) => {
  if (!isStaleChunkError(event.reason)) return
  if (_staleChunkPromptShown) return
  _staleChunkPromptShown = true
  await evictServiceWorkerCaches()
  const reload = window.confirm(
    'AtmosFlow has been updated. Reload to load the latest version?'
  )
  if (reload) window.location.reload()
})