/**
 * IAQ Portfolio Summary — DOCX renderer.
 *
 * Assembles the portfolio model from index-meta fixtures, packs the DOCX, and
 * inspects the emitted XML: title, KPI values, risk-band rows, per-site rows,
 * the attention queue, the single basis/limitations statement, and the absence
 * of any watermark.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { assemblePortfolioModel } from '../../src/report/portfolioModel'
// @ts-expect-error — JS module without types
import { buildPortfolioReportDocument, getPortfolioReportBlob } from '../../src/components/docx/portfolio-report'

const NOW = new Date('2026-08-16T00:00:00Z')

function fixture(): any {
  return {
    now: NOW,
    firm: 'Prudence EHS',
    reports: [
      { id: 'r1', ts: '2026-08-10', facility: 'Harborview Center', score: 88 },
      { id: 'r2', ts: '2026-06-15', facility: 'Midtown Tower', score: 45 },
      { id: 'r3', ts: '2026-05-01', facility: 'Dock 9 Warehouse', score: 30 },
    ],
    drafts: [{ id: 'd1', facility: 'Old Draft', ua: '2026-06-01' }],
    sites: [{ id: 's1', name: 'Midtown Tower', next_due_at: '2026-07-01', reassessment_interval_months: 12 }],
    profile: { iaq_meter: 'TSI Q-Trak', iaq_cal_date: '2024-01-01' },
  }
}

async function renderXml(input: any): Promise<string> {
  const { blob } = await getPortfolioReportBlob(input)
  const buf = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('portfolio report DOCX', () => {
  it('renders the title, KPIs, risk bands, sites, attention queue, and one limitation', async () => {
    const xml = await renderXml(fixture())
    expect(xml).toContain('IAQ Portfolio Summary')
    expect(xml).toContain('Prudence EHS')
    // KPI row headers.
    expect(xml).toContain('Assessments')
    expect(xml).toContain('Distinct sites')
    // Section headings.
    expect(xml).toContain('Risk distribution')
    expect(xml).toContain('Portfolio by site')
    expect(xml).toContain('Needs attention')
    expect(xml).toContain('Basis &amp; limitations')
    // Site + band content.
    expect(xml).toContain('Dock 9 Warehouse')
    expect(xml).toContain('Critical')
    // Attention: overdue reassessment + expired calibration.
    expect(xml).toContain('Overdue reassessments')
    expect(xml.toLowerCase()).toContain('calibration')
    // Screening scope carried once.
    expect(xml.toLowerCase()).toContain('screening')
  })

  it('carries no watermark', async () => {
    const xml = await renderXml(fixture())
    expect(xml).not.toContain('SAMPLE')
    expect(xml.toLowerCase()).not.toContain('powerplus')
    expect(xml.toLowerCase()).not.toContain('watermark')
  })

  it('renders an empty portfolio without throwing', async () => {
    const doc = buildPortfolioReportDocument(assemblePortfolioModel({ now: NOW, reports: [], drafts: [] }))
    const buf = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('No assessments have been finalized yet')
    expect(xml).toContain('IAQ Portfolio Summary')
  })
})
