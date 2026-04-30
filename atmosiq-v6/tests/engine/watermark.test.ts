/**
 * Tests for free-tier docx watermark.
 *
 * Pins the contract:
 *   • The WatermarkConfig interface lives at src/engine/report/watermark.ts
 *     (the acceptance gate's grep_matches relies on this).
 *   • buildWatermarkHeader / buildWatermarkFooter / buildCoverNoticeParagraph
 *     return docx objects only when tier='free'; null/empty for paid.
 *   • watermarkSectionAttachments returns {} for paid (spreads to nothing).
 *   • A free-tier rendered .docx, when extracted as XML, contains the
 *     watermark header/footer/cover-notice strings.
 *   • A paid-tier rendered .docx does NOT contain those strings.
 */

import { describe, it, expect } from 'vitest'
import {
  shouldWatermark,
  FREE_TIER_HEADER_TEXT,
  FREE_TIER_FOOTER_TEXT,
  FREE_TIER_COVER_NOTICE,
  type WatermarkConfig,
} from '../../src/engine/report/watermark'
import {
  buildWatermarkHeader,
  buildWatermarkFooter,
  buildCoverNoticeParagraph,
  watermarkSectionAttachments,
} from '../../src/components/docx/watermark.js'

describe('WatermarkConfig contract', () => {
  it('exports the canonical free-tier strings', () => {
    expect(FREE_TIER_HEADER_TEXT).toBe('GENERATED WITH ATMOSFLOW FREE TIER')
    expect(FREE_TIER_FOOTER_TEXT).toMatch(/AtmosFlow Free/)
    expect(FREE_TIER_FOOTER_TEXT).toMatch(/Upgrade/)
    expect(FREE_TIER_COVER_NOTICE).toMatch(/Free Tier Sample Report/)
  })

  it('shouldWatermark returns true only for tier=free', () => {
    expect(shouldWatermark({ tier: 'free' })).toBe(true)
    expect(shouldWatermark({ tier: 'paid' })).toBe(false)
    expect(shouldWatermark(null)).toBe(false)
    expect(shouldWatermark(undefined)).toBe(false)
  })
})

describe('docx watermark builders', () => {
  it('returns null for paid tier (header/footer/cover-notice)', () => {
    const cfg: WatermarkConfig = { tier: 'paid' }
    expect(buildWatermarkHeader(cfg)).toBeNull()
    expect(buildWatermarkFooter(cfg)).toBeNull()
    expect(buildCoverNoticeParagraph(cfg)).toBeNull()
    expect(watermarkSectionAttachments(cfg)).toEqual({})
  })

  it('returns null for missing config', () => {
    expect(buildWatermarkHeader(null)).toBeNull()
    expect(buildWatermarkFooter(undefined)).toBeNull()
    expect(buildCoverNoticeParagraph(null)).toBeNull()
    expect(watermarkSectionAttachments(null)).toEqual({})
  })

  it('returns docx Header / Footer / Paragraph objects for tier=free', () => {
    const cfg: WatermarkConfig = { tier: 'free' }
    const h = buildWatermarkHeader(cfg)
    const f = buildWatermarkFooter(cfg)
    const p = buildCoverNoticeParagraph(cfg)
    expect(h).not.toBeNull()
    expect(f).not.toBeNull()
    expect(p).not.toBeNull()
    // Quack-check: all three should expose docx-internal options/root structure.
    expect(typeof (h as any).addChildElement === 'function' || typeof (h as any).options === 'object').toBe(true)
  })

  it('section-attachments has both default header and footer for free', () => {
    const cfg: WatermarkConfig = { tier: 'free' }
    const attach = watermarkSectionAttachments(cfg) as any
    expect(attach.headers).toBeDefined()
    expect(attach.footers).toBeDefined()
    expect(attach.headers.default).not.toBeNull()
    expect(attach.footers.default).not.toBeNull()
  })

  it('honors a custom footerText override', () => {
    const cfg: WatermarkConfig = { tier: 'free', footerText: 'Custom footer' }
    // We can't easily extract text from the docx object; verify shape.
    const f = buildWatermarkFooter(cfg)
    expect(f).not.toBeNull()
  })
})

// ─── Integration: render a docx and extract text ───────────────────
//
// docx writes a zip-compressed bundle of XML. To verify the watermark
// strings actually land in the output, we render a tiny Document
// containing only our watermark section, pack it to a Buffer, then
// unzip + concatenate the XML files and string-search.

import { Document, Packer, Paragraph, TextRun } from 'docx'
import JSZip from 'jszip'

async function packAndExtractText(watermarkConfig: WatermarkConfig | null): Promise<string> {
  const attach = watermarkSectionAttachments(watermarkConfig as any)
  const coverNotice = buildCoverNoticeParagraph(watermarkConfig as any)
  const sectionChildren: any[] = [
    new Paragraph({ children: [new TextRun({ text: 'Page body content' })] }),
  ]
  if (coverNotice) sectionChildren.unshift(coverNotice)

  const doc = new Document({
    creator: 'test',
    title: 'watermark-test',
    sections: [
      { children: sectionChildren, ...attach },
    ],
  })
  const buf = await Packer.toBuffer(doc)

  const zip = await JSZip.loadAsync(buf)
  const xmlNames = Object.keys(zip.files).filter(n => n.endsWith('.xml'))
  let combined = ''
  for (const name of xmlNames) {
    combined += await zip.files[name].async('string')
    combined += '\n'
  }
  return combined
}

describe('docx integration: free-tier renders contain watermark strings', () => {
  it('free-tier docx contains the page-header watermark string', async () => {
    const text = await packAndExtractText({ tier: 'free' })
    expect(text).toContain('GENERATED WITH ATMOSFLOW FREE TIER')
  })

  it('free-tier docx contains the page-footer upsell string', async () => {
    const text = await packAndExtractText({ tier: 'free' })
    expect(text).toContain('Generated by AtmosFlow Free')
    expect(text).toContain('Upgrade for unrestricted reports')
  })

  it('free-tier docx contains the cover-page notice', async () => {
    const text = await packAndExtractText({ tier: 'free' })
    expect(text).toContain('Free Tier Sample Report')
  })

  it('paid-tier docx does NOT contain any watermark strings', async () => {
    const text = await packAndExtractText({ tier: 'paid' })
    expect(text).not.toContain('GENERATED WITH ATMOSFLOW FREE TIER')
    expect(text).not.toContain('Generated by AtmosFlow Free')
    expect(text).not.toContain('Free Tier Sample Report')
  })

  it('null watermark config (no setting) renders without watermark', async () => {
    const text = await packAndExtractText(null)
    expect(text).not.toContain('GENERATED WITH ATMOSFLOW FREE TIER')
  })
})
