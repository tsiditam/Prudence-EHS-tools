/**
 * Portfolio Summary model — the pure aggregator behind the portfolio report.
 *
 * Deterministic (clock injected via `now`); reuses getRiskBand and
 * getCalibrationBannerState so the report can't drift from the dashboard.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without types
import { assemblePortfolioModel } from '../../src/report/portfolioModel'

const NOW = new Date('2026-08-16T00:00:00Z')

function baseInput(): any {
  return {
    now: NOW,
    firm: 'Prudence EHS',
    reports: [
      { id: 'r1', ts: '2026-08-10', facility: 'Harborview Center', score: 88 }, // LOW
      { id: 'r2', ts: '2026-07-01', facility: 'Harborview Center', score: 72 }, // MODERATE (older, same site)
      { id: 'r3', ts: '2026-06-15', facility: 'Midtown Tower', score: 45 }, //     HIGH
      { id: 'r4', ts: '2026-05-01', facility: 'Dock 9 Warehouse', score: 30 }, //  CRITICAL
      { id: 'r5', ts: '2026-04-01', facility: 'Annex B', score: null }, //         INSUFFICIENT
    ],
    drafts: [
      { id: 'd1', facility: 'New Site', ua: '2026-08-14' }, // fresh
      { id: 'd2', facility: 'Old Draft', ua: '2026-06-01' }, // stale (>14d)
    ],
  }
}

describe('assemblePortfolioModel — KPIs', () => {
  it('counts assessments, distinct sites, drafts, and averages only scored reports', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.kpis.assessmentsFinalized).toBe(5)
    // Harborview appears twice → 4 distinct sites.
    expect(m.kpis.distinctSites).toBe(4)
    expect(m.kpis.draftsInProgress).toBe(2)
    expect(m.kpis.scoredCount).toBe(4) // the null score is excluded
    expect(m.kpis.avgScore).toBe(Math.round((88 + 72 + 45 + 30) / 4)) // 59
    expect(m.kpis.avgScoreBand.id).toBe('HIGH')
  })

  it('computes a delta against a prior period when given', () => {
    const m = assemblePortfolioModel({ ...baseInput(), priorFinalized: 3 })
    expect(m.kpis.deltaFinalized).toBe(2)
  })

  it('leaves the delta null when no prior period is supplied', () => {
    expect(assemblePortfolioModel(baseInput()).kpis.deltaFinalized).toBeNull()
  })
})

describe('assemblePortfolioModel — risk distribution', () => {
  it('buckets each report by its band, worst first, dropping empty bands', () => {
    const m = assemblePortfolioModel(baseInput())
    const ids = m.riskDistribution.map((r: any) => r.id)
    // Worst-first ordering, INSUFFICIENT last; MODERATE present (r2), LOW present (r1).
    expect(ids).toEqual(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'INSUFFICIENT'])
    const byId = Object.fromEntries(m.riskDistribution.map((r: any) => [r.id, r.count]))
    expect(byId).toEqual({ CRITICAL: 1, HIGH: 1, MODERATE: 1, LOW: 1, INSUFFICIENT: 1 })
    expect(m.riskDistribution.find((r: any) => r.id === 'CRITICAL').pct).toBe(20)
  })
})

describe('assemblePortfolioModel — per-site rollup', () => {
  it('collapses a site to its latest report and counts its assessments', () => {
    const m = assemblePortfolioModel(baseInput())
    const harbor = m.siteRows.find((r: any) => r.facility === 'Harborview Center')
    expect(harbor.assessments).toBe(2)
    // Latest is r1 (2026-08-10, score 88 → LOW), not the older 72.
    expect(harbor.score).toBe(88)
    expect(harbor.band.id).toBe('LOW')
    expect(harbor.daysSince).toBe(6)
  })

  it('sorts worst band first, then most days since', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.siteRows[0].facility).toBe('Dock 9 Warehouse') // CRITICAL
    expect(m.siteRows[0].band.id).toBe('CRITICAL')
  })
})

describe('assemblePortfolioModel — attention queue', () => {
  it('flags stale drafts past the threshold and leaves fresh ones out', () => {
    const m = assemblePortfolioModel(baseInput())
    const stale = m.attentionQueue.staleDrafts.map((d: any) => d.facility)
    expect(stale).toContain('Old Draft')
    expect(stale).not.toContain('New Site')
  })

  it('surfaces overdue reassessments from the site library', () => {
    const input = {
      ...baseInput(),
      sites: [
        { id: 's1', name: 'Midtown Tower', next_due_at: '2026-07-01', reassessment_interval_months: 12 }, // overdue
        { id: 's2', name: 'Harborview Center', next_due_at: '2026-12-01', reassessment_interval_months: 12 }, // future
      ],
    }
    const m = assemblePortfolioModel(input)
    const overdue = m.attentionQueue.overdueReassessments.map((o: any) => o.facility)
    expect(overdue).toContain('Midtown Tower')
    expect(overdue).not.toContain('Harborview Center')
    expect(m.attentionQueue.overdueReassessments[0].daysOverdue).toBeGreaterThan(0)
  })

  it('reports calibration status from the profile via the shared helper', () => {
    const input = { ...baseInput(), profile: { iaq_meter: 'TSI Q-Trak', iaq_cal_date: '2024-01-01' } }
    const m = assemblePortfolioModel(input)
    expect(m.attentionQueue.calibration).toBeTruthy()
    expect(m.attentionQueue.calibration.kind).toBe('expired')
    expect(m.hasAttention).toBe(true)
  })

  it('has no calibration entry when the profile records no meter', () => {
    expect(assemblePortfolioModel(baseInput()).attentionQueue.calibration).toBeNull()
  })
})

describe('assemblePortfolioModel — edges', () => {
  it('handles an empty portfolio without throwing', () => {
    const m = assemblePortfolioModel({ now: NOW, reports: [], drafts: [] })
    expect(m.isEmpty).toBe(true)
    expect(m.kpis.assessmentsFinalized).toBe(0)
    expect(m.kpis.avgScore).toBeNull()
    expect(m.riskDistribution).toEqual([])
    expect(m.siteRows).toEqual([])
  })

  it('carries exactly one scope statement, not repeated boilerplate', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.limitations).toHaveLength(1)
    expect(m.limitations[0].toLowerCase()).toContain('screening')
  })

  it('links reports to the same site by record site_id even when names differ', () => {
    const input = {
      now: NOW,
      reports: [
        { id: 'r1', ts: '2026-08-10', facility: 'Harborview', score: 80 },
        { id: 'r2', ts: '2026-08-01', facility: 'Harborview Corporate Center', score: 60 },
      ],
      records: { r1: { site_id: 'SITE-1' }, r2: { site_id: 'SITE-1' } },
    }
    const m = assemblePortfolioModel(input)
    expect(m.kpis.distinctSites).toBe(1)
    expect(m.siteRows[0].assessments).toBe(2)
  })
})
