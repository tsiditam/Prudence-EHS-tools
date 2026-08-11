/**
 * AtmosFlow 3.0 — Airborne Contaminants domain rules (Phase 15).
 *
 * Every contaminant comparison is routed through the reference-applicability
 * engine (parameter + time-basis + OEL strategy), so a spot reading above an
 * averaged standard is a screening comparison — never an exceedance. The
 * interpretation language rendered by a finding is taken from the applicability
 * assessment's allowed/prohibited strings.
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
  OelComparisonStatus,
  ReferenceAssessment,
} from '../types'
import { assessReferenceApplicability, MeasurementForComparison } from '../applicability'
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

const D = InvestigationDomain.AIRBORNE_CONTAMINANTS

/** Contaminant screening measurements are spot/grab in the general IAQ context. */
function spot(parameter: string, value: number): MeasurementForComparison {
  return { parameter, value, averagingPeriod: AveragingPeriod.GRAB, context: 'general_indoor' }
}

function priorityFromApplicability(ra: ReferenceAssessment): InvestigationPriority {
  if (ra.oelStatus === OelComparisonStatus.OEL_EXCEEDANCE_SUPPORTED) return InvestigationPriority.IMMEDIATE_EVALUATION
  if (!ra.numericallyAboveValue) return InvestigationPriority.ROUTINE
  // Above a mandatory (enforceable) reference → priority; above an advisory
  // reference → attention. Advisory exceedances are not urgent by themselves.
  return ra.reference?.mandatory ? InvestigationPriority.PRIORITY : InvestigationPriority.ATTENTION
}

export function assessContaminants(z: ZoneObservation, ctx: InvestigationContext): InvestigationFinding[] {
  const zoneId = z.zid || z.zn || 'zone'
  const findings: InvestigationFinding[] = []

  // ── CO ──
  const co = num(z.co)
  if (co !== undefined) {
    const ra = assessReferenceApplicability(spot('co', co), REFERENCES.co_osha_pel)
    const above = ra.numericallyAboveValue === true
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-CONT-CO',
        domain: D,
        parameter: 'co',
        observedCondition: `Carbon monoxide measured at ${co} ppm (spot reading).`,
        evidence: [measurementEvidence(zoneId, 'co', `${co} ppm CO`, ctx)],
        evidenceStrength: above ? EvidenceStrength.MODERATE : EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['CO spot reading'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['time-weighted CO measurement', 'combustion-source inspection'],
          interpretationConstraints: ['Spot reading is not an 8-hour TWA; the OSHA PEL averaging basis is not satisfied by a grab sample.'],
          nextBestMeasurement: above ? 'Identify the combustion source and characterize CO over a representative period.' : undefined,
        },
        referenceAssessment: ra,
        findingStatus: above ? FindingStatus.CONDITION_IDENTIFIED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx), 'SINGLE_TIME_POINT'],
        investigationPriority: above ? InvestigationPriority.PRIORITY : InvestigationPriority.ROUTINE,
        limitations: ['Spot CO reading; not a time-weighted exposure. Interim policy: CO numerically above the OSHA PEL is a priority screening trigger pending professional review (open question #2).'],
        prohibitedInterpretations: ra.prohibitedInterpretations,
        recommendedNextActions: above
          ? [nextAction({ actionType: 'INSPECT', description: 'Inspect for combustion sources / flue spillage and characterize CO over a representative period.', rationale: 'Spot CO above the OSHA PEL warrants source identification.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY, professionalRequired: true })]
          : [],
        citations: [REFERENCES.co_osha_pel.citation, REFERENCES.co_niosh_rel.citation],
        professionalReviewRequired: above,
      }),
    )
  }

  // ── Formaldehyde ──
  const hc = num(z.hc)
  if (hc !== undefined) {
    const ref = hc > (REFERENCES.hcho_osha_pel.value as number) ? REFERENCES.hcho_osha_pel
      : hc > (REFERENCES.hcho_osha_al.value as number) ? REFERENCES.hcho_osha_al
      : REFERENCES.hcho_niosh_rel
    const ra = assessReferenceApplicability(spot('hcho', hc), ref)
    const above = ra.numericallyAboveValue === true
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-CONT-HCHO',
        domain: D,
        parameter: 'hcho',
        observedCondition: `Formaldehyde measured at ${hc} ppm (screening).`,
        evidence: [measurementEvidence(zoneId, 'hcho', `${hc} ppm formaldehyde`, ctx)],
        evidenceStrength: EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['formaldehyde screening reading'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['method-appropriate sampling (e.g. NIOSH 2016)', 'source identification'],
          interpretationConstraints: ['Screening reading; distinguish OSHA regulatory values from NIOSH ceiling recommendation and general-IAQ context.'],
        },
        referenceAssessment: ra,
        findingStatus: above ? FindingStatus.CONDITION_IDENTIFIED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx), 'SINGLE_TIME_POINT'],
        investigationPriority: priorityFromApplicability(ra),
        limitations: ['Screening reading only; formaldehyde reference basis is pending primary-source verification (open question #3).'],
        prohibitedInterpretations: ra.prohibitedInterpretations,
        recommendedNextActions: above
          ? [nextAction({ actionType: 'SAMPLE', description: 'Collect a method-appropriate formaldehyde sample (e.g. NIOSH 2016) and identify emitting sources.', rationale: 'Screening reading above the applicable reference warrants confirmation.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY })]
          : [],
        citations: [ref.citation],
        professionalReviewRequired: ra.professionalReviewRequired,
      }),
    )
  }

  // ── PM2.5 ──
  const pm = num(z.pm)
  if (pm !== undefined) {
    const ra = assessReferenceApplicability(
      { parameter: 'pm2.5', value: pm, durationMinutes: 15, context: 'general_indoor' },
      REFERENCES.pm25_epa_24h,
    )
    const pmo = num(z.pmo)
    const above = ra.numericallyAboveValue === true
    const ioRatio = pmo && pmo > 0 ? Math.round((pm / pmo) * 100) / 100 : undefined
    const indoorSource = ioRatio !== undefined && ioRatio > 2
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-CONT-PM25',
        domain: D,
        parameter: 'pm2.5',
        observedCondition: `Indoor PM2.5 measured at ${pm} µg/m³ (spot)${pmo !== undefined ? `; outdoor ${pmo} µg/m³ (I/O ${ioRatio})` : ''}.`,
        evidence: [measurementEvidence(zoneId, 'pm2.5', `${pm} µg/m³ PM2.5`, ctx, { durationMinutes: 15, outdoorReferenceAvailable: pmo !== undefined })],
        evidenceStrength: indoorSource ? EvidenceStrength.MODERATE : EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: pmo !== undefined ? ['indoor PM2.5', 'outdoor PM2.5'] : ['indoor PM2.5'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: [
            ...(pmo === undefined ? ['concurrent outdoor PM2.5 reference'] : []),
            '24-hour representative dataset',
          ],
          interpretationConstraints: ['Spot reading is not a 24-hour mean; NAAQS averaging period is not satisfied.'],
          nextBestMeasurement: pmo === undefined ? 'Collect a concurrent outdoor PM2.5 reference.' : undefined,
        },
        referenceAssessment: ra,
        findingStatus: indoorSource ? FindingStatus.CONDITION_IDENTIFIED : (above ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.NO_CONCERN_IDENTIFIED),
        confidenceReasons: [
          ...contextReasons(ctx),
          'SINGLE_TIME_POINT',
          ...(pmo === undefined ? (['OUTDOOR_REFERENCE_NOT_AVAILABLE'] as const) : []),
        ],
        investigationPriority: indoorSource ? InvestigationPriority.PRIORITY : (above ? InvestigationPriority.ATTENTION : InvestigationPriority.ROUTINE),
        limitations: [
          'Spot PM2.5 reading numerically compared to a 24-hour standard for screening only; not an exceedance.',
          ...(indoorSource ? [`Indoor/outdoor PM2.5 ratio ${ioRatio} (>2.0) indicates an indoor particulate source pattern.`] : []),
        ],
        prohibitedInterpretations: [...ra.prohibitedInterpretations, 'EPA PM2.5 standard exceeded'],
        recommendedNextActions: [
          ...(pmo === undefined ? [nextAction({ actionType: 'MEASURE', description: 'Collect a concurrent outdoor PM2.5 reference to interpret the indoor reading.', rationale: 'Without an outdoor reference, indoor elevation cannot be attributed to building sources.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })] : []),
          ...(indoorSource ? [nextAction({ actionType: 'INSPECT', description: 'Investigate indoor particulate sources and filtration performance.', rationale: 'I/O ratio > 2.0 indicates an indoor source.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.PRIORITY })] : []),
        ],
        citations: [REFERENCES.pm25_epa_24h.citation, REFERENCES.pm25_who_24h.citation],
        professionalReviewRequired: false,
      }),
    )
  }

  // ── TVOC (investigative indicator only) ──
  const tv = num(z.tv)
  if (tv !== undefined) {
    const ra = assessReferenceApplicability(spot('tvoc', tv), REFERENCES.tvoc_molhave_advisory)
    const above = ra.numericallyAboveValue === true
    findings.push(
      buildFinding(zoneId, ctx, {
        ruleId: 'AF-CONT-TVOC',
        domain: D,
        parameter: 'tvoc',
        observedCondition: `Total VOC screening reading ${tv} µg/m³.`,
        evidence: [measurementEvidence(zoneId, 'tvoc', `${tv} µg/m³ TVOC (PID screening)`, ctx)],
        evidenceStrength: EvidenceStrength.LIMITED,
        dataQuality: {
          requiredEvidencePresent: true,
          presentEvidence: ['TVOC screening reading'],
          missingRequiredEvidence: [],
          missingDesirableEvidence: ['compound-specific speciation (EPA TO-15/TO-17)'],
          interpretationConstraints: ['TVOC does not identify individual compounds and has no consensus health limit.'],
          nextBestMeasurement: above ? 'Speciate via EPA TO-17 (sorbent tube) or TO-15 (canister) if a source investigation is warranted.' : undefined,
        },
        referenceAssessment: {
          ...ra,
          applicability: ComparisonApplicability.CONTEXTUAL_ONLY,
        },
        findingStatus: above ? FindingStatus.FURTHER_EVALUATION_WARRANTED : FindingStatus.NO_CONCERN_IDENTIFIED,
        confidenceReasons: [...contextReasons(ctx), 'SURROGATE_INDICATOR_ONLY'],
        investigationPriority: above ? InvestigationPriority.ATTENTION : InvestigationPriority.ROUTINE,
        limitations: ['TVOC is a screening indicator only; the Mølhave 1991 tiers are advisory and total VOC concentration does not establish toxicity.'],
        prohibitedInterpretations: ['TVOC exceeded a health limit', 'total VOCs establish a health risk', 'TVOC toxic'],
        recommendedNextActions: above
          ? [nextAction({ actionType: 'SAMPLE', description: 'If a source investigation is warranted, speciate VOCs (EPA TO-17/TO-15) and evaluate each compound against its own reference.', rationale: 'TVOC cannot identify the compounds driving any toxicological concern.', addressesFindingIds: [], addressesHypothesisIds: [], priority: InvestigationPriority.ATTENTION })]
          : [],
        citations: [REFERENCES.tvoc_molhave_advisory.citation],
        professionalReviewRequired: false,
      }),
    )
  }

  return findings
}

/** True when ≥2 Tier-1 contaminants (CO, HCHO) are numerically above their OSHA PEL. */
export function multipleTier1Exceedance(z: ZoneObservation): boolean {
  const co = num(z.co)
  const hc = num(z.hc)
  let n = 0
  if (co !== undefined && co > (REFERENCES.co_osha_pel.value as number)) n++
  if (hc !== undefined && hc > (REFERENCES.hcho_osha_pel.value as number)) n++
  return n >= 2
}
