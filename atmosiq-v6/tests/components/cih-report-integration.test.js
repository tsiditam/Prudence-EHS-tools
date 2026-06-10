// @vitest-environment node
/**
 * Integration guard for the "Consultant — CIH Reasoning" report style.
 *
 * Builds the real consultant DOCX (getConsultantDocxBlob → full v2.1
 * pipeline) from demo data twice — standard vs reportStyle:'cih' — unzips
 * word/document.xml, and asserts the CIH reasoning sections appear ONLY in
 * the 'cih' variant. Proves the reportStyle flag is wired end-to-end.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'
import { DEMO_BUILDING, DEMO_ZONES, DEMO_PRESURVEY } from '../../src/constants/demoData.js'

async function docXml(extra) {
  const zoneScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(zoneScores)
  const causalChains = buildCausalChains(DEMO_ZONES, DEMO_BUILDING, zoneScores)
  const data = {
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones: DEMO_ZONES,
    zoneScores, comp, causalChains, profile: { name: 'J. Smith, CIH' },
    photos: {}, version: '6.0.0', userMode: 'ih', ...extra,
  }
  const { blob } = await getConsultantDocxBlob(data)
  const buf = Buffer.from(await blob.arrayBuffer())
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml').async('string')
}

const CIH_TITLES = ['Understanding the Measurements', 'Findings Confidence Register', 'Conceptual Site Model']

describe('CIH report style — end-to-end injection', () => {
  it('standard consultant report omits the CIH reasoning sections', async () => {
    const xml = await docXml({})
    for (const t of CIH_TITLES) expect(xml).not.toContain(t)
  })

  it("reportStyle:'cih' adds the CIH reasoning sections", async () => {
    const xml = await docXml({ reportStyle: 'cih' })
    for (const t of CIH_TITLES) expect(xml).toContain(t)
  })
})
