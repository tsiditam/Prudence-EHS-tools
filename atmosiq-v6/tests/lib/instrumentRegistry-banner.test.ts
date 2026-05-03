/**
 * Unit tests for the dashboard calibration exception banner helper.
 *
 * The helper is the single source of truth for what the Home banner
 * shows; UI tests would just re-cover the same branches with more
 * scaffolding. These cover the five state transitions a CIH peer
 * reviewer cares about.
 */
import { describe, it, expect } from 'vitest'
import {
  getCalibrationBannerState,
  CAL_VALIDITY_DAYS,
  CAL_WARN_DAYS,
} from '../../src/utils/instrumentRegistry'

const FIXED_NOW = new Date('2026-05-03T12:00:00Z')

function daysAgo(n) {
  const d = new Date(FIXED_NOW)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('getCalibrationBannerState — Home dashboard exception banner', () => {
  it('returns null when no instrument is registered (banner does not render)', () => {
    expect(getCalibrationBannerState('', daysAgo(10), FIXED_NOW)).toBeNull()
    expect(getCalibrationBannerState(null, daysAgo(10), FIXED_NOW)).toBeNull()
  })

  it('flags unrecorded calibration date with warn tone', () => {
    const r = getCalibrationBannerState('Graywolf IQ-610', null, FIXED_NOW)
    expect(r).toBeTruthy()
    expect(r.tone).toBe('warn')
    expect(r.kind).toBe('unrecorded')
    expect(r.daysToExpiry).toBeNull()
    expect(r.message).toContain('calibration date not recorded')
    expect(r.message).toContain('Graywolf IQ-610')
  })

  it('returns null when calibration is well within validity (banner stays hidden)', () => {
    // 60 days ago is comfortably inside CAL_VALIDITY_DAYS (365)
    expect(getCalibrationBannerState('TSI Q-Trak 7575', daysAgo(60), FIXED_NOW)).toBeNull()
  })

  it('flags expiring calibration with warn tone when within CAL_WARN_DAYS', () => {
    // 14 days from expiry: calibrated CAL_VALIDITY_DAYS - 14 days ago.
    const r = getCalibrationBannerState('TSI Q-Trak 7575', daysAgo(CAL_VALIDITY_DAYS - 14), FIXED_NOW)
    expect(r).toBeTruthy()
    expect(r.tone).toBe('warn')
    expect(r.kind).toBe('expiring')
    expect(r.daysToExpiry).toBe(14)
    expect(r.message).toBe('TSI Q-Trak 7575 calibration expires in 14 days')
  })

  it('flags expired calibration with danger tone', () => {
    // 3 days past expiry
    const r = getCalibrationBannerState('TSI Q-Trak 7575', daysAgo(CAL_VALIDITY_DAYS + 3), FIXED_NOW)
    expect(r).toBeTruthy()
    expect(r.tone).toBe('danger')
    expect(r.kind).toBe('expired')
    expect(r.daysToExpiry).toBe(-3)
    expect(r.message).toBe('TSI Q-Trak 7575 calibration expired 3 days ago')
  })

  it('boundary cases — exactly at the warning threshold and exactly at expiry', () => {
    // Exactly CAL_WARN_DAYS to expiry — still inside the warning window
    const atThreshold = getCalibrationBannerState('M', daysAgo(CAL_VALIDITY_DAYS - CAL_WARN_DAYS), FIXED_NOW)
    expect(atThreshold).toBeTruthy()
    expect(atThreshold.kind).toBe('expiring')
    expect(atThreshold.daysToExpiry).toBe(CAL_WARN_DAYS)

    // One day past the warning threshold — banner hides
    const justOutside = getCalibrationBannerState('M', daysAgo(CAL_VALIDITY_DAYS - CAL_WARN_DAYS - 1), FIXED_NOW)
    expect(justOutside).toBeNull()

    // Exactly at expiry — daysToExpiry === 0, still in the warn window
    const atExpiry = getCalibrationBannerState('M', daysAgo(CAL_VALIDITY_DAYS), FIXED_NOW)
    expect(atExpiry).toBeTruthy()
    expect(atExpiry.kind).toBe('expiring')
    expect(atExpiry.daysToExpiry).toBe(0)
  })
})
