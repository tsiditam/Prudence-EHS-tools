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

/**
 * The tier ONE finding justifies on its own.
 *
 * ── Why this replaced the rule list ────────────────────────────────────
 * The previous rules counted findings before weighing them, and two
 * defects followed:
 *
 *   1. A COUNTING HOLE. "2+ provisional findings at high/medium" meant a
 *      single high-severity measured finding matched no rule at all and
 *      fell through to "no significant concerns identified" — the cleanest
 *      verdict in the system. A room at CO₂ 2,500 ppm produced a report
 *      headed "No significant indoor air quality concerns were identified"
 *      above its own Results paragraph saying outdoor-air delivery was not
 *      keeping pace with occupancy. Two identical findings returned
 *      "further investigation"; one returned nothing.
 *
 *   2. AN EVIDENCE INVERSION. One `qualitative_only` finding reached
 *      monitoring, while one `provisional_screening_level` finding of the
 *      SAME severity reached no-significant-concerns. A visual observation
 *      outranked an instrument measurement.
 *
 * Severity sets the tier; confidence can raise it (documented evidence
 * supports acting rather than investigating) but never lower it below what
 * the severity alone warrants. Two properties fall out, and both are
 * asserted in professional-opinion.test.ts because they are the whole
 * point:
 *
 *   • COUNT-INVARIANCE — one finding and ten identical findings give the
 *     same tier. Volume is not severity.
 *   • MONOTONICITY IN CONFIDENCE — at equal severity, better evidence
 *     never yields a lower tier.
 */
function tierForFinding(f: Finding): ProfessionalOpinionTier {
  const documented = f.confidenceTier === 'validated_defensible'
  switch (f.severityInternal) {
    // A critical condition warrants action on any evidence basis. The
    // bridge already caps observational findings at `high`, so a critical
    // reaching here is a measured exceedance.
    case 'critical':
      return 'conditions_warrant_corrective_action'
    case 'high':
      return documented
        ? 'conditions_warrant_corrective_action'
        : 'conditions_warrant_further_investigation'
    case 'medium':
      return documented
        ? 'conditions_warrant_further_investigation'
        : 'conditions_warrant_monitoring'
    // `low` is an observation, not a concern. The clean case reports "no
    // conditions of concern … individual observations were recorded",
    // which is the wording this tier drives.
    default:
      return 'no_significant_concerns_identified'
  }
}

export function evaluateZoneOpinion(zone: ZoneScore): ProfessionalOpinionTier {
  const findings = zone.categories.flatMap(c => c.findings)
  let worst: ProfessionalOpinionTier = 'no_significant_concerns_identified'
  for (const f of findings) {
    const tier = tierForFinding(f)
    if (TIER_ORDER[tier] > TIER_ORDER[worst]) worst = tier
  }
  return worst
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
    'Conditions warrant ongoing monitoring. Findings should be re-evaluated under representative operational conditions.',
  conditions_warrant_further_investigation:
    'Conditions warrant further investigation. Confirmatory sampling and/or laboratory analysis is recommended before definitive conclusions are drawn.',
  conditions_warrant_corrective_action:
    'Conditions warrant corrective action. Findings supported by direct measurement indicate that prompt remediation and follow-up evaluation are appropriate.',
}

export const CONFIDENCE_TIER_LANGUAGE: Record<CIHConfidenceTier, string> = {
  validated_defensible:
    'Supported by direct measurement or documented evidence collected per recognized methodology.',
  provisional_screening_level:
    'Findings are preliminary; not a substitute for full industrial hygiene exposure assessment.',
  qualitative_only:
    'Findings are based on observations and require confirmatory evaluation.',
  insufficient_data:
    'Available information is insufficient to support a professional conclusion.',
}
