/**
 * check-text-files — the guard that closes a blind spot every other gate had.
 *
 * A raw control byte in source makes the file binary to git: it diffs as
 * nothing, reviews as nothing, and runs perfectly, because the escape
 * sequence and the literal byte produce the same value. Vitest, tsc, eslint,
 * the spelling check and the acceptance runner all read such a file happily.
 *
 * So this suite does two things. It proves the checker BITES on a deliberately
 * broken fixture tree, which is the only way to know a guard works. And it
 * proves the checker does not bite on the invisible characters this codebase
 * legitimately uses — a zero-width joiner inside an emoji, a zero-width space
 * that holds a ghost overlay's last line — because a guard written from the
 * shape of one incident rather than from the rule would refuse both.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  findControlCharacters, listScannedFiles, isForbiddenControlByte,
  ALLOWED_CONTROL_BYTES, CONTROL_NAMES,
} from '../../scripts/check-text-files.mjs'

let root = ''

/**
 * A control character, BUILT rather than written.
 *
 * The first draft of this file wrote `\u0000` as an escape and the escape
 * became a literal byte on the way to disk, so the suite proving control
 * bytes are refused contained five of them. The checker caught its own
 * test, which is the best evidence available that it works, and the lesson
 * is the rule: never write a control escape into source, construct it.
 */
const ctl = (code: number) => String.fromCharCode(code)
const NUL = ctl(0)

/** Write a fixture file, bytes exactly as given. */
async function put(rel: string, content: string | Buffer) {
  const full = path.join(root, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, content)
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'text-files-'))
})
afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
})

describe('it bites on a control byte, wherever the byte is', () => {
  it('finds a NUL and says exactly where', async () => {
    // The real defect, three times over in this codebase: a separator written
    // as the byte instead of the escape.
    await put('src/hash.js', Buffer.from("const key = `${a}" + NUL + "${b}`\n", 'utf8'))
    const hits = await findControlCharacters(root)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ file: 'src/hash.js', line: 1, name: 'NUL', byte: 0 })
    expect(hits[0].column).toBeGreaterThan(10)
    // The report quotes the source leading up to it, so the line is findable.
    expect(hits[0].context).toContain('const key')
  })

  it('reports the right line after several newlines', async () => {
    await put('src/hash.js', Buffer.from('a\nb\nc\n' + ctl(1) + 'x\n', 'utf8'))
    const hits = await findControlCharacters(root)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ line: 4, column: 1, name: 'SOH' })
  })

  it('finds every forbidden byte, not just NUL', async () => {
    const forbidden = [0x00, 0x01, 0x07, 0x0b, 0x0c, 0x1b, 0x1f, 0x7f]
    await put('src/hash.js', Buffer.from(forbidden.map((b) => `x${String.fromCharCode(b)}\n`).join(''), 'latin1'))
    const hits = await findControlCharacters(root)
    expect(hits.map((h: any) => h.byte)).toEqual(forbidden)
    for (const h of hits) expect(CONTROL_NAMES[h.byte]).toBe(h.name)
  })

  it('scans every directory the project authors, not only src', async () => {
    await fs.rm(path.join(root, 'src'), { recursive: true, force: true })
    for (const rel of ['api/x.js', 'lib/y.ts', 'scripts/z.mjs', 'tests/engine/a.ts', 'docs/b.md', 'server/c.js']) {
      await put(rel, Buffer.from('ok' + NUL + '\n', 'utf8'))
    }
    const hits = await findControlCharacters(root)
    expect(hits.map((h: any) => h.file).sort()).toEqual([
      'api/x.js', 'docs/b.md', 'lib/y.ts', 'scripts/z.mjs', 'server/c.js', 'tests/engine/a.ts',
    ])
  })
})

describe('it leaves alone what a text file legitimately contains', () => {
  beforeAll(async () => {
    await fs.rm(path.join(root, 'api'), { recursive: true, force: true })
    await fs.rm(path.join(root, 'lib'), { recursive: true, force: true })
    await fs.rm(path.join(root, 'scripts'), { recursive: true, force: true })
    await fs.rm(path.join(root, 'tests'), { recursive: true, force: true })
    await fs.rm(path.join(root, 'docs'), { recursive: true, force: true })
    await fs.rm(path.join(root, 'server'), { recursive: true, force: true })
  })

  it('allows tab, newline and carriage return', async () => {
    await put('src/ok.js', Buffer.from('a\tb\r\nc\n', 'utf8'))
    expect(await findControlCharacters(root)).toEqual([])
    for (const b of ALLOWED_CONTROL_BYTES) expect(isForbiddenControlByte(b)).toBe(false)
  })

  it('allows the zero-width characters this codebase actually uses', async () => {
    // A guard written from the shape of the incident would have refused both
    // of these. They are multi-byte UTF-8, not control bytes, and removing
    // either changes what renders.
    await put('src/ok.js', Buffer.from(
      // The ZWJ emoji from questions.js, and the ZWSP from TextareaWithGhost.
      "const ic = '\u{1F9D1}‍\u{1F91D}‍\u{1F9D1}'\nconst pad = '​'\n", 'utf8',
    ))
    expect(await findControlCharacters(root)).toEqual([])
  })

  it('allows the accented and symbol characters the reports are full of', async () => {
    await put('src/ok.js', Buffer.from("const u = 'µg/m³ — CO₂ 1385 ppm · 76.8°F'\n", 'utf8'))
    expect(await findControlCharacters(root)).toEqual([])
  })

  it('ignores files it has no business reading', async () => {
    await put('src/data.bin', Buffer.from([0x00, 0x01, 0x02]))
    await put('src/node_modules/dep/x.js', Buffer.from('a' + NUL + 'b\n', 'utf8'))
    await put('dist/bundle.js', Buffer.from('a' + NUL + 'b\n', 'utf8'))
    expect(await findControlCharacters(root)).toEqual([])
  })
})

describe('it is wired, and it holds over the real tree', () => {
  it('runs as part of npm run lint', async () => {
    const pkg = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    expect(pkg.scripts['lint:text']).toBe('node scripts/check-text-files.mjs')
    expect(pkg.scripts.lint).toContain('lint:text')
  })

  it('does not exempt itself, so there is nowhere to hide one', async () => {
    // The spelling check exempts its own file because it carries the word
    // list it searches for. Nothing here carries a control byte, so an
    // exemption would only create a blind spot inside the guard.
    const files = await listScannedFiles(path.resolve(new URL('../..', import.meta.url).pathname))
    expect(files).toContain('scripts/check-text-files.mjs')
    expect(files).toContain('tests/scripts/check-text-files.test.ts')
  })

  it('passes over the whole repository right now', async () => {
    const repo = path.resolve(new URL('../..', import.meta.url).pathname)
    const hits = await findControlCharacters(repo)
    expect(
      hits.map((h: any) => `${h.file}:${h.line}:${h.column} ${h.name}`),
      'a source file carries a raw control byte; write the escape sequence instead',
    ).toEqual([])
  })
})
