/**
 * AtmosFlow 3.0 — Reference Applicability Engine (Phases 11 & 13).
 *
 * Every benchmark comparison MUST pass through this engine. A direct
 * comparison is never made merely because units match. The engine decides
 * ComparisonApplicability (and, for occupational limits, OelComparisonStatus)
 * and emits both the allowed interpretation and the phrasings that must be
 * suppressed.
 *
 * Pure and deterministic. Labelled "AtmosFlow deterministic investigation
 * methodology": the applicability decision logic is AtmosFlow's, informed by
 * the averaging-period and population definitions the cited standards carry.
 */

import {
  ComparisonApplicability,
  OelComparisonStatus,
  ReferenceValue,
  ReferenceAssessment,
  AveragingPeriod,
} from './types'
import { assessTimeBasis } from './timeBasis'

export interface MeasurementForComparison {
  parameter: string
  value?: number
  averagingPeriod?: AveragingPeriod
  durationMinutes?: number
  /** Investigation context: 'general_indoor' (non-occupational IAQ) or 'occupational'. */
  context?: 'general_indoor' | 'occupational'
  /** Whether the sampling strategy satisfies the reference's method requirements. */
  samplingStrategySupportsReference?: boolean
}

const OEL_TYPES = new Set(['occupational_exposure_limit', 'recommended_exposure_limit'])

function numericallyAbove(m: MeasurementForComparison, ref: ReferenceValue): boolean | undefined {
  if (typeof m.value !== 'number' || typeof ref.value !== 'number') return undefined
  return m.value > ref.value
}

function refLabel(ref: ReferenceValue): string {
  const period = ref.averagingPeriod ? ` ${humanPeriod(ref.averagingPeriod)}` : ''
  return `${ref.organization} ${ref.document}${period} ${ref.parameter} ${ref.referenceType === 'occupational_exposure_limit' ? 'limit' : 'value'}`.replace(/\s+/g, ' ').trim()
}

function humanPeriod(p: AveragingPeriod): string {
  switch (p) {
    case AveragingPeriod.TWA_8_HOUR: return '8-hour TWA'
    case AveragingPeriod.HOUR_24: return '24-hour'
    case AveragingPeriod.ANNUAL: return 'annual'
    case AveragingPeriod.STEL_15_MIN: return '15-minute STEL'
    case AveragingPeriod.CEILING: return 'ceiling'
    case AveragingPeriod.HOUR_1: return '1-hour'
    case AveragingPeriod.MIN_30: return '30-minute'
    default: return String(p)
  }
}

/**
 * Assess whether a measurement may be compared to a reference value, and how.
 */
export function assessReferenceApplicability(
  m: MeasurementForComparison,
  ref: ReferenceValue,
): ReferenceAssessment {
  const above = numericallyAbove(m, ref)

  // 1. Parameter mismatch → not comparable.
  if (m.parameter !== ref.parameter) {
    return {
      referenceId: ref.id,
      reference: ref,
      applicability: ComparisonApplicability.NOT_COMPARABLE,
      reasonCodes: ['PARAMETER_MISMATCH'],
      allowedInterpretation: `${refLabel(ref)} does not apply to the measured parameter (${m.parameter}).`,
      prohibitedInterpretations: [`${ref.parameter} standard exceeded`],
      numericallyAboveValue: above,
      professionalReviewRequired: false,
    }
  }

  // 2. Bibliographic-only references are never a direct comparison basis.
  if (ref.referenceType === 'bibliographic_only') {
    return {
      referenceId: ref.id,
      reference: ref,
      applicability: ComparisonApplicability.CONTEXTUAL_ONLY,
      reasonCodes: ['REFERENCE_BIBLIOGRAPHIC_ONLY'],
      allowedInterpretation: `${refLabel(ref)} is provided as a bibliographic reference for professional consideration; it is not applied as a comparison threshold.`,
      prohibitedInterpretations: [`${ref.parameter} standard exceeded`, `compared against ${ref.document}`],
      numericallyAboveValue: above,
      professionalReviewRequired: false,
    }
  }

  // 3. Time-basis gate.
  const tb = assessTimeBasis({
    measurementAveragingPeriod: m.averagingPeriod,
    measurementDurationMinutes: m.durationMinutes,
    referenceAveragingPeriod: ref.averagingPeriod,
  })
  const reasonCodes = [...tb.reasonCodes]

  // 4. Occupational exposure limits (Phase 13).
  if (OEL_TYPES.has(ref.referenceType)) {
    return assessOel(m, ref, tb.applicability, tb.timeBasisCompatible, above, reasonCodes)
  }

  // 5. Non-OEL references (public-health, ventilation, comfort, investigative).
  if (!tb.timeBasisCompatible) {
    return {
      referenceId: ref.id,
      reference: ref,
      applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY,
      reasonCodes,
      allowedInterpretation: above === undefined
        ? `The measured ${ref.parameter} was compared, for screening only, to the concentration associated with the ${refLabel(ref)}. The measurement time basis is not equivalent to the reference averaging period.`
        : `The measured ${ref.parameter} was numerically ${above ? 'above' : 'at or below'} the concentration associated with the ${refLabel(ref)} during this measurement interval. The measurement time basis is not equivalent to the reference averaging period.`,
      prohibitedInterpretations: [
        `${ref.organization} ${ref.parameter} standard exceeded`,
        `exceeds the ${ref.document}`,
        `${ref.parameter} exceedance`,
      ],
      numericallyAboveValue: above,
      professionalReviewRequired: false,
    }
  }

  // Time basis compatible, non-mandatory advisory reference.
  return {
    referenceId: ref.id,
    reference: ref,
    applicability: ComparisonApplicability.DIRECTLY_COMPARABLE,
    reasonCodes,
    allowedInterpretation: above === undefined
      ? `The measured ${ref.parameter} was compared to the ${refLabel(ref)} (${ref.mandatory ? 'mandatory' : 'advisory'} reference).`
      : `The measured ${ref.parameter} was ${above ? 'above' : 'at or below'} the ${refLabel(ref)} on a compatible time basis (${ref.mandatory ? 'mandatory' : 'advisory'} reference).`,
    prohibitedInterpretations: ref.mandatory
      ? []
      : [`violation of ${ref.document}`, `noncompliant with ${ref.document}`],
    numericallyAboveValue: above,
    professionalReviewRequired: false,
  }
}

function assessOel(
  m: MeasurementForComparison,
  ref: ReferenceValue,
  tbApplicability: ComparisonApplicability,
  timeBasisCompatible: boolean,
  above: boolean | undefined,
  reasonCodes: string[],
): ReferenceAssessment {
  const label = refLabel(ref)
  const prohibited: string[] = [
    `${ref.parameter} 8-hour TWA exceeded`,
    `OSHA violation`,
    `regulatory violation`,
    `worker overexposure confirmed`,
  ]

  // Occupational limit applied in a general (non-occupational) IAQ context:
  // screening trigger at most, professional review to establish applicability.
  const nonOccupationalContext = m.context === 'general_indoor'

  let status: OelComparisonStatus
  let applicability: ComparisonApplicability
  let professionalReviewRequired = false

  if (!timeBasisCompatible) {
    // Spot/short reading vs an averaged OEL → numerical screening trigger only.
    reasonCodes.push('OEL_TIME_BASIS_NOT_SATISFIED')
    status = above
      ? OelComparisonStatus.POTENTIAL_EXPOSURE_CONCERN
      : OelComparisonStatus.NUMERICAL_SCREENING_TRIGGER
    applicability = ComparisonApplicability.SCREENING_COMPARISON_ONLY
    professionalReviewRequired = above === true
  } else if (!m.samplingStrategySupportsReference) {
    // Time basis matches but the sampling strategy (HEG design, method) is not
    // documented as supporting a compliance determination.
    reasonCodes.push('OEL_SAMPLING_STRATEGY_NOT_ESTABLISHED')
    status = OelComparisonStatus.COMPARISON_METHOD_SUPPORTED
    applicability = ComparisonApplicability.SCREENING_COMPARISON_ONLY
    professionalReviewRequired = above === true
  } else {
    // Time basis AND method support the comparison.
    reasonCodes.push('OEL_COMPARISON_METHOD_SUPPORTED')
    if (above) {
      status = OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED
      applicability = ComparisonApplicability.DIRECTLY_COMPARABLE
      // A compliance determination is a professional judgement even when
      // supported by the data.
      professionalReviewRequired = true
    } else {
      status = OelComparisonStatus.COMPARISON_METHOD_SUPPORTED
      applicability = ComparisonApplicability.DIRECTLY_COMPARABLE
    }
  }

  if (nonOccupationalContext) {
    reasonCodes.push('OEL_APPLIED_IN_NON_OCCUPATIONAL_CONTEXT')
    professionalReviewRequired = true
    if (applicability === ComparisonApplicability.DIRECTLY_COMPARABLE) {
      applicability = ComparisonApplicability.SCREENING_COMPARISON_ONLY
    }
    if (status === OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED) {
      status = OelComparisonStatus.PROFESSIONAL_REVIEW_REQUIRED
    }
  }

  const allowed =
    status === OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED
      ? `The measured ${ref.parameter} exceeded the ${label} on a supported measurement basis. Characterization of a regulatory exceedance requires professional review.`
      : above
        ? `The measured ${ref.parameter} was numerically above the ${label}. This is a screening comparison; it does not establish an 8-hour TWA exceedance or a regulatory determination.`
        : `The measured ${ref.parameter} was at or below the ${label} on a screening basis.`

  return {
    referenceId: ref.id,
    reference: ref,
    applicability,
    reasonCodes,
    oelStatus: status,
    allowedInterpretation: allowed,
    prohibitedInterpretations: prohibited,
    numericallyAboveValue: above,
    professionalReviewRequired,
  }
}
