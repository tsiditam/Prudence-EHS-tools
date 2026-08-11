/**
 * AtmosFlow 3.0 — Ventilation & Air Distribution domain rules (Phase 14).
 *
 * Evidence hierarchy (preferred → weakest): direct outdoor-air measurement →
 * complete ventilation calculation → partial airflow → CO₂ + outdoor + occupancy
 * + time series → CO₂ with incomplete context → HVAC observation → occupant
 * report alone. CO₂ is a SURROGATE, never a health limit; a CO₂-only basis can
 * never establish inadequate outdoor-air delivery — it warrants measurement.
 *
 * "AtmosFlow deterministic investigation methodology."
 */

import {
  AveragingPeriod,
  ComparisonApplicability,
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
  contextReasons,
  measurementEvidence,
  nextAction,
  num,
  present,
} from './common'

// ASHRAE 62.1-2025 people-component minimum outdoor air (cfm/person) by space.
const OA_MIN: Record<string, number> = {
  office: 5, classroom: 15, retail: 7.5, healthcare: 5, lab: 10, warehouse: 5,
  manufacturing: 10, conference: 5, data_center: 5, restaurant: 7.5, gymnasium: 20,
  auditorium: 5, library: 5, cafeteria: 7.5, lobby: 5,
}
const CO2_DIFF_SURROGATE = 700
const CO2_ELEVATED = 1000
const CO2_HIGH = 1500

const D = InvestigationDomain.VENTILATION_AND_AIR_DISTRIBUTION

export function assessVentilation(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const cfm = num(z.cfm_person)
  const ach = num(z.ach)
  const co2 = num(z.co2)
  const co2o = num(z.co2o)

  // 1. Direct outdoor-air delivery (strongest ventilation evidence).
  if (cfm !== undefined) {
    const min = OA_MIN[z.su || 'office'] ?? 5
    const below = cfm < min
    return [
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-VENT-CFM',
        domain: D,
        parameter: 'outdoor_air_cfm_per_person',
        observedCondition: below
          ? `Measured outdoor-air delivery ${cfm} cfm/person is below the ASHRAE 62.1-2025 people-component minimum (${min}) for this space type.`
          : `Measured outdoor-air delivery ${cfm} cfm/person meets or exceeds the ASHRAE 62.1-2025 people-component minimum (${min}).`,
        evidence: [measurementEvidence(zoneId, 'cfm_person', `${cfm} cfm/person outdoor-air delivery`, ctx, { type: EvidenceType.CALCULATED_MEASUREMENT })],
        evidenceStrength: EvidenceStrength.MODERATE,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['outdoor-air cfm/person'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['area component (Ra×Az)', 'verified occupancy'],
          interpretationConstraints: ['People-component only; the full ASHRAE 62.1 requirement adds the area component.'],
          nextBestMeasurement: 'Capture the area component and verify occupancy to complete the ventilation calculation.',
        },
        referenceAssessment: {
          referenceId: 'ashrae_621_people_component',
          applicability: ComparisonApplicability.DIRECTLY_COMPARABLE,
          reasonCodes: ['VENTILATION_RATE_COMPARISON'],
          allowedInterpretation: below
            ? `Measured outdoor-air delivery is below the ASHRAE 62.1-2025 people-component minimum for this space type.`
            : `Measured outdoor-air delivery meets the ASHRAE 62.1-2025 people-component minimum for this space type.`,
          prohibitedInterpretations: ['ventilation is compliant with ASHRAE 62.1', 'ventilation is adequate'],
          professionalReviewRequired: false,
        },
        findingStatus: below ? FindingStatus.CONDITION_IDENTIFIED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx), 'DIRECT_MEASUREMENT_REPRESENTATIVE'],
        investigationPriority: below ? InvestigationPriority.PRIORITY : InvestigationPriority.ROUTINE,
        limitations: ['People-component comparison only; area component not captured. Result is within the defined investigation scope.'],
        prohibitedInterpretations: ['compliant with ASHRAE 62.1', 'ventilation adequate in all respects'],
        recommendedNextActions: below
          ? [nextAction({ actionType: 'CORRECT', description: 'Investigate and restore outdoor-air delivery to at least the ASHRAE 62.1-2025 minimum for the space type.', rationale: 'Measured outdoor-air delivery is below the people-component minimum.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY })]
          : [],
        citations: [{ organization: 'ASHRAE', document: 'Standard 62.1 §6.2 (VRP)', edition: '2025', prescribesMethodology: true }],
        professionalReviewRequired: false,
      }),
    ]
  }

  // 2. ACH (secondary).
  if (ach !== undefined) {
    const min = (z.su === 'healthcare' || z.su === 'lab') ? 6 : 4
    const below = ach < min
    return [
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-VENT-ACH',
        domain: D,
        parameter: 'air_changes_per_hour',
        observedCondition: below
          ? `Air changes per hour (${ach}) is below the ${min} ACH benchmark for this space type.`
          : `Air changes per hour (${ach}) meets or exceeds the ${min} ACH benchmark.`,
        evidence: [measurementEvidence(zoneId, 'ach', `${ach} ACH`, ctx, { type: EvidenceType.CALCULATED_MEASUREMENT })],
        evidenceStrength: EvidenceStrength.MODERATE,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['ACH'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['outdoor-air fraction (total vs outdoor ACH)'],
          interpretationConstraints: ['Total ACH is not the same as outdoor ACH; recirculation is not outdoor-air delivery.'],
          nextBestMeasurement: 'Determine the outdoor-air fraction to distinguish total from outdoor ACH.',
        },
        findingStatus: below ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx), 'OUTDOOR_AIRFLOW_NOT_MEASURED'],
        investigationPriority: below ? InvestigationPriority.ATTENTION : InvestigationPriority.ROUTINE,
        limitations: ['ACH does not distinguish outdoor-air delivery from recirculated airflow.'],
        prohibitedInterpretations: ['outdoor-air delivery is adequate', 'ventilation is compliant'],
        recommendedNextActions: [nextAction({ actionType: 'MEASURE', description: 'Measure the outdoor-air fraction to separate total ACH from outdoor ACH.', rationale: 'ACH alone cannot establish outdoor-air adequacy.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [{ organization: 'CDC / ASHRAE 170', document: 'air-change benchmarks', edition: 'current' }],
        professionalReviewRequired: false,
      }),
    ]
  }

  // 3. CO₂ as a ventilation SURROGATE (never a health limit).
  if (co2 !== undefined) {
    const diff = co2o !== undefined ? co2 - co2o : undefined
    const hasOutdoor = co2o !== undefined
    const elevated = co2 > CO2_HIGH || (diff !== undefined ? diff > CO2_DIFF_SURROGATE : co2 > CO2_ELEVATED)
    const reasons = [...contextReasons(ctx), 'SURROGATE_INDICATOR_ONLY' as const, 'OUTDOOR_AIRFLOW_NOT_MEASURED' as const]
    if (!hasOutdoor) reasons.push('OUTDOOR_REFERENCE_NOT_AVAILABLE')
    return [
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-VENT-CO2',
        domain: D,
        parameter: 'co2_ventilation_surrogate',
        observedCondition: elevated
          ? `Occupied-period indoor CO₂ (${co2} ppm${diff !== undefined ? `, Δ${diff} ppm above outdoor` : ''}) is elevated relative to the ventilation surrogate. This is a ventilation indicator, not a contaminant measurement.`
          : `Indoor CO₂ (${co2} ppm${diff !== undefined ? `, Δ${diff} ppm above outdoor` : ''}) is within the screening range for the ventilation surrogate.`,
        evidence: [measurementEvidence(zoneId, 'co2', `${co2} ppm CO₂`, ctx, { type: EvidenceType.DIRECT_MEASUREMENT, averagingPeriod: AveragingPeriod.GRAB, outdoorReferenceAvailable: hasOutdoor })],
        evidenceStrength: EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: hasOutdoor ? ['indoor CO₂', 'outdoor CO₂'] : ['indoor CO₂'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: [
            'direct outdoor-air delivery measurement',
            ...(hasOutdoor ? [] : ['simultaneous outdoor CO₂']),
            'verified occupancy',
            'representative CO₂ time series',
          ],
          interpretationConstraints: [
            'CO₂ is a ventilation-effectiveness surrogate; a CO₂-only basis cannot establish inadequate outdoor-air delivery.',
          ],
          nextBestMeasurement: 'Measure outdoor-air delivery (cfm/person) under representative occupancy and HVAC operating conditions.',
        },
        referenceAssessment: {
          referenceId: 'co2_ventilation_surrogate',
          applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY,
          reasonCodes: ['CO2_SURROGATE_NOT_A_HEALTH_LIMIT'],
          allowedInterpretation: elevated
            ? 'The occupied-period CO₂ differential is elevated relative to the ventilation surrogate; available evidence supports additional ventilation evaluation but does not establish inadequate outdoor-air delivery.'
            : 'The CO₂ differential is within the screening range for the ventilation surrogate.',
          prohibitedInterpretations: ['CO₂ exceeded the safe limit', 'CO₂ health limit exceeded', 'inadequate outdoor-air delivery'],
          professionalReviewRequired: false,
        },
        findingStatus: elevated ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: reasons,
        investigationPriority: elevated
          ? (co2 > CO2_HIGH ? InvestigationPriority.PRIORITY : InvestigationPriority.ATTENTION)
          : InvestigationPriority.ROUTINE,
        limitations: [
          'CO₂ is a ventilation-effectiveness indicator, not an air-quality contaminant. No current ASHRAE standard establishes an indoor CO₂ limit (Persily 2021).',
          ...(hasOutdoor ? [] : ['No simultaneous outdoor CO₂ baseline was available for the differential.']),
        ],
        prohibitedInterpretations: ['CO₂ exceeded the safe limit', 'CO₂ caused occupant symptoms', 'inadequate ventilation confirmed'],
        recommendedNextActions: elevated
          ? [nextAction({ actionType: 'MEASURE', description: 'Measure outdoor-air delivery under representative occupancy and HVAC operating conditions.', rationale: 'A CO₂-only basis cannot establish outdoor-air adequacy; direct measurement would most reduce uncertainty.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY, expectedInformationGain: 'Confirms or rules out inadequate outdoor-air delivery.' })]
          : [],
        citations: [{ organization: 'ASHRAE', document: 'Position Document on Indoor CO₂', edition: '2022' }],
        professionalReviewRequired: false,
      }),
    ]
  }

  // 4. Observational only (airflow / damper), or insufficient.
  if (present(z.sa) || present(z.od)) {
    const weak = z.sa === 'No airflow detected' || z.sa === 'Weak / reduced' || z.od === 'Closed / minimum' || z.od === 'Stuck / inoperable'
    return [
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-VENT-OBS',
        domain: D,
        parameter: 'ventilation_observation',
        observedCondition: weak
          ? `Ventilation observations (supply airflow "${z.sa ?? 'n/a'}", OA damper "${z.od ?? 'n/a'}") suggest reduced air delivery.`
          : `Ventilation observations recorded (supply airflow "${z.sa ?? 'n/a'}", OA damper "${z.od ?? 'n/a'}").`,
        evidence: [observationEvidenceLocal(zoneId, z)],
        evidenceStrength: EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: false,
          presentEvidence: ['ventilation observation'],
          missingRequiredEvidence: ['CO₂ or outdoor-air measurement'],
          missingDesirableEvidence: ['outdoor-air delivery'],
          interpretationConstraints: ['Observation only; no ventilation measurement was captured.'],
          nextBestMeasurement: 'Measure CO₂ (with outdoor reference) or outdoor-air delivery.',
        },
        findingStatus: weak ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.INSUFFICIENT_INFORMATION,
        confidenceReasons: ['REQUIRED_EVIDENCE_MISSING'],
        investigationPriority: weak ? InvestigationPriority.ATTENTION : InvestigationPriority.ROUTINE,
        limitations: ['No ventilation measurement captured; interpretation rests on observation alone.'],
        prohibitedInterpretations: ['ventilation is inadequate', 'ventilation is adequate'],
        recommendedNextActions: [nextAction({ actionType: 'MEASURE', description: 'Measure CO₂ with an outdoor reference, or outdoor-air delivery, under representative conditions.', rationale: 'No ventilation measurement is available.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [],
        professionalReviewRequired: false,
      }),
    ]
  }

  return []
}

function observationEvidenceLocal(zoneId: string, z: ZoneObservation) {
  return {
    id: `ev:${zoneId}:vent_obs`,
    type: EvidenceType.VISUAL_OBSERVATION,
    source: 'walkthrough observation',
    observation: `supply airflow: ${z.sa ?? 'n/a'}; OA damper: ${z.od ?? 'n/a'}`,
    zoneId,
  }
}
