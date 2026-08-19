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
    // v2.3 §2 — Building and System Conditions entry is conditional:
    // present iff at least one building-scoped finding exists. The
    // fixture used by buildScore() has no HVAC fields populated, so
    // the entry is omitted.
    const result = buildScore()
    if (result.kind !== 'report') throw new Error('Expected report')
    const titles = result.report.tableOfContents.entries.map(e => e.title)
    // v2.4 §2 + §3 — Results subsection (when at least one parameter
    // was measured) and the six structured appendices (A–F) always
    // appear in the canonical deliverable.
    expect(titles).toEqual([
      'Methodology Disclosure',
      'Executive Summary',
      'Scope and Methodology',
      'Sampling Methodology',
      'Results',
      'Building and System Context',
      'Zone Findings',
      'Recommendations Register',
      'Limitations and Professional Judgment',
      'Appendix A — Per-Zone Measurement Tabulation',
      'Appendix B — Sampling Locations and Methodology',
      'Appendix C — Photo Documentation',
      'Appendix D — Criteria Background',
      'Appendix E — Quality Assurance and Calibration',
      'Appendix F — Glossary',
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

  it('Six structured appendices (A–F) always appear in TOC; legacy Assessment Index is gated', () => {
    // v2.4 §3 — Appendix A through F render unconditionally as part of
    // the canonical deliverable. The legacy "Assessment Index" (raw
    // scores) appendix is gated behind includeAssessmentIndexAppendix.
    const r1 = buildScore({ includeAppendix: false })
    if (r1.kind === 'report') {
      const titles1 = r1.report.tableOfContents.entries.map(e => e.title)
      expect(titles1.some(t => t.includes('Appendix A'))).toBe(true)
      expect(titles1.some(t => t.includes('Appendix F'))).toBe(true)
      expect(titles1.some(t => t.includes('Assessment Index'))).toBe(false)
    }
    const r2 = buildScore({ includeAppendix: true })
    if (r2.kind === 'report') {
      const titles2 = r2.report.tableOfContents.entries.map(e => e.title)
      expect(titles2.some(t => t.includes('Assessment Index'))).toBe(true)
    }
  })
})

describe('v2.2 §5 — HTML rendering', () => {
  // These used to walk the MODEL's TOC entries and assert each one rendered.
  // That stopped being the right assertion once the consultant deliverable
  // began omitting sections the engine still models (Appendix F, Potential
  // Contributing Factors): the model is a superset of what this report
  // prints. What must hold is that the RENDERED contents page and the
  // rendered body agree with each other — no listed section missing from the
  // body, no omitted section still listed.
  const OMITTED = ['appendix-f', 'potential-contributing-factors']
  const tocAnchors = (html: string): string[] =>
    [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1])

  it('Includes <nav class="toc"> and lists at least the core sections', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    expect(html).toContain('<nav class="toc"')
    expect(html).toContain('Table of Contents')
    const anchors = tocAnchors(html)
    expect(anchors.length).toBeGreaterThan(5)
    for (const core of ['executive-summary', 'results', 'zone-findings', 'recommendations-register']) {
      expect(anchors, `missing core TOC entry ${core}`).toContain(core)
    }
  })

  it('Every anchor the TOC lists has a matching id in the body', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    for (const anchorId of tocAnchors(html)) {
      expect(html, `TOC lists #${anchorId} but the body has no such id`).toContain(`id="${anchorId}"`)
    }
  })

  it('Omitted sections appear in neither the TOC nor the body', () => {
    const result = buildScore()
    if (result.kind !== 'report') return
    const html = generateClientReportHTML(result)
    for (const anchorId of OMITTED) {
      expect(tocAnchors(html), `${anchorId} still listed in the TOC`).not.toContain(anchorId)
      expect(html, `${anchorId} still rendered in the body`).not.toContain(`id="${anchorId}"`)
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
