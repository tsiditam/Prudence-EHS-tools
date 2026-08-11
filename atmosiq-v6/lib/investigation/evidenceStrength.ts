/**
 * AtmosFlow 3.0 — Deterministic Evidence-Strength rules (Phase 8).
 *
 * Evidence strength is derived from documented signals, never from a point
 * total. It answers "how strong is the evidence supporting this finding?"
 * (distinct from confidence — see confidence.ts). "AtmosFlow deterministic
 * investigation methodology."
 */

import { EvidenceItem, EvidenceType, EvidenceStrength } from './types'

export interface EvidenceStrengthInput {
  evidence: EvidenceItem[]
  /** Are the domain's required evidence elements present? */
  requiredEvidencePresent: boolean
  /** Does the evidence representatively capture the condition (duration/coverage)? */
  representative?: boolean
  /** Does independent corroborating evidence exist? */
  corroborated?: boolean
  /** Is there material conflicting evidence? */
  conflictingEvidence?: boolean
  /** Is the sole basis a surrogate indicator (e.g. CO2 for ventilation)? */
  surrogateOnly?: boolean
}

const DIRECT_OR_VISUAL = new Set<EvidenceType>([
  EvidenceType.DIRECT_MEASUREMENT,
  EvidenceType.CALCULATED_MEASUREMENT,
  EvidenceType.VISUAL_OBSERVATION,
])

/** A direct/visual evidence item whose calibration is not expired counts as valid direct evidence. */
function hasValidDirectEvidence(evidence: EvidenceItem[]): boolean {
  return evidence.some(
    (e) => DIRECT_OR_VISUAL.has(e.type) && e.calibrationStatus !== 'expired',
  )
}

export function deriveEvidenceStrength(input: EvidenceStrengthInput): EvidenceStrength {
  const { evidence, requiredEvidencePresent } = input

  if (!evidence.length || !requiredEvidencePresent) {
    return EvidenceStrength.INSUFFICIENT
  }

  const directValid = hasValidDirectEvidence(evidence)

  // Surrogate-only basis (e.g. CO2 as a ventilation surrogate).
  if (input.surrogateOnly) {
    return input.representative && input.corroborated
      ? EvidenceStrength.MODERATE
      : EvidenceStrength.LIMITED
  }

  // No valid direct/visual evidence → relying on reports/inference or an
  // invalid (e.g. expired-calibration) measurement.
  if (!directValid) {
    return input.corroborated ? EvidenceStrength.MODERATE : EvidenceStrength.LIMITED
  }

  // Valid direct/visual evidence present.
  if (input.conflictingEvidence) {
    // Conflict caps strength at moderate until resolved.
    return EvidenceStrength.MODERATE
  }
  if (input.representative) {
    return EvidenceStrength.STRONG
  }
  // Credible but context unresolved (e.g. not representative).
  return EvidenceStrength.MODERATE
}
