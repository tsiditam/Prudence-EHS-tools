import { describe, it, expect } from 'vitest'
import { assessReferenceApplicability } from '../../lib/investigation/applicability'
import {
  AveragingPeriod,
  ComparisonApplicability,
  OelComparisonStatus,
  ReferenceValue,
} from '../../lib/investigation/types'

const EPA_PM25_24H: ReferenceValue = {
  id: 'epa-pm25-24h',
  organization: 'EPA',
  document: 'NAAQS',
  edition: '2024',
  parameter: 'pm2.5',
  value: 35,
  units: 'µg/m³',
  referenceType: 'public_health_standard',
  averagingPeriod: AveragingPeriod.HOUR_24,
  mandatory: true,
  citation: { organization: 'EPA', document: '40 CFR 50.18', edition: '2024' },
}

const OSHA_CO_PEL: ReferenceValue = {
  id: 'osha-co-pel',
  organization: 'OSHA',
  document: 'PEL 29 CFR 1910.1000',
  edition: 'current',
  parameter: 'co',
  value: 50,
  units: 'ppm',
  referenceType: 'occupational_exposure_limit',
  averagingPeriod: AveragingPeriod.TWA_8_HOUR,
  mandatory: true,
  citation: { organization: 'OSHA', document: '29 CFR 1910.1000 Table Z-1', edition: 'current' },
}

describe('reference applicability engine (Phases 11 & 13)', () => {
  it('parameter mismatch → not comparable', () => {
    const r = assessReferenceApplicability({ parameter: 'co2', value: 1200 }, EPA_PM25_24H)
    expect(r.applicability).toBe(ComparisonApplicability.NOT_COMPARABLE)
    expect(r.reasonCodes).toContain('PARAMETER_MISMATCH')
  })

  it('bibliographic-only reference is contextual, never a comparison threshold', () => {
    const biblio: ReferenceValue = { ...EPA_PM25_24H, referenceType: 'bibliographic_only' }
    const r = assessReferenceApplicability({ parameter: 'pm2.5', value: 40 }, biblio)
    expect(r.applicability).toBe(ComparisonApplicability.CONTEXTUAL_ONLY)
    expect(r.reasonCodes).toContain('REFERENCE_BIBLIOGRAPHIC_ONLY')
  })

  it('spot PM2.5 42 µg/m³ (10 min) vs EPA 24-hr NAAQS → screening only, "numerically above", no exceedance language', () => {
    const r = assessReferenceApplicability(
      { parameter: 'pm2.5', value: 42, durationMinutes: 10 },
      EPA_PM25_24H,
    )
    expect(r.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    expect(r.numericallyAboveValue).toBe(true)
    expect(r.allowedInterpretation.toLowerCase()).toContain('numerically above')
    expect(r.allowedInterpretation.toLowerCase()).toContain('not equivalent to the reference averaging period')
    // No permitted phrasing may assert a standard exceedance.
    expect(r.prohibitedInterpretations.some((p) => /exceed/i.test(p))).toBe(true)
    expect(r.professionalReviewRequired).toBe(false)
  })

  it('24-hr logger PM2.5 below NAAQS on compatible basis → directly comparable, at or below', () => {
    const r = assessReferenceApplicability(
      { parameter: 'pm2.5', value: 20, durationMinutes: 1440 },
      EPA_PM25_24H,
    )
    expect(r.applicability).toBe(ComparisonApplicability.DIRECTLY_COMPARABLE)
    expect(r.numericallyAboveValue).toBe(false)
  })

  it('CO grab 60 ppm vs OSHA 8-hr PEL in a general IAQ context → screening trigger, not TWA exceedance, professional review', () => {
    const r = assessReferenceApplicability(
      { parameter: 'co', value: 60, averagingPeriod: AveragingPeriod.GRAB, context: 'general_indoor' },
      OSHA_CO_PEL,
    )
    expect(r.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    expect(r.oelStatus).not.toBe(OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED)
    expect(r.professionalReviewRequired).toBe(true)
    expect(r.reasonCodes).toContain('OEL_APPLIED_IN_NON_OCCUPATIONAL_CONTEXT')
    expect(r.allowedInterpretation.toLowerCase()).toContain('does not establish an 8-hour twa exceedance')
    expect(r.prohibitedInterpretations.some((p) => /8-hour twa exceeded/i.test(p))).toBe(true)
    expect(r.prohibitedInterpretations.some((p) => /osha violation/i.test(p))).toBe(true)
  })

  it('OEL exceedance is only supported with compatible time basis, supporting strategy, and occupational context', () => {
    const r = assessReferenceApplicability(
      {
        parameter: 'co',
        value: 60,
        durationMinutes: 480,
        averagingPeriod: AveragingPeriod.TWA_8_HOUR,
        context: 'occupational',
        samplingStrategySupportsReference: true,
      },
      OSHA_CO_PEL,
    )
    expect(r.oelStatus).toBe(OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED)
    expect(r.applicability).toBe(ComparisonApplicability.DIRECTLY_COMPARABLE)
    // Even a supported exceedance requires professional review to CALL it a regulatory exceedance.
    expect(r.professionalReviewRequired).toBe(true)
  })

  it('OEL with compatible time basis but undocumented sampling strategy → method-supported screening only', () => {
    const r = assessReferenceApplicability(
      {
        parameter: 'co',
        value: 60,
        durationMinutes: 480,
        averagingPeriod: AveragingPeriod.TWA_8_HOUR,
        context: 'occupational',
        samplingStrategySupportsReference: false,
      },
      OSHA_CO_PEL,
    )
    expect(r.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    expect(r.oelStatus).toBe(OelComparisonStatus.COMPARISON_METHOD_SUPPORTED)
  })
})
