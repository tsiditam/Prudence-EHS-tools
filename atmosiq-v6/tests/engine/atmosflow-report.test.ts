/**
 * AtmosFlow Word report — the EDITABLE, WATERMARK-FREE twin of the AtmosFlow
 * PDF report (lib/report/render-pdf.js is the design source of truth).
 *
 * Builds a small assessment fixture, assembles the PDF RENDER MODEL from it the
 * same way the client PDF path does (assembleRenderModel), packs the DOCX via
 * buildAtmosFlowDocument, and inspects the emitted XML. Asserts the teal cover
 * eyebrow/title, a numbered section heading, the Findings-at-a-Glance table, and
 * that NO watermark (no SAMPLE mark, no Word watermark shape) is present.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { buildAtmosFlowDocument } from '../../src/components/DocxReport'

function buildFixture(): any {
  const zone = { zn: 'Zone 1', zt: 'Open office', co2: '1300', co: '2', tf: '75', rh: '55', pm: '12', tv: '300' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  return {
    building: { fn: 'Test Site', fl: '123 Test St', ft: 'Office', ht: 'VAV air handler' },
    presurvey: {
      ps_assessor: 'J. Smith',
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal: '2026-01-15',
      ps_inst_iaq_cal_status: 'Calibrated',
      ps_reason: 'occupant comfort complaints',
    },
    zones: [zone],
    zoneScores: [lz],
    comp: cs,
    recs: {
      imm: ['Increase outdoor-air ventilation to the affected zones.'],
      eng: ['Rebalance the HVAC system to design airflow.'],
      adm: ['Document the HVAC preventive-maintenance schedule.'],
      mon: [],
    },
    profile: { name: 'J. Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-TEST-01',
    ts: '2026-04-28',
    status: 'draft',
  }
}

async function renderXml(data: any): Promise<string> {
  const doc = await buildAtmosFlowDocument(data)
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('buildAtmosFlowDocument — the AtmosFlow PDF design, as editable DOCX', () => {
  it('renders the teal cover, a numbered heading, and the findings-at-a-glance table', async () => {
    const xml = await renderXml(buildFixture())
    // Cover: teal ATMOSFLOW eyebrow + the big title.
    expect(xml).toContain('ATMOSFLOW')
    expect(xml).toContain('Indoor Air Quality Assessment')
    // The teal accent colour is used on the cover eyebrow / headings.
    expect(xml).toContain('0E7490')
    // A numbered section heading.
    expect(xml).toContain('Executive Summary')
    expect(xml).toContain('3. Measurement Results')
    // The Findings at a Glance section (h2, uppercased by the renderer).
    expect(xml).toContain('FINDINGS AT A GLANCE')
    // The facility from the cover meta table.
    expect(xml).toContain('Test Site')
  })

  it('carries NO watermark — this is the watermark-free deliverable', async () => {
    const xml = await renderXml(buildFixture())
    // No 'SAMPLE' watermark text (mode is never 'sample').
    expect(xml).not.toContain('SAMPLE')
    // No Word/VML watermark shape.
    expect(xml.toLowerCase()).not.toContain('powerplus')
    expect(xml.toLowerCase()).not.toContain('watermark')
  })

  it('produces a non-empty children array (renderer is model-driven)', async () => {
    // Smoke: the document packs without throwing and yields real content.
    const xml = await renderXml(buildFixture())
    expect(xml.length).toBeGreaterThan(2000)
  })
})
