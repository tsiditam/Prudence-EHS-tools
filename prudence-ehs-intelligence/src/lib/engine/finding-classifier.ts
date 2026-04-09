/**
 * Finding Classifier
 * Deterministic classification and severity assessment for findings.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

import type { ExtractedFact } from './fact-extractor';

export type FindingClassification =
  | 'regulatory_deficiency'
  | 'technical_benchmark_gap'
  | 'best_practice_improvement'
  | 'unable_to_determine'
  | 'expert_review_required';

export type FindingSeverity =
  | 'critical'
  | 'high'
  | 'moderate'
  | 'low'
  | 'informational';

export interface MissingEvidence {
  elementKey: string;
  label: string;
  isCritical: boolean;
}

export interface ClassificationContext {
  documentType: string;
  standardTrack: string;
  authorityType: 'regulatory' | 'consensus_standard' | 'guidance' | 'internal_memo';
}

/**
 * Classify a finding based on rule authority, missing evidence, and fact status.
 */
export function classifyFinding(
  rule: {
    findingClassification: string;
    citationBundle: string[];
    topic: string;
  },
  missingEvidence: MissingEvidence[],
  facts: ExtractedFact[]
): FindingClassification {
  const hasContradictions = facts.some(
    (f) => f.factStatus === 'contradicted'
  );

  // Contradictory facts → expert review
  if (hasContradictions) {
    return 'expert_review_required';
  }

  // If all evidence is not_found with zero confidence → unable to determine
  const relevantFacts = facts.filter((f) =>
    missingEvidence.some((me) => me.elementKey === f.factKey)
  );
  const allNotFound = relevantFacts.every(
    (f) => f.factStatus === 'not_found' && f.confidence === 0
  );

  if (allNotFound && missingEvidence.length === 0) {
    return 'unable_to_determine';
  }

  // Use rule's declared classification
  const classification = rule.findingClassification as FindingClassification;
  if (
    [
      'regulatory_deficiency',
      'technical_benchmark_gap',
      'best_practice_improvement',
      'unable_to_determine',
      'expert_review_required',
    ].includes(classification)
  ) {
    return classification;
  }

  return 'unable_to_determine';
}

/**
 * Determine severity based on classification, missing evidence criticality,
 * and rule context.
 */
export function assessSeverity(
  classification: FindingClassification,
  rule: {
    defaultSeverity: string;
    topic: string;
  },
  missingEvidence: MissingEvidence[],
  facts: ExtractedFact[]
): FindingSeverity {
  const hasCriticalMissing = missingEvidence.some((me) => me.isCritical);
  const hasContradictions = facts.some(
    (f) => f.factStatus === 'contradicted'
  );

  // Expert review escalations are always at least high
  if (classification === 'expert_review_required') {
    return hasContradictions ? 'critical' : 'high';
  }

  // Regulatory deficiency with critical element missing → critical
  if (classification === 'regulatory_deficiency' && hasCriticalMissing) {
    return 'critical';
  }

  // Regulatory deficiency without critical → at least high
  if (classification === 'regulatory_deficiency' && missingEvidence.length > 0) {
    return missingEvidence.length >= 3 ? 'critical' : 'high';
  }

  // Technical benchmark gaps
  if (classification === 'technical_benchmark_gap') {
    if (hasCriticalMissing) return 'high';
    if (missingEvidence.length >= 3) return 'moderate';
    return 'low';
  }

  // Best practice items are low or informational
  if (classification === 'best_practice_improvement') {
    return missingEvidence.length > 0 ? 'low' : 'informational';
  }

  // Unable to determine → moderate (needs attention)
  if (classification === 'unable_to_determine') {
    return 'moderate';
  }

  // Fall back to rule's declared severity
  const declared = rule.defaultSeverity as FindingSeverity;
  if (
    ['critical', 'high', 'moderate', 'low', 'informational'].includes(declared)
  ) {
    return declared;
  }

  return 'moderate';
}
