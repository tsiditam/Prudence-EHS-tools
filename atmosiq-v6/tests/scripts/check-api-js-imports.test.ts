/**
 * Regression tests for scripts/check-api-js-imports.mjs.
 *
 * Pins the contract that would have caught PR #297's production
 * crash before it shipped:
 *
 *   • API-reachable `.js` file → `.ts` import (the bug) is flagged
 *   • API-reachable `.js` file → `.js` import is NOT flagged
 *   • API-reachable `.ts` file → `.ts` import is NOT flagged
 *     (TS bundlers handle that fine; only the .js importer was a problem)
 *   • Non-API-reachable `.js` file → `.ts` import is NOT flagged
 *     (Vite-bundled SPA code can resolve TS extensions transparently)
 *   • The graph walk follows `.ts` → `.js` → `.ts` chains, so a
 *     landmine two hops deep from a TS API entry is still caught
 *
 * Each test builds an isolated fixture tree in a tmp dir, runs the
 * pure `findApiJsTsLandmines(rootDir)` export, and asserts the
 * landmine list.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { findApiJsTsLandmines } from '../../scripts/check-api-js-imports.mjs'

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
