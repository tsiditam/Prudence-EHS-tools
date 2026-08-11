/**
 * AtmosFlow 3.0 — Thermal Environment domain rules (Phase 15).
 *
 * Temperature and RH are treated as thermal comfort and moisture-management
 * context. A comfort excursion does NOT imply a health-risk grade. Elevated RH
 * is framed as microbial-growth context, not a health verdict.
 */

import {
  ComparisonApplicability,
  EvidenceStrength,
  FindingStatus,
  InvestigationDomain,
  InvestigationFinding,
  InvestigationPriority,
} from '../types'
import { REFERENCES } from '../references'
import {
  InvestigationContext,
  ZoneObservation,
  buildFinding,
  contextReasons,
  measurementEvidence,
  nextAction,
  num,
} from './common'

const D = InvestigationDomain.THERMAL_ENVIRONMENT

// Calendar-independent ASHRAE 55 comfort window that satisfies both seasonal
// ranges (avoids the legacy date-fragility). Outside this → comfort excursion.
const TEMP_COMFORT_MIN = 68.5
const TEMP_COMFORT_MAX = 79

export function assessThermal(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const findings: InvestigationFinding[] = []

  const tf = num(z.tf)
  if (tf !== undefined && (tf < TEMP_COMFORT_MIN || tf > TEMP_COMFORT_MAX)) {
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-THERM-TEMP',
        domain: D,
        parameter: 'temperature',
        observedCondition: `Measured temperature ${tf} °F is outside the ASHRAE 55-2023 comfort window (${TEMP_COMFORT_MIN}–${TEMP_COMFORT_MAX} °F).`,
        evidence: [measurementEvidence(zoneId, 'temperature', `${tf} °F`, ctx)],
        evidenceStrength: EvidenceStrength.MODERATE,
        dataQuality: { requiredEvidencePresent: true, presentEvidence: ['temperature'], missingRequiredEvidence: [], missingDesirableEvidence: ['mean radiant temperature', 'air speed', 'clothing/activity'], interpretationConstraints: ['Single operative-temperature reading; full PMV/PPD context not captured.'] },
        referenceAssessment: { referenceId: 'temp_ashrae55', reference: REFERENCES.temp_ashrae55, applicability: ComparisonApplicability.DIRECTLY_COMPARABLE, reasonCodes: ['COMFORT_CRITERION'], allowedInterpretation: 'Measured temperature is outside the ASHRAE 55 comfort window; this is a thermal-comfort observation.', prohibitedInterpretations: ['temperature is unsafe', 'health risk from temperature'], professionalReviewRequired: false },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx)],
        investigationPriority: InvestigationPriority.ATTENTION,
        limitations: ['Thermal comfort criterion; not a health-risk threshold.'],
        prohibitedInterpretations: ['temperature is unsafe', 'health hazard'],
        recommendedNextActions: [nextAction({ actionType: 'CORRECT', description: 'Adjust setpoints / verify zone control to return operative temperature to the comfort window.', rationale: 'Comfort excursion observed.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })],
        citations: [REFERENCES.temp_ashrae55.citation],
        professionalReviewRequired: false,
      }),
    )
  }

  const rh = num(z.rh)
  if (rh !== undefined && (rh < 30 || rh > 60)) {
    const high = rh > 60
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-THERM-RH',
        domain: D,
        parameter: 'relative_humidity',
        observedCondition: `Measured relative humidity ${rh}% is outside the 30–60% comfort/moisture-management band.`,
        evidence: [measurementEvidence(zoneId, 'relative_humidity', `${rh}%`, ctx)],
        evidenceStrength: EvidenceStrength.MODERATE,
        dataQuality: { requiredEvidencePresent: true, presentEvidence: ['relative humidity'], missingRequiredEvidence: [], missingDesirableEvidence: ['surface/dew-point relationship'], interpretationConstraints: [] },
        referenceAssessment: { referenceId: 'rh_comfort_band', reference: REFERENCES.rh_comfort_band, applicability: ComparisonApplicability.SCREENING_COMPARISON_ONLY, reasonCodes: ['RH_INVESTIGATIVE_BAND'], allowedInterpretation: high ? 'Relative humidity is above the moisture-management band; sustained elevation raises microbial-growth risk.' : 'Relative humidity is below the comfort band; dryness complaints may increase.', prohibitedInterpretations: ['humidity is unsafe'], professionalReviewRequired: false },
        findingStatus: FindingStatus.CONDITION_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx)],
        investigationPriority: high ? InvestigationPriority.ATTENTION : InvestigationPriority.ROUTINE,
        limitations: ['The 30–60% band is a general IAQ/moisture rule of thumb, not an ASHRAE 55 comfort requirement.'],
        prohibitedInterpretations: ['humidity caused illness', 'unsafe humidity'],
        recommendedNextActions: high ? [nextAction({ actionType: 'MONITOR', description: 'Monitor humidity and evaluate moisture sources / dehumidification.', rationale: 'Elevated RH raises microbial-growth risk.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })] : [],
        citations: [REFERENCES.rh_comfort_band.citation],
        professionalReviewRequired: false,
      }),
    )
  }

  return findings
}
