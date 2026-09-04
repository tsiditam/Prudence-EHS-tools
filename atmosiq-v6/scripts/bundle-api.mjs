#!/usr/bin/env node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * bundle-api — turns every `api/**` handler into a plain-Node ESM file
 * under `server/handlers/`, which is what the container entrypoint
 * (`server/index.js`) mounts.
 *
 * Why this exists. The container path used to `import()` the `api/*.js`
 * sources directly and `require('../lib/sentry')` — a `.ts` file. Under
 * plain Node (no tsx, no Vercel transpile) that cannot boot: `.ts` never
 * resolves, `lib/` was not even copied into the image, and only 8 of the
 * handlers were mounted. The 2026-09 audit (H4) rated the path as unable
 * to start. Bundling each entry with esbuild gives Node exactly the module
 * shape Vercel's runtime sees — TypeScript transpiled, relative imports
 * inlined, npm packages left external so `npm ci --omit=dev` supplies
 * them at runtime.
 *
 * Output layout mirrors the route table:
 *   api/credits.js                   → server/handlers/credits.mjs
 *   api/profile/mark-onboarded.ts    → server/handlers/profile/mark-onboarded.mjs
 *   lib/sentry.ts                    → server/handlers/_sentry.mjs   (init only)
 *
 * `_`-prefixed files in api/ are shared helpers, not routes; they are
 * inlined into whichever handler imports them and never emitted on their
 * own. `server/handlers/` is gitignored — it is a build product.
 *
 * Usage:
 *   node scripts/bundle-api.mjs               # writes server/handlers/
 *   node scripts/bundle-api.mjs --out <dir>   # somewhere else (tests)
 *
 * Exported for tests: `listApiEntries(rootDir)` and
 * `bundleApi({ rootDir, outDir })`.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'

const ENTRY_EXT = /\.(js|ts)$/
const IS_HELPER = (name) => name.startsWith('_')

/**
 * Every routable entry under api/ — recursive, .js and .ts, excluding
 * `_`-prefixed helper files and directories, and `.test.*` / `.d.ts`.
 * Paths are returned relative to rootDir, POSIX-separated, sorted.
 */
export async function listApiEntries(rootDir) {
  const apiDir = path.join(rootDir, 'api')
  const out = []
  async function walk(dir, rel) {
    let dirents
    try { dirents = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const d of dirents) {
      if (IS_HELPER(d.name) || d.name === 'node_modules') continue
      const relPath = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) { await walk(path.join(dir, d.name), relPath); continue }
      if (!ENTRY_EXT.test(d.name)) continue
      if (/\.(test|spec)\.[jt]s$/.test(d.name) || d.name.endsWith('.d.ts')) continue
      out.push(`api/${relPath}`)
    }
  }
  await walk(apiDir, '')
  return out.sort()
}

/** api/profile/mark-onboarded.ts → profile/mark-onboarded */
export function routeForEntry(entry) {
  return entry.replace(/^api\//, '').replace(ENTRY_EXT, '')
}

const BANNER = {
  // Handlers written as CommonJS call require(); an ESM output needs a
  // real `require` in scope for the externals esbuild leaves untouched.
  js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
}

/**
 * Bundle one entry to `outFile`. Node platform, ESM output, npm packages
 * external — the same shape Vercel's Node runtime loads.
 */
export async function bundleEntry(rootDir, entry, outFile) {
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    banner: BANNER,
    logLevel: 'silent',
    // Keep Vercel's `module.exports.config` etc. reachable as named exports.
    // esbuild emits `export default module.exports` for CJS entries.
  })
}

/**
 * Bundle every api/** entry plus the Sentry initialiser into outDir.
 * Returns { entries: [{ entry, route, outFile }], sentry: outFile|null }.
 *
 * @param {{ rootDir?: string, outDir?: string }} [opts]
 * @returns {Promise<{ outDir: string, entries: Array<{ entry: string, route: string, outFile: string }>, sentry: string | null }>}
 */
export async function bundleApi({ rootDir = process.cwd(), outDir } = {}) {
  const resolvedOut = outDir ? path.resolve(rootDir, outDir) : path.join(rootDir, 'server', 'handlers')
  await fs.rm(resolvedOut, { recursive: true, force: true })
  await fs.mkdir(resolvedOut, { recursive: true })

  const entries = await listApiEntries(rootDir)
  const results = []
  for (const entry of entries) {
    const route = routeForEntry(entry)
    const outFile = path.join(resolvedOut, `${route}.mjs`)
    await bundleEntry(rootDir, entry, outFile)
    results.push({ entry, route, outFile })
  }

  // Sentry server init — lib/sentry.ts is TypeScript, so it too must be
  // bundled before plain Node can load it. Emitted as a `_`-prefixed
  // file so the route walker in server/index.js skips it.
  let sentry = null
  const sentrySrc = path.join(rootDir, 'lib', 'sentry.ts')
  try {
    await fs.access(sentrySrc)
    sentry = path.join(resolvedOut, '_sentry.mjs')
    await bundleEntry(rootDir, 'lib/sentry.ts', sentry)
  } catch {
    sentry = null
  }

  return { outDir: resolvedOut, entries: results, sentry }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const outIdx = process.argv.indexOf('--out')
  const outDir = outIdx > -1 ? process.argv[outIdx + 1] : undefined
  bundleApi({ rootDir: process.cwd(), outDir })
    .then(({ outDir: dir, entries, sentry }) => {
      for (const { route } of entries) console.log(`  ${route}.mjs`)
      if (sentry) console.log('  _sentry.mjs')
      console.log(`[bundle-api] ${entries.length} handlers → ${path.relative(process.cwd(), dir) || '.'}`)
    })
    .catch((err) => {
      console.error('[bundle-api] failed:', err && err.message ? err.message : err)
      process.exit(1)
    })
}

// Convenience for callers that want a file:// URL for dynamic import.
export const toImportUrl = (p) => pathToFileURL(p).href
