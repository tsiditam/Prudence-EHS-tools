/**
 * v2.3 §2 — Conditional Building and System Conditions section.
 *
 * Fixture A (no building-scoped findings):
 *   - report.buildingAndSystemConditions either undefined OR rendered=false
 *   - omittedReason set when the field is present
 *   - scopeOfWork narrative contains the prescribed omittedReason sentence
 *   - rendered HTML/DOCX text does NOT contain "Building and System Conditions" as a section heading
 *
 * Fixture B (HVAC-scoped finding present):
 *   - report.buildingAndSystemConditions.rendered === true
 *   - section.findings.length matches the count of significant building-scoped findings
 */
import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test', siteAddress: '1 St', assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'R', organization: 'O' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith', ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated',
}

describe('v2.3 §2 Fixture A — no building-scoped findings', () => {
  const zone = { zn: 'Z1', su: 'office', co2: '1500', co2o: '420', tf: '74', rh: '52', pm: '12' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  const report = result.report

  it('buildingAndSystemConditions is absent or rendered=false', () => {
    const bs = report.buildingAndSystemConditions
    if (bs !== undefined) {
      expect(bs.rendered).toBe(false)
      expect(bs.omittedReason).toBeDefined()
      expect(bs.findings).toEqual([])
    }
  })

  it('scopeOfWork narrative carries the prescribed omittedReason sentence', () => {
    expect(report.executiveSummary.scopeOfWork).toMatch(
      /Building system condition was not within the scope of this assessment beyond the observations documented in the zone-by-zone findings/,
    )
  })

  it('Rendered HTML does NOT contain "Building and System Conditions" as a section heading', () => {
    const html = generateClientReportHTML(result)
    // "Building and System Context" is a different section that
    // should still be present; we only ban the conditions h2.
    expect(html).not.toMatch(/<h2[^>]*>Building and System Conditions<\/h2>/)
  })

  it('TOC entry for Building and System Conditions is absent', () => {
    const titles = report.tableOfContents.entries.map(e => e.title)
    expect(titles).not.toContain('Building and System Conditions')
  })

  it('Rendered output does NOT contain the banned affirmative claim', () => {
    const html = generateClientReportHTML(result)
    expect(html).not.toMatch(/No visible building or system deficiencies were identified/)
  })
})

describe('v2.3 §2 Fixture B — HVAC findings present', () => {
  const zone = { zn: 'Z1', su: 'office', co2: '900', co2o: '420', tf: '74', rh: '52', pm: '12' }
  const bldg = { hm: 'Over 12 months', fc: 'Heavily loaded' }
  const lz = scoreZone(zone, bldg)
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [{ ...zone, ...bldg }] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  const report = result.report

  it('buildingAndSystemConditions.rendered === true', () => {
    expect(report.buildingAndSystemConditions).toBeDefined()
    expect(report.buildingAndSystemConditions!.rendered).toBe(true)
  })

  it('findings array has at least one RenderedFinding block', () => {
    expect(report.buildingAndSystemConditions!.findings.length).toBeGreaterThan(0)
  })

  it('Each rendered finding has narrative + limitations + recommendedActions', () => {
    for (const f of report.buildingAndSystemConditions!.findings) {
      expect(f.findingId).toBeDefined()
      expect(typeof f.narrative).toBe('string')
      expect(f.narrative.length).toBeGreaterThan(0)
      expect(Array.isArray(f.limitations)).toBe(true)
      expect(Array.isArray(f.recommendedActions)).toBe(true)
    }
  })

  it('TOC includes the Building and System Conditions entry', () => {
    const titles = report.tableOfContents.entries.map(e => e.title)
    expect(titles).toContain('Building and System Conditions')
  })

  it('scopeOfWork narrative does NOT carry the omittedReason sentence', () => {
    expect(report.executiveSummary.scopeOfWork).not.toMatch(
      /Building system condition was not within the scope of this assessment/,
    )
  })

  it('Rendered HTML contains the section heading exactly once per build', () => {
    const html = generateClientReportHTML(result)
    const matches = html.match(/<h2[^>]*>Building and System Conditions<\/h2>/g) || []
    expect(matches.length).toBe(1)
  })
})
