/**
 * Regression tests for scripts/check-spelling.mjs, and the guard itself.
 *
 * A report read "Odour:" three lines above "odors" (2026-09). The sweep
 * that fixed it is worthless without something that fails the next time,
 * so the last case here runs the checker over the real repository — the
 * convention is enforced by `npm test` as well as by `npm run lint`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// @ts-ignore js
import { findBritishSpellings, listScannedFiles, BRITISH_TO_AMERICAN, ALLOW_MARKER } from '../../scripts/check-spelling.mjs'

const REPO = path.resolve(__dirname, '..', '..')

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'spelling-check-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(rel: string, contents: string) {
  const abs = path.join(root, rel)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await fs.writeFile(abs, contents, 'utf8')
}

describe('findBritishSpellings', () => {
  it('names the file, line, word and the American form', async () => {
    await write('src/report/model.js', `const a = 1\nout.push(\`Odour: \${x}\`) // the colour of it\n`)
    const hits = await findBritishSpellings(root)
    expect(hits.map(h => [h.file, h.line, h.word, h.replacement])).toEqual([
      ['src/report/model.js', 2, 'Odour', 'Odor'],
      ['src/report/model.js', 2, 'colour', 'color'],
    ])
  })

  it('preserves case on the first letter and for all-caps', async () => {
    await write('docs/NOTES.md', `Labelled. LABELLED. labelled.\n`)
    const hits = await findBritishSpellings(root)
    expect(hits.map(h => h.replacement)).toEqual(['Labeled', 'LABELED', 'labeled'])
  })

  it('matches exact forms only — never a stem', async () => {
    await write('src/x.js', `characteristic synthesis emphasis promise enterprise realistic analysis premise\n`)
    expect(await findBritishSpellings(root)).toEqual([])
  })

  it('leaves accepted American variants and contract values alone', async () => {
    await write('api/checkout.js', `cancel_url: \`\${u}?checkout=cancelled\` // judgement, acknowledgement, towards\n`)
    expect(await findBritishSpellings(root)).toEqual([])
  })

  it(`skips a line marked ${ALLOW_MARKER}`, async () => {
    await write('src/terms.js', `const terms = ['grey water', 'gray water'] // ${ALLOW_MARKER}: matches both spellings of user input\nconst c = 'colour'\n`)
    const hits = await findBritishSpellings(root)
    expect(hits.map(h => [h.line, h.word])).toEqual([[2, 'colour']])
  })

  it('scans source, tests, docs, acceptance JSON and the root Markdown, and skips build output', async () => {
    await write('src/a.jsx', 'behaviour\n')
    await write('tests/b.test.ts', 'centre\n')
    await write('docs/c.md', 'catalogue\n')
    await write('scripts/acceptance/d.json', '{"pattern":"mouldy basement"}\n')
    await write('CLAUDE.md', 'optimises\n')
    await write('node_modules/x/e.js', 'colour\n')
    await write('dist/f.js', 'colour\n')
    await write('src/g.png.txt', 'colour\n')
    const files = await listScannedFiles(root)
    expect(files).toEqual(['CLAUDE.md', 'docs/c.md', 'scripts/acceptance/d.json', 'src/a.jsx', 'tests/b.test.ts'])
    expect((await findBritishSpellings(root)).map(h => h.word)).toEqual(['optimises', 'catalogue', 'mouldy', 'behaviour', 'centre'])
  })

  it('every entry maps a British form to a different American form', () => {
    for (const [b, a] of Object.entries(BRITISH_TO_AMERICAN)) {
      expect(a, b).not.toBe(b)
      expect(b).toMatch(/^[a-z]+$/)
      expect(a).toMatch(/^[a-z]+$/)
    }
  })
})

describe('the repository is written in American English', () => {
  it('has no British spelling in source, tests, docs, acceptance configs or CLAUDE.md', async () => {
    const hits = await findBritishSpellings(REPO)
    const report = hits.map(h => `${h.file}:${h.line}: "${h.word}" → "${h.replacement}"`).join('\n')
    expect(hits, `British spellings found:\n${report}`).toEqual([])
  }, 30_000)
})
