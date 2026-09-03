#!/usr/bin/env node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * api-boot-check — the `api_boot` acceptance check type.
 *
 * For every entry under api/** (recursive, .js and .ts, `_`-prefixed
 * helpers excluded) it:
 *
 *   1. bundles the entry with esbuild the way Vercel's Node runtime sees
 *      it — platform node, ESM output, npm packages external — into
 *      node_modules/.cache/atmosflow-api-boot/ (inside the repo so the
 *      externals resolve);
 *   2. refuses, at resolve time, any relative `import` without a file
 *      extension: Node ESM cannot load one, and vitest's TS-aware resolver
 *      hides exactly that (CLAUDE.md pitfall #4; `require()` is CommonJS
 *      and is allowed to be extension-less);
 *   3. dynamically imports the output under plain Node and asserts that
 *      the default export (`module.exports` for CJS entries) is a function
 *      and that no import-time error occurs.
 *
 * This is the runtime shape that failed in the CHANGELOG incident — 24
 * extension-less imports, every affected route returning 500 from cold
 * start, and every local gate green — expressed as a check the gates run.
 *
 * Exported for the runner and the tests: `checkApiBoot({ rootDir })`.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { listApiEntries, routeForEntry } from './bundle-api.mjs'

const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/

/**
 * esbuild plugin: a relative ESM import specifier with no extension is an
 * error. `kind` distinguishes `import` statements / `import()` (ESM
 * semantics) from `require()` (CommonJS, extension-less allowed).
 */
export function extensionlessImportGuard() {
  return {
    name: 'atmosflow-extensionless-import-guard',
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        if (args.kind !== 'import-statement' && args.kind !== 'dynamic-import') return null
        if (HAS_EXTENSION.test(args.path)) return null
        return {
          errors: [{
            text: `extension-less relative import '${args.path}' — Node ESM cannot resolve this at runtime; append the file extension (CLAUDE.md pitfall #4)`,
          }],
        }
      })
    },
  }
}

const BANNER = {
  js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
}

async function bundleOne(rootDir, entry, outFile) {
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  const result = await esbuild.build({
    absWorkingDir: rootDir,
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    banner: BANNER,
    plugins: [extensionlessImportGuard()],
    logLevel: 'silent',
  })
  return result
}

function firstErrorText(err) {
  if (err && Array.isArray(err.errors) && err.errors.length) {
    const e = err.errors[0]
    const loc = e.location ? ` (${e.location.file}:${e.location.line})` : ''
    return `${e.text}${loc}`
  }
  return err && err.message ? err.message : String(err)
}

/**
 * Run the check. Returns { ok, results: [{ entry, ok, detail }] }.
 * `entries` overrides discovery (used by tests); `outDir` overrides the
 * scratch location.
 */
export async function checkApiBoot({ rootDir = process.cwd(), entries, outDir } = {}) {
  const root = path.resolve(rootDir)
  const list = entries ?? await listApiEntries(root)
  const scratch = outDir
    ? path.resolve(root, outDir)
    : path.join(root, 'node_modules', '.cache', 'atmosflow-api-boot')
  await fs.rm(scratch, { recursive: true, force: true })
  await fs.mkdir(scratch, { recursive: true })

  const results = []
  for (const entry of list) {
    const outFile = path.join(scratch, `${routeForEntry(entry)}.mjs`)
    try {
      await bundleOne(root, entry, outFile)
    } catch (err) {
      results.push({ entry, ok: false, detail: `bundle failed: ${firstErrorText(err)}` })
      continue
    }
    try {
      // Cache-bust so repeated runs in one process re-evaluate the module.
      const mod = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`)
      const handler = mod.default
      if (typeof handler !== 'function') {
        results.push({ entry, ok: false, detail: `default export is ${handler === undefined ? 'undefined' : typeof handler}, expected a handler function` })
        continue
      }
      results.push({ entry, ok: true, detail: 'bundled and imported; default export is a function' })
    } catch (err) {
      results.push({ entry, ok: false, detail: `import failed: ${err && err.message ? err.message : String(err)}` })
    }
  }

  if (list.length === 0) {
    results.push({ entry: '(none)', ok: false, detail: `no api/** entries found under ${root}` })
  }

  return { ok: results.every((r) => r.ok), results }
}

const isMain = process.argv[1] && /api-boot-check\.mjs$/.test(process.argv[1])
if (isMain) {
  checkApiBoot({ rootDir: process.cwd() }).then(({ ok, results }) => {
    for (const r of results) console.log(`${r.ok ? '  ok ' : ' FAIL'} ${r.entry}${r.ok ? '' : ` — ${r.detail}`}`)
    console.log(`[api-boot] ${results.filter(r => r.ok).length}/${results.length} handlers boot under plain Node`)
    process.exit(ok ? 0 : 1)
  }).catch((err) => {
    console.error('[api-boot] runner error:', err)
    process.exit(2)
  })
}
