/**
 * AtmosFlow 3.0 — Time-Basis Compatibility Validator (Phase 12).
 *
 * A measurement's averaging period must be compatible with a reference
 * value's averaging period before any exceedance language is permitted. A
 * 10-minute grab reading numerically above a 24-hour standard is a SCREENING
 * comparison, never an "exceedance" of that standard.
 *
 * This module is pure and deterministic. "AtmosFlow deterministic
 * investigation methodology" — the compatibility rules below are AtmosFlow's
 * decision logic informed by standard averaging-period definitions; they are
 * not prescribed verbatim by any single external organization.
 */

import { AveragingPeriod, ComparisonApplicability } from './types'

/**
 * Nominal window length in minutes for each averaging period. Used only for
 * deterministic ordering of "shorter than / longer than". These are NOT
 * measurements and are never rendered.
 */
const NOMINAL_WINDOW_MIN: Record<AveragingPeriod, number> = {
  [AveragingPeriod.INSTANTANEOUS]: 0,
  [AveragingPeriod.CEILING]: 0, // not-to-exceed at any instant
  [AveragingPeriod.GRAB]: 1,
  [AveragingPeriod.SHORT_TERM]: 10,
  [AveragingPeriod.STEL_15_MIN]: 15,
  [AveragingPeriod.MIN_30]: 30,
  [AveragingPeriod.HOUR_1]: 60,
  [AveragingPeriod.TWA_8_HOUR]: 480,
  [AveragingPeriod.HOUR_24]: 1440,
  [AveragingPeriod.ANNUAL]: 525600,
  [AveragingPeriod.OTHER]: NaN,
}

export interface TimeBasisResult {
  timeBasisCompatible: boolean
  applicability: ComparisonApplicability
  reasonCodes: string[]
  measurementWindowMin: number
  referenceWindowMin: number
}

export interface TimeBasisInput {
  measurementAveragingPeriod?: AveragingPeriod
  /** Actual sampling duration, if known; refines the nominal window. */
  measurementDurationMinutes?: number
  referenceAveragingPeriod?: AveragingPeriod
}

function effectiveMeasurementWindow(input: TimeBasisInput): number {
  if (typeof input.measurementDurationMinutes === 'number' && input.measurementDurationMinutes >= 0) {
    return input.measurementDurationMinutes
  }
  if (input.measurementAveragingPeriod) {
    return NOMINAL_WINDOW_MIN[input.measurementAveragingPeriod]
  }
  return NaN
}

/**
 * Determine whether a measurement's time basis supports direct comparison to
 * a reference's averaging period.
 *
 * Rules (AtmosFlow deterministic methodology):
 *  - No reference averaging period defined → NOT time-limited; leave the
 *    applicability decision to the reference-applicability engine
 *    (returns DIRECTLY_COMPARABLE from a pure time-basis standpoint).
 *  - CEILING reference → any instantaneous/grab/short measurement is a valid
 *    time basis for a ceiling comparison (max-at-any-time).
 *  - Measurement window >= reference window → time basis satisfied
 *    (DIRECTLY_COMPARABLE, subject to non-time conditions elsewhere).
 *  - Measurement window < reference window → SCREENING_COMPARISON_ONLY.
 *  - ANNUAL reference from any single field session → SCREENING_COMPARISON_ONLY
 *    (a short session cannot evaluate an annual mean).
 *  - Unknown measurement time basis → cannot assert compatibility →
 *    SCREENING_COMPARISON_ONLY with an explicit reason code.
 */
export function assessTimeBasis(input: TimeBasisInput): TimeBasisResult {
  const reasonCodes: string[] = []
  const mWin = effectiveMeasurementWindow(input)
  const refPeriod = input.referenceAveragingPeriod
  const rWin = refPeriod ? NOMINAL_WINDOW_MIN[refPeriod] : NaN

  // No time-limited reference: time basis is not the constraint.
  if (!refPeriod) {
    return {
      timeBasisCompatible: true,
      applicability: ComparisonApplicability.DIRECTLY_COMPARABLE,
      reasonCodes: ['REFERENCE_NOT_TIME_LIMITED'],
      measurementWindowMin: mWin,
      referenceWindowMin: rWin,
    }
  }

  // Ceiling reference: instantaneous-capable measurement is appropriate.
  if (refPeriod === AveragingPeriod.CEILING) {
    return {
      timeBasisCompatible: true,
      applicability: ComparisonApplicability.DIRECTLY_COMPARABLE,
      reasonCodes: ['CEILING_REFERENCE_INSTANTANEOUS_BASIS'],
      measurementWindowMin: mWin,
      referenceWindowMin: rWin,
    }
  }

  // Unknown measurement time basis: cannot assert compatibility.
  if (Number.isNaN(mWin)) {
    return {
      timeBasisCompatible: false,
      applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY,
      reasonCodes: ['MEASUREMENT_TIME_BASIS_UNKNOWN'],
      measurementWindowMin: mWin,
      referenceWindowMin: rWin,
    }
  }

  // Annual reference cannot be evaluated from a field session.
  if (refPeriod === AveragingPeriod.ANNUAL) {
    return {
      timeBasisCompatible: false,
      applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY,
      reasonCodes: ['ANNUAL_MEAN_NOT_EVALUABLE_FROM_SESSION'],
      measurementWindowMin: mWin,
      referenceWindowMin: rWin,
    }
  }

  // Core comparison.
  if (mWin >= rWin) {
    reasonCodes.push('MEASUREMENT_WINDOW_MEETS_REFERENCE_PERIOD')
    return {
      timeBasisCompatible: true,
      applicability: ComparisonApplicability.DIRECTLY_COMPARABLE,
      reasonCodes,
      measurementWindowMin: mWin,
      referenceWindowMin: rWin,
    }
  }

  reasonCodes.push('MEASUREMENT_SHORTER_THAN_REFERENCE_PERIOD')
  return {
    timeBasisCompatible: false,
    applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY,
    reasonCodes,
    measurementWindowMin: mWin,
    referenceWindowMin: rWin,
  }
}
