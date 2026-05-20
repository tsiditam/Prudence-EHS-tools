/**
 * Standards Currency DOCX section — surface contract.
 *
 * Light renderer smoke. The methodology layer + citation provenance
 * are exercised in detail in contextual-standards.test.ts; this file
 * pins only that the section renders, contains the right headings,
 * and emits one block per contextual entry.
 */
import { describe, it, expect } from 'vitest'
import { Paragraph } from 'docx'
import { buildMethodologyCurrency } from '../../src/components/docx/sections-methodology-currency.js'
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

describe('buildMethodologyCurrency', () => {
  it('emits a "Standards Currency" heading + intro + per-entry block', () => {
    const children = buildMethodologyCurrency()
    expect(children.every((c: unknown) => c instanceof Paragraph)).toBe(true)
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/Standards Currency/)
    expect(allText).toMatch(/AtmosFlow scores/)
    // Every contextual standard's summary should appear in the rendered
    // section. Three entries today (ASHRAE 241, EPA PM2.5 annual,
    // ACGIH TLV); this assertion auto-tracks if more are added.
    for (const entry of CONTEXTUAL_STANDARDS) {
      expect(allText, `missing summary for ${entry.id}`).toContain(entry.summary)
    }
  })

  it('renders each entry as heading + citation + rationale (3 paragraphs)', () => {
    const children = buildMethodologyCurrency()
    // 1 H2 heading + 1 intro paragraph + (3 × N) per-entry blocks
    const expected = 2 + 3 * CONTEXTUAL_STANDARDS.length
    expect(children.length).toBe(expected)
  })

  it('mentions both PM2.5 values (9 µg/m³ annual, 35 µg/m³ 24-hr) somewhere in the section text', () => {
    const allText = buildMethodologyCurrency().map(flatten).join(' ')
    expect(allText).toMatch(/9\s?µg\/m³|9\s?µg\/m3/)
    expect(allText).toMatch(/35\s?µg\/m³|35\s?µg\/m3/)
  })

  it('mentions ASHRAE 241 + ECAi (the key terminology a reviewing IH would look for)', () => {
    const allText = buildMethodologyCurrency().map(flatten).join(' ')
    expect(allText).toMatch(/ASHRAE\s+(?:Standard\s+)?241-2023/)
    expect(allText).toMatch(/ECAi/)
  })

  it('mentions ACGIH TLV + the OSHA-PEL / NIOSH-REL framing', () => {
    const allText = buildMethodologyCurrency().map(flatten).join(' ')
    expect(allText).toMatch(/ACGIH/)
    expect(allText).toMatch(/Threshold Limit Value/i)
    expect(allText).toMatch(/OSHA/)
    expect(allText).toMatch(/NIOSH/)
  })
})
