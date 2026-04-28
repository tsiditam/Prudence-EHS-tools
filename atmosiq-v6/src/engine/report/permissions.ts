/**
 * AtmosFlow Engine v2.1 — Finding Permissions
 * Engine decides what language the narrative is allowed to use.
 * Pure functions of (finding, context) — never depend on narrative output.
 */

import type { Finding, EvidenceBasisKind, CIHConfidenceTier } from '../types/domain'
import type { SamplingAdequacyEvaluation } from '../types/domain'

export interface FindingPermissions {
  readonly definitiveConclusionAllowed: boolean
  readonly causationSupported: boolean
  readonly regulatoryConclusionAllowed: boolean
  readonly rationale: ReadonlyArray<string>
}

const DEFINITIVE_EVIDENCE: ReadonlyArray<EvidenceBasisKind> = [
  'documented_8hr_twa',
  'laboratory_speciation',
]

export function evaluatePermissions(finding: Finding): FindingPermissions {
  const rationale: string[] = []

  // Definitive conclusion: requires strong evidence AND adequate sampling
  const hasDefinitiveEvidence = DEFINITIVE_EVIDENCE.includes(finding.evidenceBasis.kind)
  const hasAdequateSampling = finding.samplingAdequacy.forConclusion
  const notInNoiseFloor = !finding.instrumentAccuracyConsidered.withinNoiseFloor

  const definitiveConclusionAllowed = hasDefinitiveEvidence && hasAdequateSampling && notInNoiseFloor

  if (definitiveConclusionAllowed) {
    rationale.push(`Definitive conclusion permitted: evidence basis '${finding.evidenceBasis.kind}' with adequate sampling and value outside instrument noise floor.`)
  } else {
    const reasons: string[] = []
    if (!hasDefinitiveEvidence) reasons.push(`evidence basis '${finding.evidenceBasis.kind}' is not definitive (requires documented_8hr_twa or laboratory_speciation)`)
    if (!hasAdequateSampling) reasons.push('sampling adequacy insufficient for conclusion')
    if (!notInNoiseFloor) reasons.push('observed value within instrument accuracy noise floor')
    rationale.push(`Definitive conclusion NOT permitted: ${reasons.join('; ')}.`)
  }

  // Causation: requires the finding itself to be definitive AND causation chain exists
  const causationSupported = definitiveConclusionAllowed && finding.causationSupported

  if (finding.causationSupported && !definitiveConclusionAllowed) {
    rationale.push('Causation chain exists but finding is not definitive — causal language blocked.')
  } else if (causationSupported) {
    rationale.push('Causation supported: finding is definitive and part of a recognized causal chain.')
  }

  // Regulatory conclusion: requires definitive + regulatory threshold exceeded beyond instrument uncertainty
  const regulatoryConclusionAllowed = definitiveConclusionAllowed && finding.regulatoryConclusionAllowed

  if (finding.regulatoryConclusionAllowed && !definitiveConclusionAllowed) {
    rationale.push('Regulatory threshold exceeded but finding is not definitive — regulatory language blocked.')
  } else if (regulatoryConclusionAllowed) {
    rationale.push('Regulatory conclusion permitted: definitive evidence with value exceeding regulatory limit beyond instrument uncertainty.')
  }

  return {
    definitiveConclusionAllowed,
    causationSupported,
    regulatoryConclusionAllowed,
    rationale,
  }
}
