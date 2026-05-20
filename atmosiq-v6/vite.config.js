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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writePrecacheManifest } from './scripts/build-precache-manifest.mjs'

/**
 * After Vite finishes writing dist/, build dist/precache-manifest.json
 * by scanning the emitted index.html for asset URLs. The runtime SW
 * (public/sw.js) fetches this manifest at install time and pre-
 * populates its cache, so cold-offline opens after a fresh deploy
 * have the full app shell ready — not just lazily-cached fragments.
 *
 * Failures are non-fatal: a missing manifest just means the SW falls
 * back to its static base precache list at runtime.
 */
function precacheManifestPlugin() {
  return {
    name: 'atmosflow-precache-manifest',
    apply: 'build',
    async closeBundle() {
      try {
        const { assetCount, version } = await writePrecacheManifest({
          distDir: 'dist',
          version: `${Date.now()}`,
        })
        // eslint-disable-next-line no-console
        console.log(`[precache-manifest] wrote ${assetCount} entries · version ${version}`)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[precache-manifest] failed to generate; SW will fall back to static list:', err && err.message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), precacheManifestPlugin()],
  server: { port: 3000 }
})