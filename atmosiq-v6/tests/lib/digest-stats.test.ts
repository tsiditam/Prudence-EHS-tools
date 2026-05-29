/**
 * Pure-fn tests for lib/portfolio/digest-stats.ts.
 *
 * Pins the contract:
 *   • currentQuarter returns Q1/Q2/Q3/Q4 boundaries in UTC.
 *   • priorQuarter wraps across year boundaries correctly.
 *   • computeDigestStats counts only rows in the named window.
 *   • Action filtering: only assessment_finalized / report_exported /
 *     engine_ran contribute to their respective counters.
 *   • distinct_sites uses details.site_id and dedupes.
 *   • isDigestEligible enforces the ≥ 2 assessments + 14d age rule.
 */

import { describe, it, expect } from 'vitest'
import {
  currentQuarter,
  priorQuarter,
  computeDigestStats,
  isDigestEligible,
  DIGEST_MIN_ASSESSMENTS,
  DIGEST_MIN_ACCOUNT_AGE_DAYS,
  type AuditRow,
} from '../../lib/portfolio/digest-stats'

describe('currentQuarter', () => {
  it('returns Q1 boundaries for January', () => {
    const q = currentQuarter(new Date('2026-01-15T12:00:00Z'))
    expect(q.label).toBe('Q1 2026')
    expect(q.start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(q.end.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('returns Q2 boundaries for May', () => {
    const q = currentQuarter(new Date('2026-05-29T12:00:00Z'))
    expect(q.label).toBe('Q2 2026')
    expect(q.start.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    expect(q.end.toISOString()).toBe('2026-07-01T00:00:00.000Z')
  })

  it('returns Q4 boundaries for December', () => {
    const q = currentQuarter(new Date('2026-12-31T23:59:00Z'))
    expect(q.label).toBe('Q4 2026')
    expect(q.start.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(q.end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('priorQuarter', () => {
  it('returns Q1 when given Q2', () => {
    const q2 = currentQuarter(new Date('2026-05-29T12:00:00Z'))
    const q1 = priorQuarter(q2)
    expect(q1.label).toBe('Q1 2026')
    expect(q1.start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(q1.end.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })

  it('wraps to prior year when given Q1', () => {
    const q1 = currentQuarter(new Date('2026-02-15T12:00:00Z'))
    const q4 = priorQuarter(q1)
    expect(q4.label).toBe('Q4 2025')
    expect(q4.start.toISOString()).toBe('2025-10-01T00:00:00.000Z')
    expect(q4.end.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

function row(action: string, isoTs: string, details?: Record<string, unknown>): AuditRow {
  return { action, created_at: isoTs, details: details || null }
}

describe('computeDigestStats', () => {
  const NOW = new Date('2026-07-01T13:00:00Z')  // first day of Q3
  const q3 = currentQuarter(NOW)
  const q2 = priorQuarter(q3)
  // For the digest, the cron computes "just ended" = q2.
  const quarter = q2
  const prior = priorQuarter(q2)

  it('counts assessment_finalized in window, ignores rows outside', () => {
    const rows: AuditRow[] = [
      row('assessment_finalized', '2026-04-05T10:00:00Z'),
      row('assessment_finalized', '2026-05-15T10:00:00Z'),
      row('assessment_finalized', '2026-06-29T23:00:00Z'),
      row('assessment_finalized', '2026-07-01T01:00:00Z'),  // out (next quarter)
      row('assessment_finalized', '2026-03-31T23:59:00Z'),  // out (prior quarter — counted there)
    ]
    const stats = computeDigestStats({
      rows, quarter, prior,
      account_created_at: '2025-01-01T00:00:00Z',
      now: NOW,
    })
    expect(stats.assessments_finalized).toBe(3)
    expect(stats.assessments_finalized_prior).toBe(1)
    expect(stats.delta_finalized).toBe(2)
  })

  it('counts report_exported and engine_runs independently', () => {
    const rows: AuditRow[] = [
      row('report_exported', '2026-04-05T10:00:00Z'),
      row('report_exported', '2026-04-06T10:00:00Z'),
      row('engine_ran',      '2026-04-05T10:00:00Z'),
      row('engine_ran',      '2026-04-05T10:30:00Z'),
      row('engine_ran',      '2026-04-05T11:00:00Z'),
      row('assessment_finalized', '2026-04-05T11:00:00Z'),
    ]
    const stats = computeDigestStats({
      rows, quarter, prior,
      account_created_at: '2025-01-01T00:00:00Z',
      now: NOW,
    })
    expect(stats.reports_exported).toBe(2)
    expect(stats.engine_runs).toBe(3)
    expect(stats.assessments_finalized).toBe(1)
  })

  it('distinct_sites dedupes site_id from details, ignores rows without one', () => {
    const rows: AuditRow[] = [
      row('assessment_finalized', '2026-04-05T10:00:00Z', { site_id: 'site-a' }),
      row('assessment_finalized', '2026-05-10T10:00:00Z', { site_id: 'site-b' }),
      row('assessment_finalized', '2026-06-01T10:00:00Z', { site_id: 'site-a' }),  // dupe
      row('assessment_finalized', '2026-06-15T10:00:00Z', { declined_save: true }),  // no site_id
    ]
    const stats = computeDigestStats({
      rows, quarter, prior,
      account_created_at: '2025-01-01T00:00:00Z',
      now: NOW,
    })
    expect(stats.distinct_sites).toBe(2)
  })

  it('returns 0s when no rows fall in either window', () => {
    const stats = computeDigestStats({
      rows: [], quarter, prior,
      account_created_at: '2025-01-01T00:00:00Z',
      now: NOW,
    })
    expect(stats.assessments_finalized).toBe(0)
    expect(stats.assessments_finalized_prior).toBe(0)
    expect(stats.delta_finalized).toBe(0)
    expect(stats.distinct_sites).toBe(0)
  })

  it('quarter labels reflect the windows passed in', () => {
    const stats = computeDigestStats({
      rows: [], quarter, prior,
      account_created_at: '2025-01-01T00:00:00Z',
      now: NOW,
    })
    expect(stats.quarter_label).toBe('Q2 2026')
    expect(stats.prior_label).toBe('Q1 2026')
  })

  it('account_age_days is computed from created_at', () => {
    const stats = computeDigestStats({
      rows: [], quarter, prior,
      account_created_at: '2026-05-01T00:00:00Z',
      now: new Date('2026-05-29T00:00:00Z'),
    })
    expect(stats.account_age_days).toBe(28)
  })

  it('account_age_days is 0 when account_created_at is null', () => {
    const stats = computeDigestStats({
      rows: [], quarter, prior,
      account_created_at: null, now: NOW,
    })
    expect(stats.account_age_days).toBe(0)
  })
})

describe('isDigestEligible', () => {
  const baseStats = {
    quarter_label: 'Q2 2026', prior_label: 'Q1 2026',
    assessments_finalized: 5, assessments_finalized_prior: 3,
    delta_finalized: 2,
    reports_exported: 5, reports_exported_prior: 3,
    distinct_sites: 3,
    engine_runs: 10,
    account_age_days: 90,
  }

  it('returns true for an active user with ≥ 2 assessments + old enough account', () => {
    expect(isDigestEligible(baseStats)).toBe(true)
  })

  it(`returns false when assessments_finalized < ${DIGEST_MIN_ASSESSMENTS}`, () => {
    expect(isDigestEligible({ ...baseStats, assessments_finalized: 1 })).toBe(false)
    expect(isDigestEligible({ ...baseStats, assessments_finalized: 0 })).toBe(false)
  })

  it(`returns false when account_age_days < ${DIGEST_MIN_ACCOUNT_AGE_DAYS}`, () => {
    expect(isDigestEligible({ ...baseStats, account_age_days: 13 })).toBe(false)
    expect(isDigestEligible({ ...baseStats, account_age_days: 0 })).toBe(false)
  })
})
