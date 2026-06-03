// @vitest-environment node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Heavy-dep isolation guard. Compiles the Marlow endpoint with esbuild
 * (matching Vercel's bundle shape) and asserts the output contains NO
 * docxtemplater / pizzip / report-renderer symbols — keeping the assistant
 * hot path lean. (DOCX rendering lives only in the dedicated render endpoint,
 * Phase 4.) Also confirms the manifest IS bundled in (positive control).
 */

import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import path from 'node:path'

const ENTRY = path.resolve(__dirname, '../../api/water-assistant.ts')

async function bundleText(): Promise<string> {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  })
  return result.outputFiles.map((f) => f.text).join('\n')
}

describe('api/water-assistant bundle', () => {
  it('contains no heavy DOCX dependencies', async () => {
    const out = await bundleText()
    expect(out).not.toMatch(/docxtemplater/)
    expect(out).not.toMatch(/pizzip/)
    expect(out).not.toMatch(/report-templates\/render/)
  }, 30_000)

  it('bundles the hardcoded standards manifest (positive control)', async () => {
    const out = await bundleText()
    // A value that only exists in standards.js — proves the manifest is wired in.
    expect(out).toMatch(/STANDARDS_MANIFEST|Lead and Copper Rule|Action Level/)
  }, 30_000)
})
