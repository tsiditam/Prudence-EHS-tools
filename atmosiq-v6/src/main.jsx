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
import MoldPreviewButton from './components/dev/MoldPreviewButton'
import { Toaster, toast } from 'sonner'
import { initSentryClient } from '../lib/sentry-client'
import { bootTheme, getTheme } from './utils/theme'
import { isKnowledgeGraphEnabled, isDesktopViewport, isMoldModuleEnabled } from './utils/featureFlags'
import { isStaleChunkError, evictServiceWorkerCaches, offerReload, UPDATE_AVAILABLE_COPY } from './components/ui/lazySafe'

initSentryClient()
bootTheme()

const isEarlyAccess = window.location.pathname === '/early-access'

// Knowledge Graph surfaces (the /dev preview, the KG Preview button, and the
// in-app Evidence tab) share one rollout gate. Enabled on preview/localhost;
// OFF on the production host by default; flip on a live demo with ?kg=1. See
// src/utils/featureFlags.js. The KG is a desktop-only experience, so every
// surface additionally requires a desktop-width viewport.
const kgEnabled = isKnowledgeGraphEnabled() && isDesktopViewport()
const isDevEvidenceMap = kgEnabled && window.location.pathname === '/dev/evidence-map'

// Mold module preview. Staged behind isMoldModuleEnabled() (preview-on,
// prod-off-by-default, ?mold=1 opt-in). NOT desktop-gated — the card-based
// screening surface works on any viewport (field work happens on phones).
const moldEnabled = isMoldModuleEnabled()
const isDevMold = moldEnabled && window.location.pathname === '/dev/mold-screening'

// Lazy so each preview (and the demo data + engine pipeline it pulls in) never
// lands in the production bundle — it loads only when the dev route is hit.
const DevEvidenceMapPreview = React.lazy(() => import('./components/dev/DevEvidenceMapPreview'))
const DevMoldPreview = React.lazy(() => import('./components/dev/DevMoldPreview'))

const root = isEarlyAccess
  ? <EarlyAccessPage />
  : isDevEvidenceMap
    ? <React.Suspense fallback={null}><DevEvidenceMapPreview /></React.Suspense>
    : isDevMold
      ? <React.Suspense fallback={null}><DevMoldPreview /></React.Suspense>
      : <App />

// The Toaster sits OUTSIDE the error boundary so the "Update available —
// Reload" and quota toasts survive a render crash in the app tree.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {root}
      {kgEnabled && !isDevEvidenceMap && <DevPreviewButton />}
    </ErrorBoundary>
    <Toaster theme={getTheme()} richColors closeButton position="top-center" />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
  // A new service worker took over this tab (sw.js calls skipWaiting +
  // clients.claim on activate). From here on the tab runs the OLD app
  // chunks against the NEW cache — any not-yet-loaded lazy chunk may 404.
  // Tell the user rather than let them find out from a dead button. The
  // first controller on a cold load is not an update, so skip that one.
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return }
    toast.info(UPDATE_AVAILABLE_COPY, {
      id: 'af-update-available',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => window.location.reload() },
    })
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
// signature, evict the service-worker cache, and offer a reload —
// a single tap recovers them. Without this handler the user sees
// "Please try again" and the same failure repeats.
//
// This handler is what makes lazy loading safe: every `import()` and
// `React.lazy` in the app (see src/components/ui/lazySafe.jsx, which
// covers the React.lazy path — those failures go to the ErrorBoundary,
// not here) can fail on a stale deploy and still recover with one tap.
// Keep it even if the SW strategy changes.
window.addEventListener('unhandledrejection', async (event) => {
  if (!isStaleChunkError(event.reason)) return
  await evictServiceWorkerCaches()
  offerReload()
})
