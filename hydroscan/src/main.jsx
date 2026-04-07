/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 * Contact: tsidi@prudenceehs.com
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import HydroScan from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HydroScan />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._pwaPrompt = e })
