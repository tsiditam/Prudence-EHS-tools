/**
 * DOCX typography — one face, named in one place.
 *
 * OOXML has no font stack. `w:rFonts` names a single family and a reader
 * without it substitutes something of its own choosing, so which family the
 * document names is the only control we have over how it looks on someone
 * else's machine. That makes the font token load-bearing, and makes a module
 * that hardcodes a family around it a real defect rather than untidiness:
 * before this change, two watermark modules named "Inter" directly and would
 * have kept rendering in it inside an otherwise-Aptos document.
 *
 * These tests are a source scan rather than a render check because that is
 * where the failure actually lives — a hardcoded family produces a perfectly
 * valid document that simply looks wrong on the recipient's screen, which no
 * output assertion would catch.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FONTS } from '../../src/components/docx/styles'
import { CHART_FONT } from '../../src/utils/monitoringChart'

const DOCX_DIR = join(process.cwd(), 'src/components/docx')
const sources = readdirSync(DOCX_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, text: readFileSync(join(DOCX_DIR, f), 'utf8') }))

describe('the body face', () => {
  it('is Aptos — a family the reader already has', () => {
    // Word ships Aptos with Microsoft 365; it does not ship Inter. Naming a
    // face the reader lacks guarantees a substitution we do not control.
    expect(FONTS.body).toBe('Aptos')
  })

  it('is the only family any DOCX module names', () => {
    // A quoted font family anywhere but styles.js means some run in the
    // document will silently disagree with the rest of it.
    const offenders = []
    sources.forEach(({ file, text }) => {
      if (file === 'styles.js') return
      const matches = text.match(/font:\s*'[^']+'/g) || []
      matches.forEach((m) => offenders.push(`${file}: ${m}`))
    })
    expect(offenders, `hardcoded font family — use FONTS.body instead:\n${offenders.join('\n')}`).toEqual([])
  })

  it('is what the document actually defaults to', () => {
    // The style default catches every run that names no font of its own, so
    // it has to agree with the token or half the document drifts.
    const styles = readFileSync(join(DOCX_DIR, 'styles.js'), 'utf8')
    expect(styles).toMatch(/run:\s*\{\s*font:\s*FONTS\.body/)
  })
})

describe('the figure', () => {
  it('leads with the same face as the document it is embedded in', () => {
    // The chart is rasterized and sits on the page beside body text. A
    // different family reads as two documents spliced together.
    expect(CHART_FONT.split(',')[0].trim()).toBe(FONTS.body)
  })

  it('still falls back, because a canvas CAN take a stack', () => {
    // Unlike w:rFonts, this resolves in a browser — so unlike the document,
    // the figure degrades gracefully rather than to the reader's default.
    const stack = CHART_FONT.split(',').map((s) => s.trim())
    expect(stack.length).toBeGreaterThan(2)
    expect(stack[stack.length - 1]).toBe('sans-serif')
  })
})
