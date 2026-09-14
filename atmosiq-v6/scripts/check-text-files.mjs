/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * check-text-files — source files are text, and a control byte proves one is
 * not.
 *
 * ── The blind spot this closes ─────────────────────────────────────────
 * A separator byte written into source LITERALLY rather than as an escape
 * sequence makes the file binary to git. It commits as `Bin 0 -> 13470
 * bytes`, diffs as nothing at all, and is invisible to every reviewer — while
 * running perfectly, because the runtime value is identical either way.
 *
 * That is why nothing caught it. Vitest, tsc, eslint, the spelling check and
 * the acceptance runner all read such a file happily; the sole symptom is one
 * line of `git show --stat`. It has now happened three times in this
 * codebase, twice in one afternoon, and the third instance
 * (`resultsGrouping.js`) had been sitting in production under a
 * `TODO(claude)` that named the problem and left it. A defect class that
 * recurs and that no gate can see is the definition of one worth a gate.
 *
 * ── What counts, and what deliberately does not ────────────────────────
 * C0 control bytes, plus DEL, minus the three that structure a text file:
 * tab, line feed and carriage return. Nothing else is refused.
 *
 * In particular this does NOT touch invisible characters that are genuinely
 * used here, and the distinction was measured rather than assumed:
 *
 *   • ZERO WIDTH JOINER — `questions.js` builds the 🧑‍🤝‍🧑 emoji from one.
 *     Removing it changes the glyph.
 *   • ZERO WIDTH SPACE — `TextareaWithGhost.jsx` renders one so a ghost
 *     overlay keeps its final line when the text ends with a newline.
 *
 * Both are multi-byte UTF-8 rather than control bytes, so neither is in
 * scope, and a guard written from the shape of one incident rather than from
 * the rule would have refused them. (Non-breaking spaces exist in five files
 * and are left alone for the same reason: a rule about them is a different
 * rule, with a cleanup behind it, and merging the two would make this one
 * arguable.)
 *
 * ── No escape hatch, on purpose ────────────────────────────────────────
 * The spelling check has `spelling-ok` because a term list legitimately has
 * to carry both spellings. There is no equivalent here: a source file never
 * needs a raw control byte, because the escape sequence produces the same
 * value and stays readable. The one case that would need a literal — a
 * fixture proving this very check works — is built in a temp directory by
 * the test, outside the scanned tree.
 *
 * Usage:
 *   node scripts/check-text-files.mjs    # exits 1 with a report on any hit
 *   npm run lint:text                    # wired in package.json
 *
 * `findControlCharacters(rootDir)` is exported so the regression test can
 * exercise it against a fixture tree.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Bytes that structure a text file and are always allowed. */
export const ALLOWED_CONTROL_BYTES = Object.freeze([0x09, 0x0a, 0x0d])

/** Reader-facing names, so a failure says what was found rather than a number. */
export const CONTROL_NAMES = Object.freeze({
  0x00: 'NUL', 0x01: 'SOH', 0x02: 'STX', 0x03: 'ETX', 0x04: 'EOT', 0x05: 'ENQ',
  0x06: 'ACK', 0x07: 'BEL', 0x08: 'BS', 0x0b: 'VT', 0x0c: 'FF', 0x0e: 'SO',
  0x0f: 'SI', 0x10: 'DLE', 0x11: 'DC1', 0x12: 'DC2', 0x13: 'DC3', 0x14: 'DC4',
  0x15: 'NAK', 0x16: 'SYN', 0x17: 'ETB', 0x18: 'CAN', 0x19: 'EM', 0x1a: 'SUB',
  0x1b: 'ESC', 0x1c: 'FS', 0x1d: 'GS', 0x1e: 'RS', 0x1f: 'US', 0x7f: 'DEL',
})

const SCAN_DIRS = ['src', 'api', 'lib', 'components', 'pages', 'scripts', 'tests', 'docs', 'server']
const ROOT_FILES = ['CLAUDE.md', 'CHANGELOG.md', 'ARCHITECTURE.md', 'README.md']
// `server/handlers/` is bundle:api output and gitignored; it inherits whatever
// api/ says, which is scanned at the source.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.vercel', '.git', 'handlers'])
const EXT_RE = /\.(m?js|cjs|jsx|tsx?|md|json|css|html|ya?ml|sql)$/

/** Is this byte refused? */
export const isForbiddenControlByte = (b) =>
  (b < 0x20 || b === 0x7f) && !ALLOWED_CONTROL_BYTES.includes(b)

async function walk(dir, out) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (EXT_RE.test(e.name)) out.push(p)
  }
}

/**
 * Every file the check reads, relative to `rootDir`.
 *
 * This file is NOT excluded from its own sweep. The spelling check exempts
 * itself because it carries the word list it looks for; nothing here carries
 * a control byte, so exempting it would only create a place one could hide.
 */
export async function listScannedFiles(rootDir) {
  const files = []
  for (const d of SCAN_DIRS) await walk(path.join(rootDir, d), files)
  for (const f of ROOT_FILES) {
    try { await fs.access(path.join(rootDir, f)); files.push(path.join(rootDir, f)) } catch { /* absent */ }
  }
  return files.map((f) => path.relative(rootDir, f).split(path.sep).join('/')).sort()
}

/**
 * Every forbidden control byte in the scanned tree.
 *
 * Read as BYTES, never as decoded text: a decoder is exactly the layer that
 * would turn the thing being looked for into a replacement character and
 * report the file clean.
 *
 * @returns {Promise<Array<{file:string, line:number, column:number, byte:number, name:string, context:string}>>}
 */
export async function findControlCharacters(rootDir) {
  const hits = []
  for (const rel of await listScannedFiles(rootDir)) {
    const buf = await fs.readFile(path.join(rootDir, rel))
    let line = 1
    let lineStart = 0
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i]
      if (b === 0x0a) { line += 1; lineStart = i + 1; continue }
      if (!isForbiddenControlByte(b)) continue
      hits.push({
        file: rel,
        line,
        column: i - lineStart + 1,
        byte: b,
        name: CONTROL_NAMES[b] || `0x${b.toString(16).padStart(2, '0')}`,
        // The surrounding source, with the offender shown as its escape so
        // the report itself stays a text file.
        context: buf.slice(Math.max(lineStart, i - 40), i).toString('utf8').replace(/\s+/g, ' ').trim(),
      })
    }
  }
  return hits
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  findControlCharacters(process.cwd()).then((hits) => {
    if (!hits.length) {
      console.log('check-text-files: clean (no control characters in source)')
      process.exit(0)
    }
    console.error(
      `check-text-files: ${hits.length} control character${hits.length === 1 ? '' : 's'} in source.\n`
      + 'A raw control byte makes the file binary to git — it diffs as nothing and is invisible in review.\n'
      + 'Write the escape sequence instead (\\u0000, \\u0001, …); the runtime value is identical.\n',
    )
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}:${h.column}: ${h.name} after "${h.context}"`)
    }
    process.exit(1)
  }).catch((err) => {
    console.error('check-text-files: failed —', err && err.message)
    process.exit(1)
  })
}
