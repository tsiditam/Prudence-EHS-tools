/**
 * AtmosFlow Engine v2.1 — Internal Report Renderer
 * Full scoring, severity, deductions — for operator dashboard only.
 * Never shown to clients.
 */

import type { AssessmentScore } from '../types/domain'
import type { InternalReport, InternalZoneReport, InternalCategoryReport, InternalFindingReport, PrioritizationEntry, ContributingFactor } from './types'
import { ENGINE_VERSION } from '../types/citation'
import { evaluatePermissions } from './permissions'

// v2.6 §6 — types referenced via re-export for downstream tooling.
export type { Hypothesis, CausalChain, SamplingRecommendation } from '../types/domain'

export function renderInternalReport(score: AssessmentScore): InternalReport {
  const zones: InternalZoneReport[] = score.zones.map(z => ({
    zoneId: z.zoneId,
    zoneName: z.zoneName,
    composite: z.composite,
    tier: z.tier,
    confidence: z.confidence,
    categories: z.categories.map(c => ({
      category: c.category,
      rawScore: c.rawScore,
      cappedScore: c.cappedScore,
      maxScore: c.maxScore,
      status: c.status,
      findings: c.findings.map(f => ({
        id: f.id,
        severityInternal: f.severityInternal,
        titleInternal: f.titleInternal,
        observationInternal: f.observationInternal,
        deductionInternal: f.deductionInternal,
        conditionType: f.conditionType,
        confidenceTier: f.confidenceTier,
        permissions: {
          definitiveConclusionAllowed: f.definitiveConclusionAllowed,
          causationSupported: f.causationSupported,
          regulatoryConclusionAllowed: f.regulatoryConclusionAllowed,
        },
      })),
    })),
  }))

  // Build prioritization queue: deduction × confidence weight, descending
  const confWeight: Record<string, number> = {
    validated_defensible: 1.0,
    provisional_screening_level: 0.75,
    qualitative_only: 0.5,
    insufficient_data: 0.25,
  }

  const prioritizationQueue: PrioritizationEntry[] = score.zones.flatMap(z =>
    z.categories.flatMap(c =>
      c.findings
        .filter(f => f.deductionInternal > 0)
        .map(f => ({
          findingId: f.id,
          zone: z.zoneName,
          deduction: f.deductionInternal,
          confidence: f.confidenceTier,
          priority: f.deductionInternal * (confWeight[f.confidenceTier] || 0.5),
        }))
    )
  ).sort((a, b) => b.priority - a.priority)

  // Collect missing data flags
  const missingDataFlags: string[] = []
  for (const z of score.zones) {
    for (const c of z.categories) {
      if (c.status === 'insufficient' || c.status === 'data_gap') {
        missingDataFlags.push(`${z.zoneName}: ${c.category} — ${c.status}`)
      }
    }
  }

  // Collect all sampling recommendations from findings
  const samplingRecommendations = score.zones.flatMap(z =>
    z.categories.flatMap(c =>
      c.findings.flatMap(f =>
        f.recommendedActions.filter(a => a.priority === 'further_evaluation')
      )
    )
  )

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: Date.now(),
    meta: score.meta,
    siteScore: score.siteScore,
    siteTier: score.siteTier,
    confidenceValue: score.confidenceValue,
    confidenceBand: score.confidenceBand,
    defensibilityFlags: score.defensibilityFlags,
    zones,
    // v2.6 §6 — surface the full hypothesis + causal-chain detail
    // for the operator dashboard. The internal report shows
    // everything: confidence tiers, related finding ids, contributing
    // zones, citation, and the causationSupported flag. Distinct
    // from the client report's `potentialContributingFactors` which
    // is a CIH-safe projection of the chains.
    hypotheses: score.hypotheses,
    causalChains: score.causalChains,
    samplingRecommendations,
    prioritizationQueue,
    missingDataFlags,
  }
}
