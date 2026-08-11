/**
 * AtmosFlow 3.0 — Deterministic Confidence rules (Phase 9).
 *
 * Confidence answers "how much reliance should be placed on the
 * INTERPRETATION given available evidence and unresolved uncertainty?" — a
 * different question from evidence strength. It is derived from
 * EvidenceStrength plus deterministic reason codes that are rendered in
 * reports. No numeric confidence percentages. "AtmosFlow deterministic
 * investigation methodology."
 */

import {
  ConfidenceLevel,
  ConfidenceReasonCode,
  EvidenceStrength,
  EVIDENCE_STRENGTH_ORDER,
} from './types'

export interface ConfidenceInput {
  evidenceStrength: EvidenceStrength
  reasons: ConfidenceReasonCode[]
}

/** Reason codes that force at least one step of downgrade from the strength-implied ceiling. */
const DOWNGRADING_REASONS = new Set<ConfidenceReasonCode>([
  'OUTDOOR_AIRFLOW_NOT_MEASURED',
  'OUTDOOR_REFERENCE_NOT_AVAILABLE',
  'OCCUPANCY_ESTIMATED',
  'OCCUPANCY_NOT_DOCUMENTED',
  'SHORT_MEASUREMENT_DURATION',
  'SINGLE_TIME_POINT',
  'INSTRUMENT_CALIBRATION_EXPIRED',
  'INSTRUMENT_CALIBRATION_UNKNOWN',
  'INSTRUMENT_ACCURACY_UNKNOWN',
  'SURROGATE_INDICATOR_ONLY',
  'UNCORROBORATED_SINGLE_OBSERVATION',
  'OCCUPANT_OR_FACILITY_REPORT_UNCORROBORATED',
  'CONFLICTING_EVIDENCE_PRESENT',
  'REFERENCE_AVERAGING_PERIOD_MISMATCH',
  'REFERENCE_NOT_DIRECTLY_APPLICABLE',
  'REQUIRED_EVIDENCE_MISSING',
])

/** Reason codes that reflect a hard block on any meaningful reliance. */
const FLOOR_REASONS = new Set<ConfidenceReasonCode>([
  'REQUIRED_EVIDENCE_MISSING',
])

const STRENGTH_CEILING: Record<EvidenceStrength, ConfidenceLevel> = {
  [EvidenceStrength.STRONG]: ConfidenceLevel.HIGH,
  [EvidenceStrength.MODERATE]: ConfidenceLevel.MODERATE,
  [EvidenceStrength.LIMITED]: ConfidenceLevel.LIMITED,
  [EvidenceStrength.INSUFFICIENT]: ConfidenceLevel.INSUFFICIENT,
}

const ORDER: ConfidenceLevel[] = [
  ConfidenceLevel.INSUFFICIENT,
  ConfidenceLevel.LIMITED,
  ConfidenceLevel.MODERATE,
  ConfidenceLevel.HIGH,
]

function stepDown(level: ConfidenceLevel, steps: number): ConfidenceLevel {
  const idx = ORDER.indexOf(level)
  return ORDER[Math.max(0, idx - steps)]
}

/**
 * Derive confidence from the evidence strength ceiling, downgraded by the
 * number of DISTINCT downgrading reason codes present. A REQUIRED_EVIDENCE
 * _MISSING reason floors confidence at INSUFFICIENT.
 */
export function deriveConfidence(input: ConfidenceInput): ConfidenceLevel {
  const distinct = Array.from(new Set(input.reasons))
  if (distinct.some((r) => FLOOR_REASONS.has(r))) {
    return ConfidenceLevel.INSUFFICIENT
  }
  const ceiling = STRENGTH_CEILING[input.evidenceStrength]
  const downgrades = distinct.filter((r) => DOWNGRADING_REASONS.has(r)).length
  // Two or more independent uncertainty drivers step confidence down twice.
  const steps = downgrades >= 2 ? 2 : downgrades >= 1 ? 1 : 0
  return stepDown(ceiling, steps)
}

/**
 * Convenience: evidence strength ceiling with no downgrades. Exposed for
 * callers/tests that want the pre-downgrade ceiling.
 */
export function confidenceCeiling(strength: EvidenceStrength): ConfidenceLevel {
  return STRENGTH_CEILING[strength]
}

export { EVIDENCE_STRENGTH_ORDER }
