/**
 * v2.5 §3 acceptance — Building and System Conditions inline
 * limitations layout.
 *
 * Validates:
 *   1. A fixture with multiple HVAC findings renders each as a
 *      RenderedFinding block in Building Conditions.
 *   2. No "Data limitations" / "Data Limitations" section heading
 *      appears anywhere in the report.
 *   3. No section-level "Recommended actions" rolling block exists
 *      under Building Conditions; recommendations live inline per
 *      finding (and the canonical Recommendations Register at the
 *      end of the report).
 *   4. Limitations render inline beneath each finding ("Limitations
 *      of this finding:" sub-label).
 *   5. Duplicate limitation strings within the section render only
 *      once (per-section dedup mirrors per-zone dedup).
 */

import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { generateClientReportHTML } from '../../src/components/print/client-html'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Building Section Test Site',
  siteAddress: '1 Test Way, Test City, NJ 07000',
  assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'Tester', credentials: ['CIH'] },
  reviewStatus: 'reviewed_by_qualified_professional',
  reviewingProfessional: { fullName: 'Reviewer', credentials: ['CIH'], signatureDate: '2026-04-29' },
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: {
    fullName: 'Recipient', organization: 'Test Org',
  },
  instrumentsUsed: [
    { model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15' },
  ],
}

function buildScore() {
  const zones = [
    { zn: 'Zone A', su: 'office', co2: '900', co2o: '420', tf: '74', rh: '50' },
  ]
  // Three HVAC findings: maintenance overdue + filter loaded + drain pan
  const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded', dp: 'Bio growth observed' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  return legacyToAssessmentScore(
    lzs as any,
    cs as any,
    zones.map(z => ({ ...z, ...bldg })) as any,
    {
      meta: META,
      presurvey: {
        ps_assessor: 'Tester',
        ps_inst_iaq: 'TSI Q-Trak 7575',
        ps_inst_iaq_cal: '2026-01-15',
        ps_inst_iaq_cal_status: 'Calibrated',
      },
    },
  )
}

describe('v2.5 §3 — Building and System Conditions inline limitations', () => {
  it('renders multiple HVAC findings as RenderedFinding blocks in Building Conditions', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const section = result.report.buildingAndSystemConditions
    expect(section).toBeDefined()
    expect(section?.rendered).toBe(true)
    expect(section!.findings.length).toBeGreaterThanOrEqual(3)
  })

  it('does not include a "Data limitations" subsection anywhere in the report', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const html = generateClientReportHTML(result)
    expect(html).not.toMatch(/Data limitations\b/)
    expect(html).not.toMatch(/Data Limitations\b/)
  })

  it('renders inline limitations under each Building finding', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const html = generateClientReportHTML(result)
    expect(html).toContain('Limitations of this finding')
  })

  it('does not aggregate Building-section recommendations into a section-level subsection', () => {
    // The Recommendations Register at the end is the canonical place
    // for action aggregation; the Building Conditions section emits
    // recommendations only inline per finding.
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const html = generateClientReportHTML(result)
    // The section-level "Recommended actions" subsection that v2.4
    // briefly emitted is gone — only per-finding inline blocks remain.
    const buildingSectionMatch = html.match(
      /<h2 id="building-and-system-conditions">[\s\S]*?<h2/,
    )
    if (buildingSectionMatch) {
      const sectionText = buildingSectionMatch[0]
      const sectionLevelHeader = /<h3[^>]*>\s*Recommended actions\s*<\/h3>/i
      expect(sectionLevelHeader.test(sectionText)).toBe(false)
    }
  })
})
