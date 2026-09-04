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
import { execSync } from 'node:child_process'
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

// Short git SHA of the build, surfaced in the UI so the live build is
// verifiable at a glance. Vercel exposes VERCEL_GIT_COMMIT_SHA; fall
// back to `git rev-parse` locally, then to 'dev'.
function resolveBuildSha() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

// Vendor chunking. The main chunk was 3.1 MB minified / 930 KB gzip with
// every report, PDF, chart and markdown dependency inlined, and every
// deploy invalidated all of it. Grouping the heavy, rarely-changing
// packages into their own chunks lets the PWA cache them across deploys
// and keeps the app chunk to the code that actually changed. Lazy
// loading of the screens that use them is the frontend's follow-up.
const VENDOR_CHUNKS = [
  ['vendor-docx', ['docx']],
  ['vendor-jspdf', ['jspdf', 'jspdf-autotable']],
  ['vendor-recharts', ['recharts']],
  ['vendor-supabase', ['@supabase/']],
  ['vendor-sentry', ['@sentry/']],
  ['vendor-markdown', ['react-markdown', 'remark-', 'micromark', 'mdast']],
  ['vendor-lucide', ['lucide-react']],
]

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined
  const after = id.slice(id.lastIndexOf('node_modules/') + 'node_modules/'.length)
  for (const [chunk, prefixes] of VENDOR_CHUNKS) {
    if (prefixes.some(p => after.startsWith(p))) return chunk
  }
  return undefined
}

export default defineConfig({
  plugins: [react(), precacheManifestPlugin()],
  define: { __BUILD_SHA__: JSON.stringify(resolveBuildSha()) },
  server: { port: 3000 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks },
    },
  },
  test: {
    // No global environment: node by default, and the component / page
    // tests opt into jsdom per file with `// @vitest-environment jsdom`.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**', 'api/**', 'lib/**'],
      // Thresholds sit just under the September 2026 baseline
      // (66.97% lines, 53.3% branches, 57.5% functions) so they hold the
      // line without blocking the next PR. Raise them as coverage grows.
      thresholds: { lines: 65, branches: 50, functions: 55, statements: 60 },
    },
  },
})