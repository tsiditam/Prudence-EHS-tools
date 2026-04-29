/**
 * v2.2 §5 — Table of Contents regression tests.
 *
 * Validates:
 *   1. tableOfContents is populated on every rendered ClientReport.
 *   2. TOC entries enumerate every body section in rendered order.
 *   3. Each entry has an anchorId matching the rendered HTML <h2 id="...">.
 *   4. Appendix entry only appears when includeAssessmentIndexAppendix=true.
 *   5. HTML output contains <nav class="toc"> with all entries.
 *   6. HTML anchor links resolve to actual section headings.
 *   7. DOCX packs cleanly with the new TOC section.
 */

import { describe, it, expect } from 'vitest'
import { Document, Packer, SectionType } from 'docx'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import { buildClientDocx } from '../../src/components/docx/sections-v21client.js'
import { DOCX_STYLES } from '../../src/components/docx/styles.js'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test Site', siteAddress: '123 Test St',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'Recipient', organization: 'Org' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated',
}

function buildScore(opts: { includeAppendix?: boolean } = {}) {
  const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  return renderClientReport(score, { includeAssessmentIndexAppendix: !!opts.includeAppendix })
}

describe('v2.2 §5 — Table of Contents on ClientReport', () => {
  it('Populated by default', () => {
    const result = buildScore()
    if (result.kind !== 'report') throw new Error('Expected report')
    const toc = result.report.tableOfContents
    expect(toc).toBeDefined()
    expect(toc.title).toBe('Table of Contents')
    expect(toc.entries.length).toBeGreaterThan(0)
  })

  it('Enumerates the expected body sections in rendered order', () => {
    const result = buildScore()
    if (result.kind !== 'report') throw new Error('Expected report')
    const titles = result.report.tableOfContents.entries.map(e => e.title)
    expect(titles).toEqual([
      'Methodology Disclosure',
      'Executive Summary',
      'Scope and Methodology',
      'Sampling Methodology',
      'Building and System Context',
      'Building and System Conditions',
      'Zone Findings',
      'Recommendations Register',
      'Limitations and Professional Judgment',
    ])
  })

  it('Every entry has an anchorId in kebab-case', () => {
    const result = buildScore()
    if (result.kind !== 'report') throw new Error('Expected report')
    for (const e of result.report.tableOfContents.entries) {
      expect(e.anchorId).toMatch(/^[a-z][a-z0-9-]+$/)
      expect(e.anchorId.length).toBeGreaterThan(0)
      expect([1, 2]).toContain(e.level)
    }
  })

  it('Appendix entry appears only when includeAssessmentIndexAppendix=true', () => {
    const r1 = buildScore({ includeAppendix: false })
    if (r1.kind === 'report') {
      const titles1 = r1.report.tableOfContents.entries.map(e => e.title)
      expect(titles1.some(t => t.includes('Appendix'))).toBe(false)
    }
    const r2 = buildScore({ includeAppendix: true })
    if (r2.kind === 'report') {
      const titles2 = r2.report.tableOfContents.entries.map(e => e.title)
      expect(titles2.some(t => t.includes('Appendix'))).toBe(true)
    }
  })
})

describe('v2.2 §5 — HTML rendering', () => {
  it('Includes <nav class="toc"> with all TOC entries', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    expect(html).toContain('<nav class="toc"')
    expect(html).toContain('Table of Contents')
    for (const entry of result.report.tableOfContents.entries) {
      expect(html).toContain(`href="#${entry.anchorId}"`)
      expect(html).toContain(entry.title)
    }
  })

  it('Each anchorId in TOC has a matching <h2 id="..."> in the body', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    for (const entry of result.report.tableOfContents.entries) {
      // Anchor must be an actual id="..." somewhere in the HTML.
      expect(html).toContain(`id="${entry.anchorId}"`)
    }
  })

  it('TOC renders before Methodology Disclosure section', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    const tocIdx = html.indexOf('class="toc"')
    const mdIdx = html.indexOf('id="methodology-disclosure"')
    expect(tocIdx).toBeGreaterThan(0)
    expect(mdIdx).toBeGreaterThan(tocIdx)
  })
})

describe('v2.2 §5 — DOCX rendering', () => {
  it('DOCX with TOC packs to a non-empty buffer', async () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const { cover, main } = buildClientDocx(result)
    const doc = new Document({
      creator: 'AtmosFlow',
      title: 'Test',
      styles: DOCX_STYLES,
      sections: [
        cover,
        {
          properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: main,
        },
      ],
    })
    const buf = await Packer.toBuffer(doc)
    expect(buf.byteLength).toBeGreaterThan(2000)
  })
})
