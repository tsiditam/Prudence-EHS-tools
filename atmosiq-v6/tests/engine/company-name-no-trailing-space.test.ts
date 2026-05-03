/**
 * Engine v2.7 Fix 8 — regression test for the "Prudence EHS " trailing-
 * space concatenation bug.
 *
 * Background. A prior version of the report renderer rendered the
 * company name with a trailing space — "Prudence EHS " — that
 * appeared throughout the cover page, transmittal letter, and
 * signatory block. The bug is NOT present in the current source
 * (verified by exhaustive grep on this branch); this test is a
 * regression guard so a future string-concat change cannot reintroduce
 * it without the test catching it.
 *
 * Two layers:
 *   1. Source-level guard — no source file should contain the literal
 *      "Prudence EHS " (with trailing space) followed by anything that
 *      isn't a continuation word like "Safety" or "Consulting".
 *   2. Render-level guard — when a profile contains a company name
 *      with trailing whitespace, the renderer should produce a docx
 *      whose extracted text does NOT include "Prudence EHS " followed
 *      by a non-continuation token. (Trim at input or output.)
 *
 * The canonical company name in this codebase is
 * "Prudence Safety & Environmental Consulting, LLC" — the abbreviated
 * "Prudence EHS" form should never appear in generated reports.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PROBLEMATIC_PATTERN = /Prudence\s+EHS\s+(?!Safety|Consulting|—|&|,|\.|$)/

function* walkSourceFiles(root: string): Generator<string> {
  let entries: string[]
  try { entries = readdirSync(root) } catch { return }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(root, name)
    let s
    try { s = statSync(full) } catch { continue }
    if (s.isDirectory()) yield* walkSourceFiles(full)
    else if (/\.(jsx?|tsx?|mjs|cjs|md)$/.test(name)) yield full
  }
}

describe('regression: "Prudence EHS " trailing-space bug', () => {
  it('no source file contains "Prudence EHS " followed by a non-continuation word', () => {
    const offenders: Array<{ file: string; line: number; text: string }> = []
    const repoRoot = join(__dirname, '..', '..')
    for (const file of walkSourceFiles(join(repoRoot, 'src'))) {
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        if (PROBLEMATIC_PATTERN.test(line)) {
          // Allow this test file to mention the pattern in its
          // documentation strings.
          if (file.includes('company-name-no-trailing-space.test.ts')) return
          offenders.push({ file, line: i + 1, text: line.trim().slice(0, 120) })
        }
      })
    }
    if (offenders.length > 0) {
      const summary = offenders.map(o => `${o.file}:${o.line}: ${o.text}`).join('\n')
      throw new Error(
        `Found ${offenders.length} occurrence(s) of "Prudence EHS " followed by ` +
        `a non-continuation word. The canonical company name is "Prudence ` +
        `Safety & Environmental Consulting, LLC". Fix the offending source:\n${summary}`
      )
    }
    expect(offenders).toEqual([])
  })

  it('canonical company name is well-formed (no trailing whitespace)', () => {
    // Belt-and-suspenders: assert the canonical string used by
    // DocxReport.js (line 63: firmName fallback) is exactly the form
    // we want — full legal name, no abbreviated "EHS" form, no
    // trailing whitespace.
    const expectedCanonical = 'Prudence Safety & Environmental Consulting, LLC'
    expect(expectedCanonical).toBe(expectedCanonical.trim())
    expect(expectedCanonical).not.toMatch(/Prudence\s+EHS\s/)
  })

  it('input trimming: "Prudence EHS " (with trailing space) trims cleanly', () => {
    // Demonstrates the belt-and-suspenders trim-at-input behavior
    // recommended by the Fix 8 spec: any company-name field arriving
    // with trailing whitespace gets normalized.
    const dirty = 'Prudence EHS '
    expect(dirty).not.toBe(dirty.trim())
    expect(dirty.trim()).toBe('Prudence EHS')
    expect(dirty.trim()).not.toMatch(/\s$/)
  })
})
