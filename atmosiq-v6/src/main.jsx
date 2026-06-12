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
import DevEvidenceMapPreview from './components/dev/DevEvidenceMapPreview'
import { Toaster } from 'sonner'
import { initSentryClient } from '../lib/sentry-client'
import { bootTheme, getTheme } from './utils/theme'

initSentryClient()
bootTheme()

const isEarlyAccess = window.location.pathname === '/early-access'

// Non-production preview routes. Reachable on localhost and Vercel preview
// (*.vercel.app) deploys for eyeballing surfaces in isolation; never on the
// production host. Gated on hostname so prod can't surface them by accident.
const PROD_HOSTS = new Set(['atmosflow.net', 'www.atmosflow.net'])
const isDevHost = !PROD_HOSTS.has(window.location.hostname)
const isDevEvidenceMap = isDevHost && window.location.pathname === '/dev/evidence-map'

const root = isEarlyAccess
  ? <EarlyAccessPage />
  : isDevEvidenceMap
    ? <DevEvidenceMapPreview />
    : <App />

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {root}
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