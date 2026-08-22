/**
 * Portfolio Summary model — the pure aggregator behind the portfolio report.
 *
 * Deterministic (clock injected via `now`); reuses the report index's own
 * finding counts and getCalibrationBannerState so the report can't drift
 * from the dashboard.
 *
 * The fixtures carried a `score` per report and the assertions were about
 * risk bands. Both went with the 100-point score: a report-index entry now
 * carries `findings` / `attention` / `worstSeverity`, and the roll-up
 * groups by worst severity found. One fixture keeps only a `score` on
 * purpose — a report finalized before the removal, which must degrade to
 * "not recorded" rather than break the report.
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
      { id: 'r1', ts: '2026-08-10', facility: 'Harborview Center', findings: 1, attention: 0, worstSeverity: 'low' },
      { id: 'r2', ts: '2026-07-01', facility: 'Harborview Center', findings: 3, attention: 1, worstSeverity: 'medium' }, // older, same site
      { id: 'r3', ts: '2026-06-15', facility: 'Midtown Tower', findings: 4, attention: 2, worstSeverity: 'high' },
      { id: 'r4', ts: '2026-05-01', facility: 'Dock 9 Warehouse', findings: 6, attention: 4, worstSeverity: 'critical' },
      { id: 'r5', ts: '2026-04-01', facility: 'Annex B', score: 55 }, // pre-removal record: a score, no counts
    ],
    drafts: [
      { id: 'd1', facility: 'New Site', ua: '2026-08-14' }, // fresh
      { id: 'd2', facility: 'Old Draft', ua: '2026-06-01' }, // stale (>14d)
    ],
  }
}

describe('assemblePortfolioModel — KPIs', () => {
  it('counts assessments, distinct sites, drafts, and totals only the reports that carry counts', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.kpis.assessmentsFinalized).toBe(5)
    // Harborview appears twice → 4 distinct sites.
    expect(m.kpis.distinctSites).toBe(4)
    expect(m.kpis.draftsInProgress).toBe(2)
    // The pre-removal record contributes nothing rather than a zero —
    // it is unknown, not empty.
    expect(m.kpis.assessedCount).toBe(4)
    expect(m.kpis.totalFindings).toBe(1 + 3 + 4 + 6)
    expect(m.kpis.totalAttention).toBe(0 + 1 + 2 + 4)
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
  it('buckets each report by its worst finding, worst first, dropping empty rows', () => {
    const m = assemblePortfolioModel(baseInput())
    const ids = m.riskDistribution.map((r: any) => r.id)
    expect(ids).toEqual(['critical', 'high', 'medium', 'low', 'unassessed'])
    const byId = Object.fromEntries(m.riskDistribution.map((r: any) => [r.id, r.count]))
    expect(byId).toEqual({ critical: 1, high: 1, medium: 1, low: 1, unassessed: 1 })
    expect(m.riskDistribution.find((r: any) => r.id === 'critical').pct).toBe(20)
  })
})

describe('assemblePortfolioModel — per-site rollup', () => {
  it('collapses a site to its latest report and counts its assessments', () => {
    const m = assemblePortfolioModel(baseInput())
    const harbor = m.siteRows.find((r: any) => r.facility === 'Harborview Center')
    expect(harbor.assessments).toBe(2)
    // Latest is r1 (2026-08-10, one low finding), not the older r2.
    expect(harbor.findings).toBe(1)
    expect(harbor.band.id).toBe('low')
    expect(harbor.daysSince).toBe(6)
  })

  it('sorts worst finding first, then most days since', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.siteRows[0].facility).toBe('Dock 9 Warehouse')
    expect(m.siteRows[0].band.id).toBe('critical')
  })

  it('a report finalized before the score was removed shows as not recorded', () => {
    const m = assemblePortfolioModel(baseInput())
    const annex = m.siteRows.find((r: any) => r.facility === 'Annex B')
    expect(annex.findings).toBeNull()
    expect(annex.band.id).toBe('unassessed')
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
    expect(m.kpis.totalFindings).toBeNull()
    expect(m.riskDistribution).toEqual([])
    expect(m.siteRows).toEqual([])
  })

  it('carries exactly one scope statement, not repeated boilerplate', () => {
    const m = assemblePortfolioModel(baseInput())
    expect(m.limitations).toHaveLength(1)
    expect(m.limitations[0].toLowerCase()).toContain('authoritative record')
  })

  it('links reports to the same site by record site_id even when names differ', () => {
    const input = {
      now: NOW,
      reports: [
        { id: 'r1', ts: '2026-08-10', facility: 'Harborview', findings: 4, attention: 0, worstSeverity: 'low' },
        { id: 'r2', ts: '2026-08-01', facility: 'Harborview Corporate Center', findings: 3, attention: 0, worstSeverity: 'low' },
      ],
      records: { r1: { site_id: 'SITE-1' }, r2: { site_id: 'SITE-1' } },
    }
    const m = assemblePortfolioModel(input)
    expect(m.kpis.distinctSites).toBe(1)
    expect(m.siteRows[0].assessments).toBe(2)
  })
})
