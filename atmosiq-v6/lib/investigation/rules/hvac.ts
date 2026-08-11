/**
 * AtmosFlow 3.0 — HVAC & Building Systems domain rules (Phase 15).
 *
 * HVAC conditions are evaluated directly (loaded filter, no filter, drain-pan
 * standing water, no supply airflow). An HVAC deficiency is a physical
 * condition, not a health-risk grade. The critical-hygiene conditions feed the
 * escalation registry (see escalation.ts) — the legacy `gate5` decision,
 * re-expressed conservatively.
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
} from './common'

const D = InvestigationDomain.HVAC_AND_BUILDING_SYSTEMS

export function assessHvac(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const findings: InvestigationFinding[] = []

  const critical = (
    ruleId: string,
    parameter: string,
    observed: string,
    obsValue: string,
    citation?: { organization: string; document: string; edition: string },
  ) =>
    buildFinding(zoneId, ctx, {
      ruleId,
      domain: D,
      parameter,
      observedCondition: observed,
      evidence: [observationEvidence(zoneId, parameter, obsValue, EvidenceType.VISUAL_OBSERVATION)],
      evidenceStrength: EvidenceStrength.STRONG,
      dataQuality: {
        requiredEvidencePresent: true,
        presentEvidence: ['direct visual observation'],
        missingRequiredEvidence: [],
        missingDesirableEvidence: [],
        interpretationConstraints: [],
      },
      findingStatus: FindingStatus.CONDITION_IDENTIFIED,
      confidenceReasons: ['DIRECT_MEASUREMENT_REPRESENTATIVE'],
      investigationPriority: InvestigationPriority.PRIORITY,
      limitations: ['Physical HVAC condition; not a health-risk determination.'],
      prohibitedInterpretations: ['health risk established', 'building is unsafe'],
      recommendedNextActions: [nextAction({ actionType: 'CORRECT', description: `Service the identified HVAC condition (${parameter}).`, rationale: observed, addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY })],
      citations: citation ? [citation] : [],
      professionalReviewRequired: false,
    })

  if (z.dp === 'Standing water' || z.dp === 'Bio growth observed') {
    findings.push(critical('AF-HVAC-DRAINPAN', 'drain_pan', `HVAC drain-pan condition observed: ${z.dp.toLowerCase()} — a moisture/hygiene deficiency. Evaluate for Legionella risk per ASHRAE 188 if the building lacks a Water Management Program.`, z.dp, { organization: 'ASHRAE', document: 'Standard 188', edition: 'current' }))
  }
  if (z.sa === 'No airflow detected') {
    findings.push(critical('AF-HVAC-NOAIR', 'supply_airflow', 'No supply airflow was detected at the diffuser — a significant air-distribution deficiency.', z.sa))
  }
  if (z.fm === 'No filter') {
    findings.push(critical('AF-HVAC-NOFILTER', 'filtration', 'No filtration was installed in the air handler serving this zone.', z.fm))
  }

  // Filter condition (non-critical physical hygiene).
  if (z.fc === 'Heavily loaded' || z.fc === 'Damaged / Bypass') {
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-HVAC-FILTER',
        domain: D,
        parameter: 'filter_condition',
        observedCondition: `Filter condition observed: ${z.fc.toLowerCase()} — degraded filtration performance.`,
        evidence: [observationEvidence(zoneId, 'filter', z.fc, EvidenceType.VISUAL_OBSERVATION)],
        evidenceStrength: EvidenceStrength.STRONG,
        dataQuality: { requiredEvidencePresent: true, presentEvidence: ['visual observation'], missingRequiredEvidence: [], missingDesirableEvidence: [], interpretationConstraints: [] },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: ['DIRECT_MEASUREMENT_REPRESENTATIVE'],
        investigationPriority: InvestigationPriority.ATTENTION,
        limitations: ['Physical condition; downstream air-quality effect not directly measured.'],
        prohibitedInterpretations: ['health risk established'],
        recommendedNextActions: [nextAction({ actionType: 'CORRECT', description: 'Replace filters and verify filter fit/seating to eliminate bypass.', rationale: 'Degraded filtration reduces particulate control.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [],
        professionalReviewRequired: false,
      }),
    )
  }

  // Maintenance history.
  if (z.hm === 'Over 12 months') {
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-HVAC-MAINT',
        domain: D,
        parameter: 'maintenance_recency',
        observedCondition: 'HVAC maintenance was reported as overdue (>12 months).',
        evidence: [observationEvidence(zoneId, 'maintenance', z.hm, EvidenceType.FACILITY_REPORT)],
        evidenceStrength: EvidenceStrength.LIMITED,
        dataQuality: { requiredEvidencePresent: true, presentEvidence: ['facility report'], missingRequiredEvidence: [], missingDesirableEvidence: ['maintenance records'], interpretationConstraints: ['Administrative indicator; reduces confidence rather than establishing a physical deficiency.'] },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: ['OCCUPANT_OR_FACILITY_REPORT_UNCORROBORATED'],
        investigationPriority: InvestigationPriority.ATTENTION,
        limitations: ['Administrative history; a physical inspection was not substituted by this record.'],
        prohibitedInterpretations: ['HVAC caused occupant symptoms'],
        recommendedNextActions: [nextAction({ actionType: 'REVIEW_DOCUMENTS', description: 'Review maintenance records and schedule overdue service.', rationale: 'Maintenance overdue.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [],
        professionalReviewRequired: false,
      }),
    )
  } else if (z.hm === 'Unknown') {
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-HVAC-MAINT-GAP',
        domain: InvestigationDomain.DATA_QUALITY_AND_LIMITATIONS,
        parameter: 'maintenance_recency',
        observedCondition: 'HVAC maintenance history was not available.',
        evidence: [],
        evidenceStrength: EvidenceStrength.INSUFFICIENT,
        dataQuality: { requiredEvidencePresent: false, presentEvidence: [], missingRequiredEvidence: ['maintenance history'], missingDesirableEvidence: [], interpretationConstraints: ['Unknown history reduces confidence; it is not scored as a deficiency.'], nextBestMeasurement: 'Obtain maintenance records from the facility.' },
        findingStatus: FindingStatus.INSUFFICIENT_INFORMATION,
        confidenceReasons: ['REQUIRED_EVIDENCE_MISSING'],
        investigationPriority: InvestigationPriority.ROUTINE,
        limitations: ['Missing information is not interpreted as acceptable condition.'],
        prohibitedInterpretations: ['HVAC is well maintained', 'HVAC deficiency present'],
        recommendedNextActions: [nextAction({ actionType: 'REVIEW_DOCUMENTS', description: 'Obtain HVAC maintenance records.', rationale: 'History unavailable.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ROUTINE })],
        citations: [],
        professionalReviewRequired: false,
      }),
    )
  }

  return findings
}
