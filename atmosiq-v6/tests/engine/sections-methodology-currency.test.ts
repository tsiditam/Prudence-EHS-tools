/**
 * "Additional Criteria Considered" DOCX section — surface contract.
 *
 * Light renderer smoke. The criteria-selection content + citation
 * provenance are exercised in detail in contextual-standards.test.ts;
 * this file pins that the section renders, carries the reader-facing
 * heading, emits one block per applicable entry, and — the part that
 * matters for placement — returns null rather than an empty heading
 * when the assessment engages none of the entries.
 */
import { describe, it, expect } from 'vitest'
import { Paragraph } from 'docx'
import {
  buildMethodologyCurrency,
  ADDITIONAL_CRITERIA_TITLE,
} from '../../src/components/docx/sections-methodology-currency.js'
import { CONTEXTUAL_STANDARDS } from '../../src/engines/contextualStandards.js'

function flatten(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const anyNode = node as { root?: unknown[]; options?: Record<string, unknown> }
  let acc = ''
  if (anyNode.options && typeof anyNode.options.text === 'string') {
    acc += anyNode.options.text + ' '
  }
  if (Array.isArray(anyNode.root)) {
    for (const child of anyNode.root) acc += flatten(child)
  }
  return acc
}

// The builder returns a body-only { title, children } descriptor; the
// consultant pipeline renders the shared section heading and places the
// section after Limitations.
const childrenOf = (section: any): any[] => (section && Array.isArray(section.children) ? section.children : [])
const textOf = (section: any): string => childrenOf(section).map(flatten).join(' ')

describe('buildMethodologyCurrency', () => {
  it('titles the section for the reader, not for the maintainer', () => {
    const section = buildMethodologyCurrency() as any
    expect(section.title).toBe('Additional Criteria Considered')
    expect(ADDITIONAL_CRITERIA_TITLE).toBe('Additional Criteria Considered')
  })

  it('returns paragraphs with an intro + every applicable entry', () => {
    const section = buildMethodologyCurrency() as any
    const children = childrenOf(section)
    expect(children.every((c: unknown) => c instanceof Paragraph)).toBe(true)
    const allText = textOf(section)
    expect(allText).toMatch(/not the basis of any finding/)
    // Unscoped call renders the full reference set; this assertion
    // auto-tracks if more entries are added.
    for (const entry of CONTEXTUAL_STANDARDS) {
      expect(allText, `missing summary for ${entry.id}`).toContain(entry.summary)
    }
  })

  it('renders intro + each entry as heading + citation + rationale (3 paragraphs)', () => {
    const children = childrenOf(buildMethodologyCurrency())
    const expected = 1 + 3 * CONTEXTUAL_STANDARDS.length
    expect(children.length).toBe(expected)
  })

  it('mentions both PM2.5 bases (9 µg/m³ annual, 35 µg/m³ 24-hour)', () => {
    const allText = textOf(buildMethodologyCurrency())
    expect(allText).toMatch(/9\s?µg\/m³|9\s?µg\/m3/)
    expect(allText).toMatch(/35\s?µg\/m³|35\s?µg\/m3/)
  })

  it('mentions ASHRAE 241 + ECAi (the terminology a reviewing IH looks for)', () => {
    const allText = textOf(buildMethodologyCurrency())
    expect(allText).toMatch(/ASHRAE\s+(?:Standard\s+)?241-2023/)
    expect(allText).toMatch(/ECAi/)
  })

  it('mentions ACGIH TLV + the OSHA-PEL / NIOSH-REL framing', () => {
    const allText = textOf(buildMethodologyCurrency())
    expect(allText).toMatch(/ACGIH/)
    expect(allText).toMatch(/Threshold Limit Value/i)
    expect(allText).toMatch(/OSHA/)
    expect(allText).toMatch(/NIOSH/)
  })

  describe('scoping to the parameters actually measured', () => {
    it('renders only the particulate note for a PM-only assessment', () => {
      const section = buildMethodologyCurrency({ parameters: new Set(['pm']) })
      expect(childrenOf(section).length).toBe(1 + 3)
      const allText = textOf(section)
      expect(allText).toMatch(/89 Fed\.\s?Reg\.\s?16202/)
      expect(allText).not.toMatch(/ECAi/)
      expect(allText).not.toMatch(/ACGIH/)
    })

    it('renders the ventilation + occupational notes for a CO₂/CO assessment', () => {
      const allText = textOf(buildMethodologyCurrency({ parameters: ['co2', 'co'] }))
      expect(allText).toMatch(/ECAi/)
      expect(allText).toMatch(/ACGIH/)
      expect(allText).not.toMatch(/89 Fed\.\s?Reg\.\s?16202/)
    })

    it('returns null — no empty heading, no TOC entry — when nothing applies', () => {
      // Comfort-only walkthrough: temperature and humidity, no criterion
      // in this section speaks to either.
      expect(buildMethodologyCurrency({ parameters: ['tf', 'rh'] })).toBeNull()
    })
  })
})
