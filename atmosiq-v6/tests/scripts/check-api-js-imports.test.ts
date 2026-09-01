/**
 * Regression tests for scripts/check-api-js-imports.mjs.
 *
 * Pins the contract that would have caught PR #297's production
 * crash before it shipped:
 *
 *   • API-reachable `.js` file → `.ts` import (the bug) is flagged
 *   • API-reachable `.js` file → `.js` import is NOT flagged
 *   • API-reachable `.ts` file → `.ts` import is NOT flagged BY THIS CHECK
 *     — see the correction below; it is caught by the second one
 *   • Non-API-reachable `.js` file → `.ts` import is NOT flagged
 *     (Vite-bundled SPA code can resolve TS extensions transparently)
 *   • The graph walk follows `.ts` → `.js` → `.ts` chains, so a
 *     landmine two hops deep from a TS API entry is still caught
 *
 * Each test builds an isolated fixture tree in a tmp dir, runs the
 * pure `findApiJsTsLandmines(rootDir)` export, and asserts the
 * landmine list.
 *
 * ── The assumption in bullet three was wrong (corrected 2026-09-01) ───────
 *
 * "TS bundlers handle that fine; only the .js importer was a problem" was
 * inferred from the one crash this file was written from, and it is not how
 * the runtime works. Vercel TRANSPILES each api/** entry and traces its
 * imports rather than bundling them, so what runs is Node ESM — which
 * requires an explicit extension on every relative specifier, whatever the
 * importer was written in.
 *
 * Twenty-four extension-less imports were live in the API graph, and every
 * function reached through one had been returning a bare 500 since deploy:
 * both report-template endpoints, /api/events, and five cron handlers —
 * the email-queue processor among them, which failed all 96 of its runs in
 * the preceding week. It surfaced only because somebody tried to upload a
 * report template and got "Upload failed (500)".
 *
 * `findApiExtensionlessImports` is the corrected rule and a superset of the
 * original. The narrow check is kept: it names the PR #297 shape precisely,
 * and a specific diagnosis is worth more to whoever reads the failure than a
 * general one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  findApiJsTsLandmines,
  findApiExtensionlessImports,
} from '../../scripts/check-api-js-imports.mjs'

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'apijs-check-'))
  await fs.mkdir(path.join(root, 'api'), { recursive: true })
  await fs.mkdir(path.join(root, 'lib'), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'constants'), { recursive: true })
  await fs.mkdir(path.join(root, 'src', 'components'), { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(rel: string, contents: string) {
  const abs = path.join(root, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, contents, 'utf8')
}

describe('findApiJsTsLandmines', () => {
  it('flags an API-reachable .js file that imports an extension-less .ts path', async () => {
    // This is the exact PR #297 regression — re-encoded as a fixture
    // so any future revival of the same pattern fails this test.
    await write(
      'api/handler.ts',
      `import { dispatchTool } from '../src/constants/tools.js'\nexport default function h(){ return dispatchTool() }\n`,
    )
    await write(
      'src/constants/tools.js',
      `import { renderTemplate } from '../../lib/render'\nexport function dispatchTool() { return renderTemplate() }\n`,
    )
    await write(
      'lib/render.ts',
      `export function renderTemplate() { return 'ok' }\n`,
    )

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toHaveLength(1)
    expect(landmines[0]).toMatchObject({
      importer: path.join('src', 'constants', 'tools.js'),
      spec: '../../lib/render',
      resolves_to: path.join('lib', 'render.ts'),
    })
    expect(landmines[0].line).toBe(1)
  })

  it('does NOT flag API-reachable .js → .js imports', async () => {
    await write('api/handler.ts', `import { x } from '../src/constants/tools.js'\n`)
    await write('src/constants/tools.js', `import { y } from '../../lib/helpers'\nexport const x = y\n`)
    await write('lib/helpers.js', `export const y = 1\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toEqual([])
  })

  it('does NOT flag API-reachable .ts → .ts imports', async () => {
    // TypeScript files can import extension-less .ts paths safely —
    // Vercel's esbuild bundles them. The narrow rule only catches
    // .js / .mjs importers.
    await write('api/handler.ts', `import { x } from '../lib/util'\nexport default x\n`)
    await write('lib/util.ts', `export const x = 1\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toEqual([])
  })

  it('does NOT flag SPA-side .js → .ts imports (not reachable from api/)', async () => {
    // src/components/DocxReport.js imports src/engine/bridge (which
    // is a .ts file) and that works fine because Vite handles it.
    // The scanner ignores non-API-reachable files entirely.
    await write('src/components/Widget.js', `import { x } from '../engine/util'\nexport const Widget = x\n`)
    await write('src/engine/util.ts', `export const x = 1\n`)
    // API graph touches nothing in src/components — Widget.js is
    // unreachable, so its .js→.ts import is ignored.
    await write('api/handler.ts', `export default function h(){ return 1 }\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toEqual([])
  })

  it('catches a landmine two hops deep through a TS → JS → TS chain', async () => {
    await write('api/handler.ts', `import './bootstrap'\nexport default function h(){ return 1 }\n`)
    await write('api/bootstrap.ts', `import '../src/constants/loader.js'\n`)
    await write('src/constants/loader.js', `import { renderTemplate } from '../../lib/render'\nexport default renderTemplate\n`)
    await write('lib/render.ts', `export function renderTemplate() { return 'ok' }\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toHaveLength(1)
    expect(landmines[0].importer).toBe(path.join('src', 'constants', 'loader.js'))
  })

  it('handles multi-line import bindings (the common shape)', async () => {
    await write(
      'api/handler.ts',
      `import { a } from '../src/constants/tools.js'\nexport default a\n`,
    )
    await write(
      'src/constants/tools.js',
      `import {\n  renderTemplate,\n  discoverTokens,\n} from '../../lib/render'\nexport const a = renderTemplate\n`,
    )
    await write('lib/render.ts', `export const renderTemplate = () => 1\nexport const discoverTokens = () => 2\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toHaveLength(1)
    expect(landmines[0].spec).toBe('../../lib/render')
  })

  it('ignores explicit-extension imports (.js / .ts written out)', async () => {
    // If a developer explicitly writes the .ts extension, that's a
    // different kind of error (Node will not resolve .ts) — but it's
    // visible to code review. This scanner only catches the SILENT
    // case where extension-less imports resolve to .ts files.
    await write(
      'api/handler.ts',
      `import { x } from '../src/constants/tools.js'\nexport default x\n`,
    )
    await write(
      'src/constants/tools.js',
      `import { x } from '../../lib/render.ts'\nexport { x }\n`,
    )
    await write('lib/render.ts', `export const x = 1\n`)

    const landmines = await findApiJsTsLandmines(root)
    expect(landmines).toEqual([])
  })
})

describe('findApiExtensionlessImports', () => {
  it('flags a .ts API entry importing a .ts sibling with no extension', async () => {
    // The exact shape that took production down: api/report-templates.ts
    // importing '../lib/report-templates/render'.
    await write('api/handler.ts', "import { render } from '../lib/render'\n")
    await write('lib/render.ts', 'export const render = () => 1\n')
    const found = await findApiExtensionlessImports(root)
    expect(found).toHaveLength(1)
    expect(found[0].importer).toBe(path.join('api', 'handler.ts'))
    expect(found[0].spec).toBe('../lib/render')
  })

  it('does not flag the same import once it carries .js', async () => {
    // The working pattern, already used by api/field-assistant.ts:
    // TypeScript resolves './x.js' to x.ts at compile time, Node resolves it
    // to the emitted x.js at runtime.
    await write('api/handler.ts', "import { render } from '../lib/render.js'\n")
    await write('lib/render.ts', 'export const render = () => 1\n')
    expect(await findApiExtensionlessImports(root)).toEqual([])
  })

  it('flags an extension-less import that is transitively reachable', async () => {
    // Four of the twenty-four were two hops out, in scripts/ and lib/ — a
    // per-file grep over api/ would have missed every one.
    await write('api/handler.ts', "import { run } from '../lib/a.js'\n")
    await write('lib/a.ts', "export { run } from './b'\n")
    await write('lib/b.ts', 'export const run = () => 1\n')
    const found = await findApiExtensionlessImports(root)
    expect(found).toHaveLength(1)
    expect(found[0].importer).toBe(path.join('lib', 'a.ts'))
  })

  it('ignores type-only statements, which tsc erases', async () => {
    // `import type {...} from` never reaches the runtime, so it cannot be a
    // resolution landmine and flagging it would be a false positive.
    await write('api/handler.ts', "import type { T } from '../lib/types'\nexport const x: number = 1\n")
    await write('lib/types.ts', 'export type T = string\n')
    expect(await findApiExtensionlessImports(root)).toEqual([])
  })

  it('still flags a mixed import that only marks SOME bindings as types', async () => {
    // `import { a, type B } from` emits a real import for `a`. This is the
    // shape api/events.ts and both peer-review handlers actually had.
    await write('api/handler.ts', "import { KNOWN, type T } from '../lib/types'\n")
    await write('lib/types.ts', 'export const KNOWN = 1\nexport type T = string\n')
    expect(await findApiExtensionlessImports(root)).toHaveLength(1)
  })

  it('leaves bare package specifiers alone', async () => {
    await write('api/handler.ts', "import Stripe from 'stripe'\nimport { x } from '@supabase/supabase-js'\n")
    expect(await findApiExtensionlessImports(root)).toEqual([])
  })

  it('does not reach into SPA code that no api/** entry imports', async () => {
    // Vite bundles the SPA and resolves extension-less TS transparently, so
    // the same shape there is not a runtime hazard.
    await write('api/handler.ts', "export default function h() {}\n")
    await write('src/components/Thing.jsx', "import { y } from '../utils/y'\n")
    await write('src/utils/y.ts', 'export const y = 1\n')
    expect(await findApiExtensionlessImports(root)).toEqual([])
  })

  it('is a superset of the narrow .js → .ts check', async () => {
    // Anything the original flags, this flags too — so wiring the broad check
    // first in the CLI cannot let a PR #297-shaped landmine through.
    await write('api/handler.ts', "import './mod.js'\n")
    await write('api/mod.js', "import { t } from '../lib/t'\n")
    await write('lib/t.ts', 'export const t = 1\n')
    expect(await findApiJsTsLandmines(root)).toHaveLength(1)
    expect(await findApiExtensionlessImports(root)).toHaveLength(1)
  })
})
