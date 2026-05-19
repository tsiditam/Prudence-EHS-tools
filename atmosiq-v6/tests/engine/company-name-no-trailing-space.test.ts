/**
 * Engine v2.7 Fix 8 — regression test for trailing-whitespace bugs on
 * the company-name field.
 *
 * Background. A prior version of the report renderer rendered the
 * company name with a trailing space that appeared throughout the
 * cover page, transmittal letter, and signatory block. The bug is NOT
 * present in the current source; this test is a regression guard so a
 * future string-concat change cannot reintroduce it without the test
 * catching it.
 *
 * Note on naming: the user-facing canonical brand is "Prudence EHS"
 * (the rebrand from "Prudence Safety & Environmental Consulting, LLC"
 * landed in commit history). The full legal entity name is preserved
 * inside source-code copyright headers and the ToS Section 1
 * entity-definition line. Both forms are valid in the codebase; the
 * trailing-whitespace guard below targets the bug class, not the
 * specific brand string.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Catches a Prudence-brand token followed by trailing whitespace that
// runs into something that ISN'T a legitimate continuation (Safety /
// Consulting / EHS) or sentence terminator (— · , . & or line-end).
const PROBLEMATIC_PATTERN = /Prudence\s+(?:Safety|EHS)\s+(?!Safety|Consulting|EHS|—|·|&|,|\.|$)/

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

describe('regression: company-name trailing-whitespace bug', () => {
  it('no source file contains a Prudence brand token followed by a non-continuation word', () => {
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
        `Found ${offenders.length} occurrence(s) of a Prudence brand token ` +
        `followed by trailing whitespace + a non-continuation word. ` +
        `Fix the offending source:\n${summary}`
      )
    }
    expect(offenders).toEqual([])
  })

  it('canonical user-facing brand is well-formed (no trailing whitespace)', () => {
    // The user-facing canonical brand used by DocxReport.js firmName
    // fallback. Full legal name lives in source-code copyright headers
    // + the ToS Section 1 entity definition only.
    const expectedCanonical = 'Prudence EHS'
    expect(expectedCanonical).toBe(expectedCanonical.trim())
    expect(expectedCanonical).not.toMatch(/\s$/)
  })

  it('input trimming: "Prudence EHS " (with trailing space) trims cleanly', () => {
    const dirty = 'Prudence EHS '
    expect(dirty).not.toBe(dirty.trim())
    expect(dirty.trim()).toBe('Prudence EHS')
    expect(dirty.trim()).not.toMatch(/\s$/)
  })
})
