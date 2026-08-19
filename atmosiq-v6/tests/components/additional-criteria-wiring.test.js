// @vitest-environment node
/**
 * End-to-end guard: "Additional Criteria Considered" reaches the real
 * consultant DOCX, and is scoped to what was actually measured.
 *
 * Why this file exists. The section's builder and its unit tests were
 * green for months while NOTHING rendered it — the import had been
 * removed from DocxReport.js and every test exercised the builder
 * directly, so no test could tell a wired section from an orphaned one.
 * These assertions run the full pipeline (getConsultantDocxBlob →
 * buildClientDocx → Packer) and read the packed document.xml, so they
 * fail if the wiring is ever dropped again.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import {
  DEMO_FINDINGS_BUILDING as DEMO_BUILDING,
  DEMO_FINDINGS_ZONES as DEMO_ZONES,
  DEMO_FINDINGS_PRESURVEY as DEMO_PRESURVEY,
} from '../../src/constants/demoDataFindings'

async function docXml(zones) {
  const zoneScores = zones.map((z) => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(zoneScores)
  const { blob } = await getConsultantDocxBlob({
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones,
    zoneScores, comp, profile: { name: 'J. Smith, CIH' },
    photos: {}, version: '6.0.0', userMode: 'ih',
  })
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
  return zip.file('word/document.xml').async('string')
}

describe('Additional Criteria Considered — wired into the consultant report', () => {
  it('renders in a report built from the standard demo assessment', async () => {
    const xml = await docXml(DEMO_ZONES)
    // Twice: the TOC entry and the section heading.
    expect((xml.match(/Additional Criteria Considered/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(xml).toContain('89 Fed. Reg. 16202')
  })

  it('scopes to the parameters measured — no CO₂ means no ASHRAE 241 note', async () => {
    const zones = DEMO_ZONES.map((z) => {
      const { co2, co2o, ...rest } = z            // eslint-disable-line no-unused-vars
      return rest
    })
    const xml = await docXml(zones)
    expect(xml).not.toContain('ECAi')
  })

  it('omits the section entirely from a comfort-only walkthrough', async () => {
    const xml = await docXml([
      { zid: 'z1', zn: 'Suite 100', su: 'office', tf: '73', rh: '45', oc: '8' },
      { zid: 'z2', zn: 'Suite 110', su: 'office', tf: '74', rh: '47', oc: '6' },
    ])
    expect(xml).not.toContain('Additional Criteria Considered')
  })
})
