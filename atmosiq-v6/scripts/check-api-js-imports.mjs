/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * check-api-js-imports — CI guardrail against the regression that
 * shipped in PR #297 (commit fcfe774) and crashed every Jasper turn
 * on atmosflow.net.
 *
 * The crash chain was:
 *
 *   api/field-assistant.ts       (TS — bundled by Vercel's esbuild)
 *     └─ imports src/constants/field-assistant-tools.js
 *          (plain ES module, loaded by every Jasper request)
 *          └─ statically imported '../../lib/report-templates/render'
 *               (the file is render.ts — TypeScript)
 *
 * Vitest's TS-aware resolver let the extension-less `.ts` import
 * resolve cleanly from a `.js` file in the test environment, so
 * `npm test` was green. Vercel's serverless Node runtime, however,
 * cannot resolve a `.ts` extension from a plain `.js` ESM importer
 * at module-load time — `/api/field-assistant` crashed at import
 * before any handler logic ran, returning 500 on every turn.
 *
 * Diagnosis was straightforward but the failure mode is silent:
 * production is the first place it surfaces, because every other
 * surface (vitest, Vite SPA bundling, the TS API entry's own
 * imports) handles the resolution transparently.
 *
 * This check walks the import graph rooted at every `api/**` entry,
 * collects every `.js` / `.mjs` file reached, and verifies that
 * none of their relative extension-less imports resolve only to a
 * `.ts` / `.tsx` file. SPA-side `.js → .ts` imports (under
 * `src/components/`, `src/main.jsx`, etc.) are intentionally NOT
 * checked — Vite's bundler handles them correctly.
 *
 * Usage:
 *   node scripts/check-api-js-imports.mjs
 *   npm run lint:imports                  # wired in package.json
 *
 * Exits 0 when clean, 1 with a printed report when landmines exist.
 *
 * The pure function `findApiJsTsLandmines(rootDir)` is exported so
 * the regression test can exercise it against a fixture tree.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

// Matches every import shape that resolves a module specifier:
//   • `import X from '...'`              (named / default / namespace)
//   • `import '...'`                     (side-effect, no `from`)
//   • `export ... from '...'`            (re-export)
//   • `import('...')`                    (dynamic)
// The non-greedy [\s\S]*? lets bindings span newlines for the common
// `import { a, b } from` shape.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import\s+(?:[\s\S]*?)\s+from\s+|export\s+(?:[\s\S]*?)\s+from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

const JS_EXT_RE = /\.(m?js)$/
const TS_EXT_RE = /\.(tsx?)$/
const ANY_KNOWN_EXT_RE = /\.(m?js|jsx|tsx?|json)$/

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

/**
 * Resolve a relative spec the way Node + bundlers would. Tries
 * `.js`, `.mjs`, `.jsx`, `.json`, then `.ts`, `.tsx`, then `/index.*`
 * fallbacks. Returns the first concrete file path that exists, or
 * null if nothing resolves.
 */
async function resolveSpec(importerFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null
  const importerDir = path.dirname(importerFile)
  const base = path.resolve(importerDir, spec)
  if (ANY_KNOWN_EXT_RE.test(spec)) {
    return (await exists(base)) ? base : null
  }
  for (const ext of ['.js', '.mjs', '.jsx', '.json', '.ts', '.tsx']) {
    if (await exists(base + ext)) return base + ext
  }
  for (const ext of ['/index.js', '/index.mjs', '/index.jsx', '/index.ts', '/index.tsx']) {
    if (await exists(base + ext)) return base + ext
  }
  return null
}

async function* walkDir(dir) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) }
  catch { return }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.vercel' || e.name === 'coverage') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walkDir(full)
    else yield full
  }
}

async function readImportSpecs(file) {
  let src
  try { src = await fs.readFile(file, 'utf8') } catch { return [] }
  const specs = []
  for (const m of src.matchAll(IMPORT_RE)) {
    const lineIdx = src.slice(0, m.index).split('\n').length
    specs.push({ spec: m[1], line: lineIdx, src })
  }
  return specs
}

/**
 * Walk the import graph from every api/** entry. Returns the set of
 * resolved absolute file paths that are reachable.
 */
export async function collectApiReachable(rootDir) {
  const apiDir = path.join(rootDir, 'api')
  const entries = []
  for await (const f of walkDir(apiDir)) {
    if (/\.(m?js|tsx?)$/.test(f)) entries.push(f)
  }
  const visited = new Set()
  const queue = [...entries]
  while (queue.length) {
    const f = queue.shift()
    if (visited.has(f)) continue
    visited.add(f)
    const specs = await readImportSpecs(f)
    for (const { spec } of specs) {
      const target = await resolveSpec(f, spec)
      if (target && !visited.has(target)) queue.push(target)
    }
  }
  return visited
}

/**
 * Find every API-reachable `.js` / `.mjs` file with a relative
 * extension-less import that resolves only to a `.ts` / `.tsx`
 * file — i.e. the exact landmine pattern PR #298 fixed.
 *
 * Returns an array of {importer, spec, resolves_to, line} records,
 * empty if clean. The rootDir is required so the regression test
 * can point it at a fixture tree.
 */
export async function findApiJsTsLandmines(rootDir) {
  const reachable = await collectApiReachable(rootDir)
  const landmines = []
  for (const f of reachable) {
    if (!JS_EXT_RE.test(f)) continue
    const specs = await readImportSpecs(f)
    for (const { spec, line } of specs) {
      if (ANY_KNOWN_EXT_RE.test(spec)) continue
      const target = await resolveSpec(f, spec)
      if (target && TS_EXT_RE.test(target)) {
        landmines.push({
          importer: path.relative(rootDir, f),
          spec,
          resolves_to: path.relative(rootDir, target),
          line,
        })
      }
    }
  }
  return landmines
}

// CLI entrypoint. We only run the script body when this file was
// invoked directly by Node (i.e. `process.argv[1]` resolves to this
// file's URL), NOT when it's imported as a module by the regression
// test. fileURLToPath isn't available without import — and pathing
// works on both POSIX + Windows since import.meta.url is always a
// file:// URL.
import { fileURLToPath } from 'node:url'
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invokedDirectly) {
  const rootDir = process.cwd()
  const landmines = await findApiJsTsLandmines(rootDir)
  if (landmines.length === 0) {
    console.log('check-api-js-imports: clean (no api-reachable .js → .ts landmines)')
    process.exit(0)
  }
  console.error(
    `check-api-js-imports: found ${landmines.length} api-reachable .js → .ts landmine${landmines.length === 1 ? '' : 's'}.`,
  )
  console.error(
    'These will crash the Vercel runtime at module load (the .ts extension is not resolvable',
  )
  console.error(
    'from a plain .js ESM importer). Either change the importer to .ts, or inject the dep via',
  )
  console.error(
    'a ctx parameter from a .ts entry point (the analyze_photo / generate_report pattern).',
  )
  for (const l of landmines) {
    console.error(`  ${l.importer}:${l.line}  '${l.spec}' → ${l.resolves_to}`)
  }
  process.exit(1)
}
