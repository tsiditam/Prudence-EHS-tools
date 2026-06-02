/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

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

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_SHA__: JSON.stringify(resolveBuildSha()) },
  server: { port: 3003 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,ts,tsx}', 'src/**/*.{test,spec}.{js,ts,tsx}'],
  },
})
