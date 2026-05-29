/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Server-side mirror of src/utils/instrumentRegistry.js's
 * getCalibrationBannerState helper. Keeps the SPA's UI path
 * (instrumentRegistry.js, plain JS, dashboard banner) untouched
 * while exposing the same logic to the calibration-expiry cron
 * (habit-loop PR 2).
 *
 * Both implementations are exact mirrors. A drift-guard test
 * (`tests/lib/calibration-banner-state.test.ts`) pins them against
 * each other on a shared fixture — if a future PR updates the JS
 * helper without updating this one, the test fails.
 *
 * Defensibility note: CAL_VALIDITY_DAYS is a CIH-defensibility
 * threshold (the in-app finalization gate uses 365 days; CLAUDE.md
 * mentions 270 days as the documented value — that discrepancy is
 * tracked there). This module preserves the live 365-day behavior
 * to keep the cron's signal consistent with the dashboard banner.
 */

export const CAL_VALIDITY_DAYS = 365
export const CAL_WARN_DAYS = 30

export interface CalibrationBannerState {
  readonly tone: 'warn' | 'danger'
  readonly kind: 'unrecorded' | 'expiring' | 'expired'
  readonly daysToExpiry: number | null
  readonly message: string
}

/**
 * Returns null when the instrument's calibration is current (no
 * warning needed). Returns a state object only when the assessor
 * needs to act.
 */
export function getCalibrationBannerState(
  meter: string | null | undefined,
  calDate: string | null | undefined,
  now: Date = new Date(),
): CalibrationBannerState | null {
  if (!meter) return null
  if (!calDate) {
    return {
      tone: 'warn',
      kind: 'unrecorded',
      daysToExpiry: null,
      message: `${meter} calibration date not recorded`,
    }
  }
  const ts = new Date(calDate).getTime()
  if (Number.isNaN(ts)) {
    return {
      tone: 'warn',
      kind: 'unrecorded',
      daysToExpiry: null,
      message: `${meter} calibration date not recorded`,
    }
  }
  const daysSince = Math.floor((now.getTime() - ts) / 86400000)
  const daysToExpiry = CAL_VALIDITY_DAYS - daysSince
  if (daysToExpiry < 0) {
    return {
      tone: 'danger',
      kind: 'expired',
      daysToExpiry,
      message: `${meter} calibration expired ${Math.abs(daysToExpiry)} days ago`,
    }
  }
  if (daysToExpiry <= CAL_WARN_DAYS) {
    return {
      tone: 'warn',
      kind: 'expiring',
      daysToExpiry,
      message: `${meter} calibration expires in ${daysToExpiry} days`,
    }
  }
  return null
}
