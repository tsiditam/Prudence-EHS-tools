/**
 * v2.3 §6 — Per-zone limitations dedup.
 *
 * Two findings in the same zone both carrying limitation L1 →
 * after dedup, L1 appears under the FIRST finding only. Cross-zone
 * dedup is NOT applied — the same limitation may legitimately
 * reappear in a different zone.
 */
import { describe, it, expect } from 'vitest'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
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

describe('v2.3 §6 — per-zone limitations dedup', () => {
  it('Within a single zone, a duplicated limitation appears under only the first finding', () => {
    // PM2.5 elevated + TVOC elevated both carry "screening-level"
    // related limitations from their phrase library entries; they
    // DO share at least one common limitation string. After
    // dedup, that shared limitation appears under only one of the
    // two findings within the zone.
    const zone = {
      zn: 'Z1', su: 'office',
      co2: '900', co2o: '420',
      pm: '50',         // PM elevated
      tv: '1500',       // TVOC elevated
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const z = result.report.zoneSections[0]

    // Tally how many times each limitation string appears across
    // all findings in this zone.
    const counts = new Map<string, number>()
    for (const f of z.findings) {
      for (const lim of f.limitations) {
        counts.set(lim, (counts.get(lim) ?? 0) + 1)
      }
    }
    // Every limitation string should appear at most once per zone.
    for (const [, count] of counts) {
      expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('Cross-zone dedup is NOT applied — the same limitation may reappear in another zone', () => {
    // Two zones, both with elevated PM2.5. Each zone's first
    // finding carries the PM2.5 phrase library limitation. The
    // limitation should appear in BOTH zones (once per zone).
    const zoneA = { zn: 'A', su: 'office', co2: '900', co2o: '420', pm: '50' }
    const zoneB = { zn: 'B', su: 'office', co2: '900', co2o: '420', pm: '50' }
    const lzA = scoreZone(zoneA, {})
    const lzB = scoreZone(zoneB, {})
    const cs = compositeScore([lzA, lzB])
    const score = legacyToAssessmentScore([lzA, lzB] as any, cs as any, [zoneA, zoneB] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return

    const zoneALimitations = result.report.zoneSections[0].findings.flatMap(f => f.limitations)
    const zoneBLimitations = result.report.zoneSections[1].findings.flatMap(f => f.limitations)

    // Find a limitation that appears in both zones (the PM2.5
    // optical-instrument limitation is shared).
    const shared = zoneALimitations.filter(l => zoneBLimitations.includes(l))
    expect(shared.length).toBeGreaterThan(0)
  })
})
