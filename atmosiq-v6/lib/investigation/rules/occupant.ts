/**
 * AtmosFlow 3.0 — Occupant Pattern domain rules (Phase 15).
 *
 * Occupant complaints are EVIDENCE supporting investigation, never exposure
 * proof and never causation. Symptom resolution away from the building supports
 * a building-related HYPOTHESIS but does not, by itself, establish causation.
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

const D = InvestigationDomain.OCCUPANT_PATTERN

export function assessOccupant(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  if (z.cx !== 'Yes — complaints reported') return []

  const many = z.ac === 'More than 10' || z.ac === '6-10'
  const cluster = z.cc === 'Yes — this zone'
  const resolvesAway = z.sr === 'Yes — clear pattern'
  const symptoms = present(z.sy) ? (z.sy as string[]).join(', ').toLowerCase() : 'unspecified symptoms'

  const evidence = [observationEvidence(zoneId, 'complaints', `${z.ac ?? 'unspecified'} occupants; symptoms: ${symptoms}`, EvidenceType.OCCUPANT_REPORT)]

  return [
    buildFinding(zoneId, ctx, {
      ruleId: 'AF-OCC-PATTERN',
      domain: D,
      parameter: 'occupant_symptom_pattern',
      observedCondition: `Occupants in this zone reported symptoms (${symptoms})${z.ac ? `; ${z.ac} affected` : ''}${cluster ? '; clustering within this zone was reported' : ''}${resolvesAway ? '; symptoms were reported to improve away from the building' : ''}.`,
      evidence,
      evidenceStrength: many || cluster ? EvidenceStrength.MODERATE : EvidenceStrength.LIMITED,
      dataQuality: {
        requiredEvidencePresent: true,
        presentEvidence: ['occupant report'],
        missingRequiredEvidence: [],
        missingDesirableEvidence: ['occupant denominator', 'time-pattern documentation', 'confounder review'],
        interpretationConstraints: ['Occupant reports support investigation; they do not establish exposure or causation.'],
        nextBestMeasurement: 'Deploy representative time-series logging during reported complaint periods.',
      },
      findingStatus: FindingStatus.FURTHER_EVALUATION_WARRANTED,
      confidenceReasons: ['OCCUPANT_OR_FACILITY_REPORT_UNCORROBORATED'],
      investigationPriority: many ? InvestigationPriority.PRIORITY : InvestigationPriority.ATTENTION,
      limitations: [
        'Occupant reports are investigation-supporting evidence, not exposure measurements.',
        ...(resolvesAway ? ['Improvement away from the building is consistent with, but does not establish, a building-related cause.'] : []),
      ],
      prohibitedInterpretations: [
        'the building caused the symptoms',
        'sick building syndrome was identified',
        'exposure confirmed',
        ...(resolvesAway ? ['symptoms are caused by the building'] : []),
      ],
      recommendedNextActions: [
        nextAction({ actionType: 'INTERVIEW', description: 'Document symptom types, timing, and occupancy denominator; review non-building confounders.', rationale: 'Characterizing the pattern discriminates among candidate hypotheses.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION }),
        nextAction({ actionType: 'MONITOR', description: 'Deploy representative time-series logging during reported complaint periods.', rationale: 'Spot readings may miss the complaint-period conditions.', addressesFindingIds: [], addressesHypothesisIds: [], priority: many ? InvestigationPriority.PRIORITY : InvestigationPriority.ATTENTION }),
      ],
      citations: [{ organization: 'WHO / NIOSH', document: 'SBS vs BRI framework', edition: '1983' }],
      professionalReviewRequired: false,
    }),
  ]
}
