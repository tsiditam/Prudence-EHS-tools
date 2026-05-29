/**
 * Drift guard for lib/calibration/banner-state.ts vs.
 * src/utils/instrumentRegistry.js's getCalibrationBannerState.
 *
 * The TS module is a server-side mirror; the JS module powers the
 * dashboard banner. They must agree on every fixture or the
 * calibration-expiry email and the in-app banner will diverge.
 */

import { describe, it, expect } from 'vitest'
import {
  getCalibrationBannerState as getStateTS,
  CAL_VALIDITY_DAYS,
  CAL_WARN_DAYS,
} from '../../lib/calibration/banner-state'
import { getCalibrationBannerState as getStateJS } from '../../src/utils/instrumentRegistry'

const NOW = new Date('2026-05-29T12:00:00Z')

function daysAgoIso(days: number): string {
  const d = new Date(NOW.getTime() - days * 86400000)
  return d.toISOString().slice(0, 10)
}

describe('banner-state — TS implementation', () => {
  it('exports the same constants the audit / dashboard rely on', () => {
    expect(CAL_VALIDITY_DAYS).toBe(365)
    expect(CAL_WARN_DAYS).toBe(30)
  })

  it('returns null when meter is missing', () => {
    expect(getStateTS(null, '2026-01-01', NOW)).toBeNull()
    expect(getStateTS('', '2026-01-01', NOW)).toBeNull()
  })

  it('returns unrecorded when calDate is missing', () => {
    const r = getStateTS('TSI 7575', null, NOW)
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('unrecorded')
    expect(r!.daysToExpiry).toBeNull()
    expect(r!.message).toMatch(/calibration date not recorded/)
  })

  it('returns expiring when in [0, CAL_WARN_DAYS] window', () => {
    // cal_date = 340 days ago → daysToExpiry = 25
    const r = getStateTS('TSI 7575', daysAgoIso(340), NOW)
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('expiring')
    expect(r!.daysToExpiry).toBe(25)
  })

  it('returns expired when daysToExpiry is negative', () => {
    const r = getStateTS('TSI 7575', daysAgoIso(400), NOW)
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('expired')
    expect(r!.daysToExpiry).toBe(-35)
  })

  it('returns null when calibration is fresh (within validity window, outside warn window)', () => {
    // cal_date = 100 days ago → daysToExpiry = 265, outside warn (30).
    const r = getStateTS('TSI 7575', daysAgoIso(100), NOW)
    expect(r).toBeNull()
  })

  it('handles malformed cal_date as unrecorded (defensive)', () => {
    const r = getStateTS('TSI 7575', 'not-a-date', NOW)
    expect(r).not.toBeNull()
    expect(r!.kind).toBe('unrecorded')
  })
})

describe('banner-state — TS and JS agree (drift guard)', () => {
  const fixtures: Array<{
    label: string; meter: string | null; calDate: string | null;
  }> = [
    { label: 'null meter',     meter: null,         calDate: '2026-01-01' },
    { label: 'null cal_date',  meter: 'TSI 7575',   calDate: null },
    { label: 'fresh',          meter: 'TSI 7575',   calDate: daysAgoIso(60) },
    { label: 'at warn edge',   meter: 'TSI 7575',   calDate: daysAgoIso(335) },
    { label: 'expiring 1d',    meter: 'TSI 7575',   calDate: daysAgoIso(364) },
    { label: 'just expired',   meter: 'TSI 7575',   calDate: daysAgoIso(366) },
    { label: 'long expired',   meter: 'TSI 7575',   calDate: daysAgoIso(700) },
  ]

  for (const f of fixtures) {
    it(`agrees on: ${f.label}`, () => {
      const ts = getStateTS(f.meter, f.calDate, NOW)
      const js = getStateJS(f.meter, f.calDate, NOW)
      // Both null or both non-null
      expect(ts === null).toBe(js === null)
      if (ts && js) {
        expect(ts.kind).toBe(js.kind)
        expect(ts.tone).toBe(js.tone)
        expect(ts.daysToExpiry).toBe(js.daysToExpiry)
        expect(ts.message).toBe(js.message)
      }
    })
  }
})
