/**
 * Architectural test — the Jasper hot path must NOT bundle docxtemplater
 * or pizzip.
 *
 * PR #297 shipped a regression that crashed every Jasper turn in
 * production because `field-assistant-tools.js` statically imported
 * `lib/report-templates/render.ts` (which pulls docxtemplater + pizzip).
 * PR #298 fixed the .js → .ts resolution surface symptom. After the
 * fix, the renderer was still imported by `api/field-assistant.ts`
 * directly — pulling docxtemplater + pizzip into every Jasper
 * cold-start. The architectural rule we now enforce:
 *
 *   /api/field-assistant must stay LEAN. Heavy DOCX dependencies
 *   live ONLY in the dedicated /api/report-templates-render endpoint.
 *   The Jasper dispatcher returns a render proposal; the client
 *   invokes the render endpoint itself (mirrors propose_action).
 *
 * This test reads the Vercel-shape ESM bundle for the handler and
 * asserts no docxtemplater / pizzip / report-templates/render symbol
 * appears in the output. Any future PR that re-imports the renderer
 * from the field-assistant module will fail this test before merge.
 */

import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import * as esbuild from 'esbuild'
import path from 'node:path'

async function bundleHandler(entry: string): Promise<string> {
  const tmp = path.join(
    process.env.TMPDIR || '/tmp',
    `bundle-${path.basename(entry, path.extname(entry))}-${Date.now()}.mjs`,
  )
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: { js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);' },
    outfile: tmp,
    logLevel: 'silent',
  })
  const src = await fs.readFile(tmp, 'utf8')
  await fs.unlink(tmp).catch(() => {})
  return src
}

describe('Jasper hot-path bundle', () => {
  it('does NOT pull docxtemplater into /api/field-assistant', { timeout: 30_000 }, async () => {
    const bundle = await bundleHandler('api/field-assistant.ts')
    // The package name appears in any bundled module — bytes or
    // comments — when esbuild walks the import graph.
    expect(bundle).not.toMatch(/\bdocxtemplater\b/)
  })

  it('does NOT pull pizzip into /api/field-assistant', { timeout: 30_000 }, async () => {
    const bundle = await bundleHandler('api/field-assistant.ts')
    expect(bundle).not.toMatch(/\bpizzip\b/i)
  })

  it('does NOT pull lib/report-templates/render into /api/field-assistant', { timeout: 30_000 }, async () => {
    const bundle = await bundleHandler('api/field-assistant.ts')
    expect(bundle).not.toMatch(/report-templates\/render/)
    // Belt-and-suspenders: the renderer's exported symbol shouldn't
    // appear either.
    expect(bundle).not.toMatch(/renderTemplate/)
  })

  // Positive control — the dedicated render endpoint SHOULD bundle
  // the renderer. This guards against the opposite mistake (decoupling
  // too aggressively and breaking the render path).
  it('DOES pull docxtemplater into /api/report-templates-render', { timeout: 30_000 }, async () => {
    const bundle = await bundleHandler('api/report-templates-render.ts')
    expect(bundle).toMatch(/\bdocxtemplater\b/)
    expect(bundle).toMatch(/renderTemplate/)
  })
})
