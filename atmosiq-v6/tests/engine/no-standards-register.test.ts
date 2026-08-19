/**
 * The report does not print a standards register.
 *
 * Appendix D used to close with a ~22-line bibliographic catalogue of every
 * standard invoked — "29 CFR 1910.1000 Table Z-1 — CO PEL 50 ppm 8-hr TWA.
 * Occupational Safety and Health Administration." and so on. Product
 * decision (2026-08): drop it. Each criterion is already named where it is
 * used — beside its result in Criteria Applied, in the finding it produced,
 * and in the Appendix D background prose — so the catalogue stated them a
 * third time. A reviewer reads the standards off the report itself, which is
 * how consultant reports in this field are normally written.
 *
 * What did NOT change: the citation walker still populates
 * `appendixD.citations` as the audit record of what the report cited. This
 * is a presentation decision, not a decision to stop tracking — see
 * tests/engine/appendix-d-citation-walk.test.ts.
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'

const BUILDING = { fn: 'Register Test', fl: '1 Test St', ft: 'Office', ht: 'CAV AHU', assessmentDate: '2026-08-19' }
// Trip several parameters so the walker collects a rich citation set — the
// register, if it rendered, would be at its longest here.
const ZONES = [
  { zid: 'z1', zn: 'Zone 1', su: 'office', tf: '90', rh: '80', co2: '1600', co2o: '420', co: '60', pm: '60', pmo: '6', tv: '4000', hc: '1', oc: '10' },
]
const PRESURVEY = {
  ps_survey_date: '2026-08-19', ps_recipient_org: 'Register Test',
  ps_inst_meter: 'TSI Q-Trak 7575', ps_inst_serial: 'QT-1',
  ps_inst_cal: '2026-06-02', ps_inst_cal_status: 'Current',
}

async function renderText(): Promise<string> {
  const zoneScores = ZONES.map((z) => scoreZone(z, BUILDING))
  const { blob } = await getConsultantDocxBlob({
    building: BUILDING, presurvey: PRESURVEY, zones: ZONES, zoneScores,
    comp: compositeScore(zoneScores), profile: { name: 'J. Smith, CIH' },
    photos: {}, version: '6.0.0', userMode: 'ih',
  })
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
  const xml = await zip.file('word/document.xml')!.async('string')
  return xml
}

describe('no standards register in the rendered report', () => {
  it('does not print catalogue entries naming an issuing body after the citation', async () => {
    const xml = await renderText()
    // The register's shape was "<source> — <issuing organisation>." with the
    // organisation spelled out. These lines existed ONLY in the catalogue.
    for (const line of [
      'Occupational Safety and Health Administration.',
      'National Institute for Occupational Safety and Health.',
      'U.S. Environmental Protection Agency.',
      'World Health Organization.',
      'New York City Department of Health and Mental Hygiene.',
      'Peer-reviewed literature.',
    ]) {
      expect(xml, `register line still rendering: "${line}"`).not.toContain(line)
    }
  })

  it('does not describe Appendix D as a bibliography', async () => {
    const xml = await renderText()
    expect(xml).not.toContain('canonical bibliographic reference')
    expect(xml).not.toContain('Standards and Citations')
  })

  it('still names the standards where they are actually used', async () => {
    // This is the assertion that keeps the removals honest. The register
    // went, and so did the Criteria Applied table (2026-08) — so the report
    // now carries its standards in the findings themselves and in the
    // Appendix D background. If a future cut removes those too, the report
    // stops citing anything and this fails.
    const xml = await renderText()
    expect(xml).toContain('Criteria Background')
    expect(xml).toMatch(/OSHA|1910\.1000/)
    expect(xml).toMatch(/ASHRAE 55/)
    expect(xml).toMatch(/NIOSH|EPA/)
  })

  it('keeps the engine-version footer, which was not part of the register', async () => {
    const xml = await renderText()
    expect(xml).toMatch(/atmosflow-engine-\d+\.\d+\.\d+/)
  })
})
