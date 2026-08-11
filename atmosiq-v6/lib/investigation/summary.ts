/**
 * AtmosFlow 3.0 — Conservative Assessment Summary derivation (Phase 18).
 *
 * There is NO overall risk score. The summary rolls up domain findings
 * conservatively:
 *  - The presence of one PRIORITY finding sets highestPriority = PRIORITY but
 *    NEVER creates a building-wide health-risk designation.
 *  - Overall confidence is the LOWEST finding confidence among findings that
 *    identified a condition (you cannot claim high overall confidence if the
 *    most relevant finding was uncertain) — mirroring the legacy engine's
 *    "building confidence = lowest zone confidence" principle.
 *  - A single INSUFFICIENT-information finding does not, by itself, make the
 *    whole assessment INSUFFICIENT; but if NO finding reaches at least
 *    CONDITION_IDENTIFIED and important data gaps exist, the assessment is
 *    INSUFFICIENT_INFORMATION rather than "no concerns".
 *
 * "AtmosFlow deterministic investigation methodology."
 */

import {
  AssessmentStatus,
  AssessmentSummary,
  ConfidenceLevel,
  CONFIDENCE_ORDER,
  FindingStatus,
  InvestigationFinding,
  InvestigationPriority,
  NextAction,
  PRIORITY_ORDER,
} from './types'

function maxPriority(findings: InvestigationFinding[]): InvestigationPriority {
  let best: InvestigationPriority = InvestigationPriority.ROUTINE
  for (const f of findings) {
    if (PRIORITY_ORDER[f.investigationPriority] > PRIORITY_ORDER[best]) {
      best = f.investigationPriority
    }
  }
  return best
}

function lowestConfidence(findings: InvestigationFinding[]): ConfidenceLevel {
  if (!findings.length) return ConfidenceLevel.INSUFFICIENT
  return findings.reduce<ConfidenceLevel>((lowest, f) => {
    return CONFIDENCE_ORDER[f.confidence] < CONFIDENCE_ORDER[lowest] ? f.confidence : lowest
  }, ConfidenceLevel.HIGH)
}

export function deriveAssessmentSummary(findings: InvestigationFinding[]): AssessmentSummary {
  const conditionFindings = findings.filter(
    (f) => f.findingStatus === FindingStatus.CONDITION_IDENTIFIED,
  )
  const furtherEval = findings.filter(
    (f) => f.findingStatus === FindingStatus.FURTHER_EVALUATION_WARRANTED,
  )
  const insufficient = findings.filter(
    (f) => f.findingStatus === FindingStatus.INSUFFICIENT_INFORMATION,
  )
  const dataGapFindings = findings.filter(
    (f) => f.dataQuality && f.dataQuality.missingRequiredEvidence.length > 0,
  )

  const priorityFindingCount = findings.filter(
    (f) =>
      PRIORITY_ORDER[f.investigationPriority] >= PRIORITY_ORDER[InvestigationPriority.PRIORITY],
  ).length
  const attentionFindingCount = findings.filter(
    (f) => f.investigationPriority === InvestigationPriority.ATTENTION,
  ).length

  // Conservative status derivation.
  let status: AssessmentStatus
  if (conditionFindings.length > 0) {
    status = AssessmentStatus.CONDITIONS_IDENTIFIED
  } else if (furtherEval.length > 0) {
    status = AssessmentStatus.FURTHER_EVALUATION_WARRANTED
  } else if (insufficient.length > 0 || dataGapFindings.length > 0) {
    status = AssessmentStatus.INSUFFICIENT_INFORMATION
  } else if (findings.length > 0) {
    status = AssessmentStatus.NO_SIGNIFICANT_CONDITIONS_IDENTIFIED
  } else {
    status = AssessmentStatus.INSUFFICIENT_INFORMATION
  }

  // "Conditions identified" that ALSO carries unresolved further-eval work is
  // still surfaced as conditions identified; the further-eval count feeds the
  // next-actions surface, not a downgrade of the headline.

  const relevantForConfidence = [...conditionFindings, ...furtherEval]
  const overallConfidence =
    relevantForConfidence.length > 0
      ? lowestConfidence(relevantForConfidence)
      : lowestConfidence(findings)

  // Top next actions: highest priority first, de-duplicated by id, cap at 5.
  const seen = new Set<string>()
  const topNextActions: NextAction[] = findings
    .flatMap((f) => f.recommendedNextActions)
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority])
    .slice(0, 5)

  const keyDrivers = [...conditionFindings, ...furtherEval]
    .sort(
      (a, b) => PRIORITY_ORDER[b.investigationPriority] - PRIORITY_ORDER[a.investigationPriority],
    )
    .slice(0, 5)
    .map((f) => f.observedCondition)

  return {
    status,
    highestPriority: maxPriority(findings),
    overallConfidence,
    priorityFindingCount,
    attentionFindingCount,
    importantDataGapCount: dataGapFindings.length,
    keyDrivers,
    topNextActions,
  }
}
