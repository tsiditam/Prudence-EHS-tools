/**
 * The Consultant report and the AtmosFlow report are two DIFFERENT
 * deliverables — different layouts AND different download file names.
 *
 * They used to download under the identical name (AtmosFlow-Report-{facility}
 * .docx), so the two documents were indistinguishable on disk and one masked
 * the other — it looked like the system only produced the AtmosFlow report.
 * This pins both the content divergence and the distinct file names.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { getConsultantDocxBlob, getAtmosFlowDocxBlob } from '../../src/components/DocxReport'

function data(): any {
  const zones = [{ zn: 'Room 111', zt: 'Open office', co2: '1300', co: '2', tf: '73', rh: '45', pm: '9', tv: '250', oc: '8' }]
  const zoneScores = zones.map((z) => scoreZone(z, {}))
  const comp = compositeScore(zoneScores)
  return {
    building: { fn: 'Harborview Center', fl: '900 Marina Blvd', ft: 'Office', ht: 'CAV' },
    presurvey: { ps_assessor: 'T. Tamakloe', ps_inst_iaq: 'TSI Q-Trak', ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated', ps_reason: 'comfort complaints', ps_recipient_org: 'Acme Corp', ps_recipient_name: 'J. Client' },
    zones, zoneScores, comp,
    recs: { imm: ['Increase OA ventilation.'], eng: ['Rebalance AHU.'], adm: ['Document PM.'], mon: [] },
    profile: { name: 'T. Tamakloe', certs: ['CSP'], firm: 'Prudence EHS' },
    id: 'AIQ-CMP-01', ts: '2026-08-02', status: 'draft',
  }
}

async function docXml(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('consultant vs AtmosFlow reports are distinct deliverables', () => {
  it('produce different content', async () => {
    const d = data()
    const [c, a] = [await getConsultantDocxBlob(d), await getAtmosFlowDocxBlob(d)]
    const [cx, ax] = [await docXml(c.blob), await docXml(a.blob)]
    expect(cx).not.toBe(ax)
    // AtmosFlow carries its Figma markers…
    expect(ax).toContain('ATMOSFLOW')
    expect(ax).toContain('2E7B9B') // brand teal
    expect(ax).toContain('06B6D4') // spectrum cover bar
    // …the consultant report does not.
    expect(cx).not.toContain('06B6D4')
  })

  it('download under DIFFERENT file names (no collision)', async () => {
    const d = data()
    const [c, a] = [await getConsultantDocxBlob(d), await getAtmosFlowDocxBlob(d)]
    expect(c.fileName).not.toBe(a.fileName)
    expect(c.fileName).toContain('Consultant')
    expect(a.fileName).toBe('AtmosFlow-Report-Harborview Center.docx')
  })
})
