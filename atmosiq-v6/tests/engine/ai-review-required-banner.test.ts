/**
 * Regression guard for the AI-narrative "IH Review Required" banner.
 *
 * CLAUDE.md anti-patterns list explicitly names "AI-generated narrative
 * without an 'IH Review Required' label" as a defensibility hazard.
 * Before this change the Executive Summary rendered AI narrative
 * followed by a soft italic light-gray disclaimer that did not read as
 * a hard banner to a downstream reader. The fix at
 * src/components/docx/sections-core.js renders a red-bordered banner
 * immediately BEFORE the narrative whenever ctx.narrative is set, and
 * renders nothing when the narrative is deterministic prose generated
 * inline from scoring output.
 *
 * Asserts both behaviors so the banner can't silently regress.
 */
import { describe, it, expect } from 'vitest'
import { Table, Paragraph } from 'docx'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — sections-core is a .js module without type declarations
import { buildExecutiveSummary } from '../../src/components/docx/sections-core'

function flatten(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  // docx TextRun stores its rendered text on the prototype-built tree.
  // The package builds an XML tree via .root[] arrays on each element;
  // for our purposes we just need to surface the visible text. The
  // user-facing string is stored as `text` on the TextRun's options,
  // which lands at `(node as any).options.text` or on the deeper tree.
  const anyNode = node as Record<string, unknown> & { root?: unknown[]; options?: Record<string, unknown> }
  let acc = ''
  if (anyNode.options && typeof anyNode.options.text === 'string') {
    acc += anyNode.options.text + ' '
  }
  if (Array.isArray(anyNode.root)) {
    for (const child of anyNode.root) acc += flatten(child)
  }
  return acc
}

describe('Executive Summary — AI narrative review-required banner', () => {
  it('renders a hard banner when ctx.narrative is present', () => {
    const ctx = {
      facilityName: 'Test Building',
      assessDate: '2026-05-19',
      zoneCount: 2,
      narrative: 'AI-assisted narrative body text describing the assessment.',
      comp: { tot: 72, avg: 72, worst: 65, count: 2 },
      confidence: 'medium',
      recs: { imm: [], eng: [], adm: [] },
    }

    const children = buildExecutiveSummary(ctx)
    const tables = children.filter((c: unknown) => c instanceof Table)

    // The banner is the only Table emitted before the narrative
    // paragraph; the score-summary table emitted earlier (when ctx.comp
    // is set) is also a Table. So locate the banner by its text.
    const banner = tables.find((t: unknown) => flatten(t).includes('IH REVIEW REQUIRED'))
    expect(banner, 'AI-review-required banner not found in Executive Summary').toBeDefined()

    const bannerText = flatten(banner)
    expect(bannerText).toMatch(/AI-ASSISTED NARRATIVE/i)
    expect(bannerText).toMatch(/qualified industrial hygienist|licensed environmental professional/i)
    expect(bannerText).toMatch(/before distribution/i)
  })

  it('banner appears BEFORE the narrative paragraph in render order', () => {
    const ctx = {
      facilityName: 'Test Building',
      assessDate: '2026-05-19',
      zoneCount: 2,
      narrative: 'UNIQUE-NARRATIVE-MARKER-7F3A',
      comp: { tot: 72, avg: 72, worst: 65, count: 2 },
      confidence: 'medium',
      recs: { imm: [], eng: [], adm: [] },
    }

    const children = buildExecutiveSummary(ctx)
    const bannerIdx = children.findIndex((c: unknown) =>
      c instanceof Table && flatten(c).includes('IH REVIEW REQUIRED'))
    const narrativeIdx = children.findIndex((c: unknown) =>
      c instanceof Paragraph && flatten(c).includes('UNIQUE-NARRATIVE-MARKER-7F3A'))

    expect(bannerIdx).toBeGreaterThanOrEqual(0)
    expect(narrativeIdx).toBeGreaterThanOrEqual(0)
    expect(bannerIdx).toBeLessThan(narrativeIdx)
  })

  it('does NOT render the banner when ctx.narrative is absent (deterministic prose path)', () => {
    const ctx = {
      facilityName: 'Test Building',
      assessDate: '2026-05-19',
      zoneCount: 2,
      narrative: undefined,
      comp: { tot: 72, avg: 72, worst: 65, count: 2 },
      zoneScores: [
        { tot: 65, cats: [{ s: 12, mx: 25, l: 'Ventilation' }] },
      ],
      confidence: 'medium',
      recs: { imm: [], eng: [], adm: [] },
    }

    const children = buildExecutiveSummary(ctx)
    const tables = children.filter((c: unknown) => c instanceof Table)
    const banner = tables.find((t: unknown) => flatten(t).includes('IH REVIEW REQUIRED'))
    expect(banner, 'banner should not render for deterministic narrative path').toBeUndefined()
  })
})
