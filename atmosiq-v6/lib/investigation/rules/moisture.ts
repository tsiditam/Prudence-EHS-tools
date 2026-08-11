/**
 * AtmosFlow 3.0 — Moisture & Microbial domain rules (Phase 15).
 *
 * Distinguishes historical staining, active moisture, and visible SUSPECTED
 * microbial growth. Visual discoloration is never "confirmed mold". An active
 * leak that is directly observed is stated as observed (Phase 37 — do not
 * over-hedge direct observation).
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

const D = InvestigationDomain.MOISTURE_AND_MICROBIAL

export function assessMoisture(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const findings: InvestigationFinding[] = []

  // Water condition.
  if (z.wd === 'Extensive damage' || z.wd === 'Active leak') {
    const active = z.wd === 'Active leak'
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-MOIST-WATER',
        domain: D,
        parameter: 'water_intrusion',
        observedCondition: active
          ? 'Active water intrusion was observed.'
          : 'Extensive water damage was observed.',
        evidence: [observationEvidence(zoneId, 'water', z.wd, EvidenceType.VISUAL_OBSERVATION)],
        evidenceStrength: EvidenceStrength.STRONG,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['direct visual observation of moisture'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['moisture mapping', 'concealed-space investigation'],
          interpretationConstraints: [],
          nextBestMeasurement: 'Moisture-map the affected assembly and investigate concealed spaces.',
        },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: ['DIRECT_MEASUREMENT_REPRESENTATIVE'],
        investigationPriority: InvestigationPriority.PRIORITY,
        limitations: ['Extent within concealed assemblies is not established by visual observation alone.'],
        prohibitedInterpretations: ['mold is present', 'health risk established'],
        recommendedNextActions: [
          nextAction({ actionType: 'CORRECT', description: 'Stop the moisture source and dry affected materials on a documented schedule.', rationale: active ? 'Active intrusion supports microbial amplification if not dried.' : 'Extensive water damage supports microbial amplification.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY }),
          nextAction({ actionType: 'INSPECT', description: 'Moisture-map the assembly and investigate concealed spaces for hidden growth.', rationale: 'Concealed growth cannot be ruled out from visible surfaces.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY }),
        ],
        citations: [{ organization: 'IICRC', document: 'S520 (water-damage framework)', edition: '2024' }],
        professionalReviewRequired: false,
      }),
    )
  } else if (z.wd === 'Old staining') {
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-MOIST-STAIN',
        domain: D,
        parameter: 'historical_water',
        observedCondition: 'Historical water staining was observed; no active moisture was established at the time of the walkthrough.',
        evidence: [observationEvidence(zoneId, 'stain', z.wd, EvidenceType.VISUAL_OBSERVATION)],
        evidenceStrength: EvidenceStrength.MODERATE,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['visual observation of staining'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['moisture-meter verification', 'leak history'],
          interpretationConstraints: ['Staining indicates past moisture; it does not establish current moisture.'],
        },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: ['DIRECT_MEASUREMENT_REPRESENTATIVE'],
        investigationPriority: InvestigationPriority.ATTENTION,
        limitations: ['Historical indicator; current moisture not established.'],
        prohibitedInterpretations: ['active leak present', 'mold is present'],
        recommendedNextActions: [nextAction({ actionType: 'VERIFY', description: 'Verify current moisture with a moisture meter and review leak history.', rationale: 'Staining alone does not establish current moisture.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [],
        professionalReviewRequired: false,
      }),
    )
  }

  // Microbial indicators (visible SUSPECTED growth; never "confirmed").
  if (z.mi && z.mi !== 'None') {
    const suspectedOnly = z.mi === 'Suspected discoloration'
    const extensive = z.mi.includes('Extensive')
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-MOIST-MICRO',
        domain: D,
        parameter: 'suspected_microbial_growth',
        observedCondition: suspectedOnly
          ? 'Surface discoloration of uncertain origin was observed; visible suspected microbial growth could not be established.'
          : `Visible suspected microbial growth was observed (${z.mi}).`,
        evidence: [observationEvidence(zoneId, 'microbial', z.mi, EvidenceType.VISUAL_OBSERVATION)],
        evidenceStrength: suspectedOnly ? EvidenceStrength.LIMITED : EvidenceStrength.MODERATE,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['visual observation'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['surface/air sampling with outdoor reference', 'laboratory identification'],
          interpretationConstraints: ['Visual observation does not identify genus/species or confirm viability; there is no health-based airborne spore limit.'],
          nextBestMeasurement: 'Sample per IICRC S520 / AIHA with a simultaneous outdoor reference if identification is warranted.',
        },
        findingStatus: suspectedOnly ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: suspectedOnly ? ['UNCORROBORATED_SINGLE_OBSERVATION'] : ['DIRECT_MEASUREMENT_REPRESENTATIVE'],
        investigationPriority: extensive ? InvestigationPriority.PRIORITY : InvestigationPriority.ATTENTION,
        limitations: ['Visual observation only — not confirmed by sampling. Spore counts are not health proof (IOM 2004; ACMT 2025).'],
        prohibitedInterpretations: ['confirmed mold', 'toxic mold', 'mold caused occupant symptoms'],
        recommendedNextActions: [nextAction({ actionType: 'SAMPLE', description: 'If identification is warranted, sample per IICRC S520 / AIHA methodology with a simultaneous outdoor reference; interpret against outdoor, not absolute numbers.', rationale: 'Visual observation cannot identify or confirm microbial growth.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION, professionalRequired: !suspectedOnly })],
        citations: [{ organization: 'IICRC', document: 'S520', edition: '2024' }, { organization: 'AIHA', document: 'Recognition/Evaluation/Control of Indoor Mold', edition: '2020' }],
        professionalReviewRequired: !suspectedOnly,
      }),
    )
  }

  return findings
}
