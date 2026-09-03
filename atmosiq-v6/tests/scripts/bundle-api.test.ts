/**
 * Tests for scripts/bundle-api.mjs — the container build step that turns
 * every api/** entry into plain-Node ESM under server/handlers/.
 *
 * Pins:
 *   • discovery: recursive, .js + .ts, `_`-prefixed helpers and dirs
 *     skipped, test files skipped, sorted
 *   • route mapping: api/profile/mark-onboarded.ts → profile/mark-onboarded
 *   • output: one .mjs per entry mirroring the tree, importable under plain
 *     Node with a function default export, CJS `module.exports.config`
 *     preserved as a property of the default export
 *   • lib/sentry.ts is bundled to `_sentry.mjs` when present, and its
 *     absence is not fatal
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

import { listApiEntries, routeForEntry, bundleApi } from '../../scripts/bundle-api.mjs'

let root: string

async function write(rel: string, content: string) {
  const full = path.join(root, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content, 'utf8')
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-api-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('listApiEntries', () => {
  it('walks api/ recursively, skipping _helpers, _dirs and test files, sorted', async () => {
    await write('api/webhook.js', '')
    await write('api/_audit.js', '')
    await write('api/_cron-auth.ts', '')
    await write('api/credits.test.ts', '')
    await write('api/types.d.ts', '')
    await write('api/profile/mark-onboarded.ts', '')
    await write('api/_internal/secret.ts', '')
    await write('api/marketing-agent/chat.js', '')
    await write('api/notes.md', '')

    expect(await listApiEntries(root)).toEqual([
      'api/marketing-agent/chat.js',
      'api/profile/mark-onboarded.ts',
      'api/webhook.js',
    ])
  })

  it('returns an empty list when api/ is absent', async () => {
    expect(await listApiEntries(root)).toEqual([])
  })
})

describe('routeForEntry', () => {
  it('strips the api/ prefix and the extension, keeping nested directories', () => {
    expect(routeForEntry('api/credits.js')).toBe('credits')
    expect(routeForEntry('api/profile/mark-onboarded.ts')).toBe('profile/mark-onboarded')
  })
})

describe('bundleApi', () => {
  it('emits one importable .mjs per entry mirroring the tree, plus _sentry.mjs', async () => {
    await write('api/_audit.js', "module.exports = { auditLog: () => 'logged' }\n")
    await write('api/webhook.js', [
      "const { auditLog } = require('./_audit')",
      'async function handler(req, res) { return res.status(200).json({ ok: auditLog() }) }',
      'module.exports = handler',
      'module.exports.config = { api: { bodyParser: false } }',
      '',
    ].join('\n'))
    await write('api/profile/mark-onboarded.ts', [
      "import { gate } from '../../lib/gate.js'",
      'export default async function handler(): Promise<boolean> { return gate() }',
      '',
    ].join('\n'))
    await write('lib/gate.ts', 'export function gate(): boolean { return true }\n')
    await write('lib/sentry.ts', 'let inited = false\nexport function initSentryServer(): void { inited = true }\nexport function isInited(): boolean { return inited }\n')

    const { outDir, entries, sentry } = await bundleApi({ rootDir: root, outDir: 'server/handlers' })

    expect(outDir).toBe(path.join(root, 'server', 'handlers'))
    expect(entries.map(e => e.route)).toEqual(['profile/mark-onboarded', 'webhook'])
    expect(sentry).toBe(path.join(outDir, '_sentry.mjs'))

    const webhook = await import(pathToFileURL(path.join(outDir, 'webhook.mjs')).href)
    expect(typeof webhook.default).toBe('function')
    expect(webhook.default.config).toEqual({ api: { bodyParser: false } })

    const nested = await import(pathToFileURL(path.join(outDir, 'profile', 'mark-onboarded.mjs')).href)
    expect(typeof nested.default).toBe('function')
    await expect(nested.default()).resolves.toBe(true)

    const sentryMod = await import(pathToFileURL(sentry as string).href)
    expect(typeof sentryMod.initSentryServer).toBe('function')

    // No stray helper output: _audit.js is inlined, not emitted.
    const files = await fs.readdir(outDir)
    expect(files.sort()).toEqual(['_sentry.mjs', 'profile', 'webhook.mjs'])
  }, 30_000)

  it('is not fatal when lib/sentry.ts is absent', async () => {
    await write('api/ping.js', 'module.exports = async () => {}\n')
    const { entries, sentry } = await bundleApi({ rootDir: root, outDir: 'out' })
    expect(entries).toHaveLength(1)
    expect(sentry).toBeNull()
  }, 30_000)

  it('clears stale output from a previous run', async () => {
    await write('server/handlers/stale.mjs', 'export default () => {}\n')
    await write('api/ping.js', 'module.exports = async () => {}\n')
    const { outDir } = await bundleApi({ rootDir: root, outDir: 'server/handlers' })
    const files = await fs.readdir(outDir)
    expect(files).not.toContain('stale.mjs')
  }, 30_000)
})
