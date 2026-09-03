/**
 * Tests for scripts/api-boot-check.mjs — the `api_boot` acceptance check.
 *
 * The check exists because of the CHANGELOG incident: 24 extension-less
 * imports in the API graph took every affected route to 500 at cold start
 * while vitest, lint, typecheck and the grep gates were all green. These
 * tests pin the failure modes the check must catch, on isolated fixture
 * trees:
 *
 *   • an extension-less relative ESM import (the incident shape) FAILS,
 *     even though esbuild alone would happily resolve `./_helper` → `_helper.ts`
 *   • an import of a file that does not exist FAILS
 *   • a module that throws at import time FAILS
 *   • an entry whose default export is not a function FAILS
 *   • a well-formed CJS handler and a well-formed TS handler PASS, and
 *     `require()` of an extension-less helper (CommonJS semantics) is fine
 *   • `_`-prefixed helpers and nested directories are handled like
 *     scripts/bundle-api.mjs does
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { checkApiBoot } from '../../scripts/api-boot-check.mjs'

let root: string

async function write(rel: string, content: string) {
  const full = path.join(root, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf8')
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-boot-'))
  await fs.mkdir(path.join(root, 'api'), { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('api_boot check', () => {
  it('passes a well-formed CommonJS handler and a well-formed TypeScript handler', async () => {
    await write('api/_audit.js', "module.exports = { auditLog: () => 'ok' }\n")
    await write('api/credits.js', [
      "const { auditLog } = require('./_audit')",
      'module.exports = async function handler(req, res) { return res.status(200).json({ ok: auditLog() }) }',
      '',
    ].join('\n'))
    await write('api/_cron-auth.ts', 'export function requireCronSecret(): boolean { return true }\n')
    await write('api/profile/mark-onboarded.ts', [
      "import { requireCronSecret } from '../_cron-auth.js'",
      'export default async function handler(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {',
      '  res.status(200).json({ ok: requireCronSecret() })',
      '}',
      '',
    ].join('\n'))

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(results.map(r => r.entry)).toEqual(['api/credits.js', 'api/profile/mark-onboarded.ts'])
    expect(ok).toBe(true)
  }, 30_000)

  it('FAILS on an extension-less relative import that esbuild alone would resolve (the incident shape)', async () => {
    await write('api/_helper.ts', 'export const helper = () => 1\n')
    await write('api/broken.ts', [
      "import { helper } from './_helper'",
      'export default async function handler() { return helper() }',
      '',
    ].join('\n'))

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results).toHaveLength(1)
    expect(results[0].entry).toBe('api/broken.ts')
    expect(results[0].detail).toMatch(/extension-less relative import '\.\/_helper'/)
  }, 30_000)

  it('FAILS on an import of a file that does not exist', async () => {
    await write('api/missing.js', [
      "const { nope } = require('./nope.js')",
      'module.exports = async function handler() { return nope() }',
      '',
    ].join('\n'))

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results[0].detail).toMatch(/bundle failed/)
  }, 30_000)

  it('FAILS on a handler that throws at import time', async () => {
    await write('api/throws.js', [
      "throw new Error('boom at module scope')",
      'module.exports = async function handler() {}',
      '',
    ].join('\n'))

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results[0].detail).toMatch(/import failed: boom at module scope/)
  }, 30_000)

  it('FAILS on an entry whose default export is not a function', async () => {
    await write('api/config-only.ts', 'export const config = { runtime: "nodejs" }\nexport default { notAHandler: true }\n')

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results[0].detail).toMatch(/default export is object, expected a handler function/)
  }, 30_000)

  it('reports one result per entry so a single bad route does not hide the good ones', async () => {
    await write('api/good.js', 'module.exports = async function handler() {}\n')
    await write('api/bad.ts', "import { x } from './_x'\nexport default () => x\n")
    await write('api/_x.ts', 'export const x = 1\n')

    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results.find(r => r.entry === 'api/good.js')?.ok).toBe(true)
    expect(results.find(r => r.entry === 'api/bad.ts')?.ok).toBe(false)
  }, 30_000)

  it('fails, rather than passes vacuously, when there are no api entries at all', async () => {
    const { ok, results } = await checkApiBoot({ rootDir: root, outDir: '.api-boot-out' })
    expect(ok).toBe(false)
    expect(results[0].detail).toMatch(/no api\/\*\* entries/)
  })
})
