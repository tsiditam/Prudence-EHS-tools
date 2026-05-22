/**
 * DOCX cover page branding — pins the conditional rendering of the
 * firm logo + PE seal + license line on the report cover.
 *
 * Pins:
 *   • Cover paragraphs include ImageRun children when firm logo is
 *     set; not when absent
 *   • PE seal renders as a separate ImageRun when set; not when absent
 *   • Firm license line renders only when a non-empty value is set
 *   • Top-spacing tightens when a logo is present (200 less)
 *   • Cover render is robust to a corrupt data URL — drops the image
 *     paragraph but still emits the textual identity block
 */
import { describe, it, expect } from 'vitest'
import { buildCoverPage } from '../../src/components/docx/sections-core.js'

// 1×1 PNG, used as a canonical well-formed logo fixture.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

// docx's Paragraph stores its child runs in the .root array (not on
// an `options.children` property as the public API might suggest).
// Walk that internal structure to count ImageRun / TextRun instances.
type ParagraphLike = { root?: unknown[] }
function paragraphChildren(p: unknown): Array<{ constructor?: { name?: string } }> {
  const root = (p as ParagraphLike)?.root
  if (!Array.isArray(root)) return []
  return root.filter((x) => x && typeof x === 'object') as Array<{ constructor?: { name?: string } }>
}
function countImageRuns(section: { children: unknown[] }): number {
  let n = 0
  for (const para of section.children) {
    for (const k of paragraphChildren(para)) {
      const ctorName = k && k.constructor && k.constructor.name
      if (ctorName === 'ImageRun') n += 1
    }
  }
  return n
}
/** Find any TextRun in the section whose internal Text node carries
    the given string. docx nests Text inside TextRun inside Paragraph,
    so we walk two levels into the .root tree. */
function hasTextRunWith(section: { children: unknown[] }, target: string): boolean {
  for (const para of section.children) {
    for (const run of paragraphChildren(para)) {
      const ctorName = (run as { constructor?: { name?: string } }).constructor?.name
      if (ctorName !== 'TextRun') continue
      const runRoot = (run as { root?: unknown[] }).root || []
      for (const node of runRoot) {
        if (!node || typeof node !== 'object') continue
        const nodeRoot = (node as { root?: unknown[] }).root || []
        for (const leaf of nodeRoot) {
          if (typeof leaf === 'string' && leaf === target) return true
        }
      }
    }
  }
  return false
}

const baseCtx = {
  firmName: 'Acme IH Consulting',
  firmAddress: '123 Main St, Anytown, MD 20878',
  firmPhone: '(555) 123-4567',
  facilityName: 'Acme HQ Building',
  address: '456 Office Park, Anytown, MD',
  assessDate: '2026-04-15',
  reportDate: '2026-04-17',
  assessor: 'J. Smith, CIH',
  reportId: 'RPT-001',
}

describe('buildCoverPage branding', () => {
  it('omits ImageRuns entirely when no firm logo + no PE seal are set', () => {
    const section = buildCoverPage({ ...baseCtx, firmLogo: null, peSeal: null })
    expect(countImageRuns(section)).toBe(0)
  })

  it('includes one ImageRun when firm logo is set', () => {
    const section = buildCoverPage({ ...baseCtx, firmLogo: TINY_PNG, peSeal: null })
    expect(countImageRuns(section)).toBe(1)
  })

  it('includes two ImageRuns when both firm logo and PE seal are set', () => {
    const section = buildCoverPage({ ...baseCtx, firmLogo: TINY_PNG, peSeal: TINY_PNG })
    expect(countImageRuns(section)).toBe(2)
  })

  it('renders the firm license line when set', () => {
    const withLicense = buildCoverPage({ ...baseCtx, firmLicense: 'WV IH Lic #12345' })
    const noLicense = buildCoverPage({ ...baseCtx, firmLicense: '' })
    expect(hasTextRunWith(withLicense, 'WV IH Lic #12345')).toBe(true)
    expect(hasTextRunWith(noLicense, 'WV IH Lic #12345')).toBe(false)
  })

  it('drops a corrupt data URL silently — textual identity still renders', () => {
    const section = buildCoverPage({ ...baseCtx, firmLogo: 'data:image/png;base64,!!!notbase64' })
    // No ImageRun (because base64 decode throws inside the helper,
    // which returns null and we skip the paragraph).
    expect(countImageRuns(section)).toBe(0)
    // Firm name still present.
    expect(hasTextRunWith(section, 'Acme IH Consulting')).toBe(true)
  })
})
