/**
 * Phase 3 — formal report header/footer (running chrome).
 *
 * Verifies the firm/project header and the
 * "CONFIDENTIAL — Prepared for {client}" + "Page X of Y" footer reach
 * the packed DOCX (header*.xml / footer*.xml), including the live
 * PAGE / NUMPAGES field codes.
 */

import { describe, it, expect } from 'vitest'
import { Document, Packer, SectionType } from 'docx'
import JSZip from 'jszip'
import { reportSectionAttachments } from '../../src/components/docx/report-chrome.js'
import { BODY_SECTION_PROPERTIES, LETTER_BODY_PAGE } from '../../src/components/docx/page-setup.js'
import { DOCX_STYLES } from '../../src/components/docx/styles.js'

async function packWithChrome(opts: { firm?: string; projectNumber?: string; clientName?: string }) {
  const attachments = reportSectionAttachments(opts)
  const doc = new Document({
    creator: 'AtmosFlow', title: 'Test', styles: DOCX_STYLES,
    sections: [{
      properties: { type: SectionType.NEXT_PAGE },
      children: [],
      ...attachments,
    }],
  })
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  const read = async (re: RegExp) => {
    const name = Object.keys(zip.files).find(n => re.test(n))
    return name ? zip.file(name)!.async('string') : ''
  }
  return {
    header: await read(/word\/header\d+\.xml$/),
    footer: await read(/word\/footer\d+\.xml$/),
  }
}

describe('Phase 3 — report chrome', () => {
  it('header carries firm name and project number', async () => {
    const { header } = await packWithChrome({ firm: 'Prudence EHS LLC', projectNumber: 'PSEC-2026-0007' })
    expect(header).toContain('Prudence EHS LLC')
    expect(header).toContain('Project No. PSEC-2026-0007')
  })

  it('footer carries the confidential/client line and live page-number fields', async () => {
    const { footer } = await packWithChrome({ clientName: 'Acme Property Group' })
    expect(footer).toContain('CONFIDENTIAL — Prepared for Acme Property Group')
    expect(footer).toContain('Page ')
    // Live Word field codes, not baked-in numbers. SECTIONPAGES (not
    // NUMPAGES) so the cover section is excluded from the total.
    expect(footer).toContain('PAGE')
    expect(footer).toContain('SECTIONPAGES')
  })

  it('falls back to a generic confidential line when no client is provided', async () => {
    const { footer } = await packWithChrome({})
    expect(footer).toContain('CONFIDENTIAL — For client use only')
  })

  it('omits the project label when no project number is provided', async () => {
    const { header } = await packWithChrome({ firm: 'PSEC' })
    expect(header).toContain('PSEC')
    expect(header).not.toContain('Project No.')
  })

  it('body section restarts page numbering at 1 (cover excluded)', async () => {
    // Mirrors the consultant body-section properties in DocxReport.js.
    const doc = new Document({
      creator: 'AtmosFlow', title: 'Test', styles: DOCX_STYLES,
      sections: [
        { properties: { type: SectionType.NEXT_PAGE }, children: [] },
        {
          properties: { ...BODY_SECTION_PROPERTIES, page: { ...LETTER_BODY_PAGE, pageNumbers: { start: 1 } } },
          children: [],
          ...reportSectionAttachments({ clientName: 'Acme' }),
        },
      ],
    })
    const buf = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('w:start="1"')
  })
})

describe('the monitoring report opts in to different chrome', () => {
  it('keeps the consultant footer wording untouched when no title is given', async () => {
    // The consultant deliverable has shipped with this exact line. Restyling
    // it is not a side effect this shared function gets to have.
    const { footer } = await packWithChrome({ clientName: 'Acme Property Group' })
    expect(footer).toContain('CONFIDENTIAL — Prepared for Acme Property Group')
    expect(footer).not.toContain('Confidential   ·')
  })

  it('takes the understated three-part line only when the report names itself', async () => {
    const { footer } = await packWithChrome({
      title: 'Indoor Environmental Monitoring Report',
      clientName: 'Acme Property Group',
    })
    expect(footer).toContain('Indoor Environmental Monitoring Report')
    expect(footer).toContain('Confidential')
    expect(footer).toContain('Prepared for Acme Property Group')
    expect(footer).not.toContain('CONFIDENTIAL —')
  })

  it('asks for NUMPAGES in a single-section document, and SECTIONPAGES otherwise', async () => {
    // SECTIONPAGES is a field many readers never resolve, and an unresolved
    // field renders as NOTHING — which is how a single-section report ends up
    // printing "Page 6 of " with the total simply missing.
    const single = await packWithChrome({ sectionRelativeTotal: false })
    expect(single.footer).toContain('NUMPAGES')
    expect(single.footer).not.toContain('SECTIONPAGES')

    const multi = await packWithChrome({})
    expect(multi.footer).toContain('SECTIONPAGES')
  })

  it('replaces the firm/project header with the ribbon when one is supplied', async () => {
    // A page pulled out of the binder on its own should still say what it is.
    const { header } = await packWithChrome({
      firm: 'Prudence EHS LLC',
      projectNumber: 'PSEC-1',
      ribbon: ['Meridian Property Group', 'Meridian Tower · Suite 300', 'Jul 15 – 18, 2026'],
    })
    expect(header).toContain('Meridian Property Group')
    expect(header).toContain('Jul 15 – 18, 2026')
    expect(header).toContain('AtmosFlow')
    expect(header).not.toContain('Project No.')
  })

  it('ignores an empty ribbon rather than emitting a blank header', async () => {
    const { header } = await packWithChrome({ firm: 'PSEC', ribbon: [] })
    expect(header).toContain('PSEC')
  })
})
