/**
 * AtmosFlow Engine v2.1 — Professional Opinion Tier Rollup
 * Maps zone findings to CIH-appropriate qualitative opinion.
 */

import type { ZoneScore, ProfessionalOpinionTier, CIHConfidenceTier, Finding } from '../types/domain'

const TIER_ORDER: Record<ProfessionalOpinionTier, number> = {
  no_significant_concerns_identified: 0,
  conditions_warrant_monitoring: 1,
  conditions_warrant_further_investigation: 2,
  conditions_warrant_corrective_action: 3,
}

export function evaluateZoneOpinion(zone: ZoneScore): ProfessionalOpinionTier {
  const findings = zone.categories.flatMap(c => c.findings)

  // Rule 1: validated_defensible + critical/high → corrective action
  if (findings.some(f => f.confidenceTier === 'validated_defensible' && (f.severityInternal === 'critical' || f.severityInternal === 'high'))) {
    return 'conditions_warrant_corrective_action'
  }

  // Rule 2: any critical regardless of confidence → corrective action
  if (findings.some(f => f.severityInternal === 'critical')) {
    return 'conditions_warrant_corrective_action'
  }

  // Rule 3: validated_defensible + medium → further investigation
  if (findings.some(f => f.confidenceTier === 'validated_defensible' && f.severityInternal === 'medium')) {
    return 'conditions_warrant_further_investigation'
  }

  // Rule 4: 2+ provisional_screening_level at high/medium → further investigation
  const provisionalHighMedium = findings.filter(f =>
    f.confidenceTier === 'provisional_screening_level' &&
    (f.severityInternal === 'high' || f.severityInternal === 'medium')
  )
  if (provisionalHighMedium.length >= 2) {
    return 'conditions_warrant_further_investigation'
  }

  // Rule 5: 1+ qualitative_only at medium+ → monitoring
  if (findings.some(f => f.confidenceTier === 'qualitative_only' &&
    (f.severityInternal === 'critical' || f.severityInternal === 'high' || f.severityInternal === 'medium'))) {
    return 'conditions_warrant_monitoring'
  }

  // Rule 7: otherwise → no significant concerns
  return 'no_significant_concerns_identified'
}

export function evaluateSiteOpinion(zones: ReadonlyArray<ZoneScore>): ProfessionalOpinionTier {
  if (zones.length === 0) return 'no_significant_concerns_identified'

  // Check Rule 6: all insufficient → should trigger refusal-to-issue upstream
  const allInsufficient = zones.every(z =>
    z.categories.flatMap(c => c.findings).every(f => f.confidenceTier === 'insufficient_data')
  )
  if (allInsufficient && zones.some(z => z.categories.flatMap(c => c.findings).length > 0)) {
    return 'conditions_warrant_further_investigation' // upstream should trigger memo
  }

  // Worst-zone rollup
  let worst: ProfessionalOpinionTier = 'no_significant_concerns_identified'
  for (const zone of zones) {
    const zoneOpinion = zone.professionalOpinion
    if (TIER_ORDER[zoneOpinion] > TIER_ORDER[worst]) {
      worst = zoneOpinion
    }
  }
  return worst
}

export const OPINION_TIER_LANGUAGE: Record<ProfessionalOpinionTier, string> = {
  no_significant_concerns_identified:
    'No significant indoor air quality concerns were identified during this assessment within the stated limitations.',
  conditions_warrant_monitoring:
    'Conditions warrant ongoing monitoring. Findings are based on screening-level evaluation and should be re-evaluated under representative operational conditions.',
  conditions_warrant_further_investigation:
    'Conditions warrant further investigation. Confirmatory sampling and/or laboratory analysis is recommended before definitive conclusions are drawn.',
  conditions_warrant_corrective_action:
    'Conditions warrant corrective action. Findings supported by direct measurement indicate that prompt remediation and follow-up evaluation are appropriate.',
}

export const CONFIDENCE_TIER_LANGUAGE: Record<CIHConfidenceTier, string> = {
  validated_defensible:
    'Supported by direct measurement or documented evidence collected per recognized methodology.',
  provisional_screening_level:
    'Findings are preliminary and based on screening-level data; not a substitute for full industrial hygiene exposure assessment.',
  qualitative_only:
    'Findings are based on observations and require confirmatory evaluation.',
  insufficient_data:
    'Available information is insufficient to support a professional conclusion.',
}
