import { describe, it, expect } from 'vitest'
import { assessTimeBasis } from '../../lib/investigation/timeBasis'
import { AveragingPeriod, ComparisonApplicability } from '../../lib/investigation/types'

describe('time-basis validator (Phase 12)', () => {
  it('spot PM2.5 (10 min) vs 24-hour standard → screening comparison only', () => {
    const r = assessTimeBasis({
      measurementDurationMinutes: 10,
      referenceAveragingPeriod: AveragingPeriod.HOUR_24,
    })
    expect(r.timeBasisCompatible).toBe(false)
    expect(r.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    expect(r.reasonCodes).toContain('MEASUREMENT_SHORTER_THAN_REFERENCE_PERIOD')
  })

  it('24-hour logger dataset vs 24-hour standard → directly comparable', () => {
    const r = assessTimeBasis({
      measurementDurationMinutes: 1440,
      referenceAveragingPeriod: AveragingPeriod.HOUR_24,
    })
    expect(r.timeBasisCompatible).toBe(true)
    expect(r.applicability).toBe(ComparisonApplicability.DIRECTLY_COMPARABLE)
  })

  it('grab reading vs a ceiling limit → directly comparable (max at any time)', () => {
    const r = assessTimeBasis({
      measurementAveragingPeriod: AveragingPeriod.GRAB,
      referenceAveragingPeriod: AveragingPeriod.CEILING,
    })
    expect(r.timeBasisCompatible).toBe(true)
    expect(r.applicability).toBe(ComparisonApplicability.DIRECTLY_COMPARABLE)
    expect(r.reasonCodes).toContain('CEILING_REFERENCE_INSTANTANEOUS_BASIS')
  })

  it('15-minute measurement vs 15-minute STEL → compatible', () => {
    const r = assessTimeBasis({
      measurementDurationMinutes: 15,
      referenceAveragingPeriod: AveragingPeriod.STEL_15_MIN,
    })
    expect(r.timeBasisCompatible).toBe(true)
    expect(r.applicability).toBe(ComparisonApplicability.DIRECTLY_COMPARABLE)
  })

  it('grab reading vs 8-hour TWA → screening comparison only', () => {
    const r = assessTimeBasis({
      measurementAveragingPeriod: AveragingPeriod.GRAB,
      referenceAveragingPeriod: AveragingPeriod.TWA_8_HOUR,
    })
    expect(r.timeBasisCompatible).toBe(false)
    expect(r.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
  })

  it('annual reference can never be evaluated from a field session', () => {
    const r = assessTimeBasis({
      measurementDurationMinutes: 1440,
      referenceAveragingPeriod: AveragingPeriod.ANNUAL,
    })
    expect(r.timeBasisCompatible).toBe(false)
    expect(r.reasonCodes).toContain('ANNUAL_MEAN_NOT_EVALUABLE_FROM_SESSION')
  })

  it('unknown measurement time basis cannot assert compatibility', () => {
    const r = assessTimeBasis({ referenceAveragingPeriod: AveragingPeriod.HOUR_24 })
    expect(r.timeBasisCompatible).toBe(false)
    expect(r.reasonCodes).toContain('MEASUREMENT_TIME_BASIS_UNKNOWN')
  })

  it('reference with no averaging period is not time-limited', () => {
    const r = assessTimeBasis({ measurementDurationMinutes: 5 })
    expect(r.timeBasisCompatible).toBe(true)
    expect(r.reasonCodes).toContain('REFERENCE_NOT_TIME_LIMITED')
  })
})
