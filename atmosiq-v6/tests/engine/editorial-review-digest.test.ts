/**
 * Editorial-review digest — the projection the reviewer-agent reads.
 *
 * Verifies every digest item carries a target the suppression renderer honors,
 * so an approved suggestion maps straight to a real cut (no fabrication path).
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without types
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { renderClientReport } from '../../src/engine/report/client'
import {
  buildReportDigest,
  buildCaseFacts,
  buildEditorialReviewPayload,
  // @ts-expect-error — JS module without types
} from '../../src/utils/editorialReviewDigest'
import {
  makeSuppressionIndex,
  SUPPRESSION_KINDS,
  // @ts-expect-error — JS module without types
} from '../../src/utils/editorialSuppressions'

const META: any = {
  siteName: 'Harborview Corporate Center', siteAddress: '1 Test Way',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' }, projectNumber: 'PSEC-0001',
  transmittalRecipient: { fullName: 'R', organization: 'O' },
}

function buildReport(): any {
  const zone = { zn: 'Z1', su: 'office', co2: '1400', co2o: '430', tf: '79', rh: '68', pm: '24' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz], cs, [zone], { meta: META, presurvey: {} })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  return result.report
}

describe('buildReportDigest', () => {
  it('produces items with stable ids and renderer-honored target kinds', () => {
    const items = buildReportDigest(buildReport())
    expect(items.length).toBeGreaterThan(0)
    const ids = new Set(items.map((i: any) => i.id))
    expect(ids.size).toBe(items.length) // ids unique
    for (const item of items) {
      expect(item.text.length).toBeGreaterThan(0)
      expect(SUPPRESSION_KINDS).toContain(item.target.kind)
      // Every target must be honorable by the suppression index.
      const idx = makeSuppressionIndex({ targets: [item.target] })
      expect(idx.has(item.target)).toBe(true)
    }
  })

  it('includes the recommendations and results parameters as cuttable', () => {
    const items = buildReportDigest(buildReport())
    const kinds = new Set(items.map((i: any) => i.target.kind))
    expect(kinds.has('recommendation')).toBe(true)
    expect(kinds.has('resultsSubsection')).toBe(true)
  })

  it('is empty and safe for a null/garbage report', () => {
    expect(buildReportDigest(null)).toEqual([])
    expect(buildReportDigest({})).toEqual([])
  })
})

describe('buildCaseFacts + payload', () => {
  it('carries site, zone count, and merges extra scope facts', () => {
    const report = buildReport()
    const facts = buildCaseFacts(report, { spaceUses: ['office'] })
    expect(facts.site).toBe('Harborview Corporate Center')
    expect(facts.zoneCount).toBe(1)
    expect(facts.spaceUses).toEqual(['office'])
  })

  it('assembles the endpoint payload shape', () => {
    const payload = buildEditorialReviewPayload(buildReport(), { spaceUses: ['office'] })
    expect(Array.isArray(payload.reportDigest.items)).toBe(true)
    expect(payload.caseFacts.zoneCount).toBe(1)
  })
})
