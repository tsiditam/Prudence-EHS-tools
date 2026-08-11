/**
 * AtmosFlow 3.0 — Pollutant Sources & Pathways domain rules (Phase 15).
 *
 * Records observed candidate sources and transport pathways (adjacency,
 * pressure relationships, plenum crosstalk). These are observations that
 * support hypotheses; they do not by themselves establish that a source
 * affected a zone.
 */

import {
  EvidenceStrength,
  EvidenceType,
  FindingStatus,
  InvestigationDomain,
  InvestigationFinding,
  InvestigationPriority,
} from '../types'
import {
  InvestigationContext,
  ZoneObservation,
  buildFinding,
  nextAction,
  observationEvidence,
  present,
} from './common'

const D = InvestigationDomain.POLLUTANT_SOURCES_AND_PATHWAYS

export function assessSourcesPathways(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const sources = [...(z.src_adjacent || []), ...(z.src_internal || [])]
  const negative = z.path_pressure === 'Negative (draws in)'
  const crosstalk = present(z.path_crosstalk) && z.path_crosstalk !== 'None observed'
  if (!sources.length && !negative && !crosstalk) return []

  const parts: string[] = []
  if (sources.length) parts.push(`candidate sources observed (${sources.join(', ')})`)
  if (negative) parts.push('the zone was under negative pressure (draws air in)')
  if (crosstalk) parts.push(`odor/air migration pathway reported (${z.path_crosstalk})`)

  return [
    buildFinding(zoneId, ctx, {
      ruleId: 'AF-SRC-PATHWAY',
      domain: D,
      parameter: 'sources_and_pathways',
      observedCondition: `Source/pathway observations: ${parts.join('; ')}.`,
      evidence: [observationEvidence(zoneId, 'sources', parts.join('; '), EvidenceType.VISUAL_OBSERVATION)],
      evidenceStrength: EvidenceStrength.LIMITED,
      dataQuality: {
        requiredEvidencePresent: true,
        presentEvidence: ['source/pathway observation'],
        missingRequiredEvidence: [],
        missingDesirableEvidence: ['pressure measurement', 'tracer/verification of the transport pathway'],
        interpretationConstraints: ['Observed sources/pathways support hypotheses; they do not establish that a source affected this zone.'],
        nextBestMeasurement: 'Verify pressure relationships and, where warranted, test the transport pathway.',
      },
      findingStatus: FindingStatus.FURTHER_EVALUATION_WARRANTED,
      confidenceReasons: ['UNCORROBORATED_SINGLE_OBSERVATION'],
      investigationPriority: InvestigationPriority.ATTENTION,
      limitations: ['Source/pathway observations support hypothesis generation; causation to this zone is not established.'],
      prohibitedInterpretations: ['the source contaminated this zone', 'exposure pathway confirmed'],
      recommendedNextActions: [nextAction({ actionType: 'VERIFY', description: 'Verify pressure relationships and, where warranted, test the suspected transport pathway (e.g. tracer).', rationale: 'Confirming the pathway discriminates among source hypotheses.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
      citations: [],
      professionalReviewRequired: false,
    }),
  ]
}
