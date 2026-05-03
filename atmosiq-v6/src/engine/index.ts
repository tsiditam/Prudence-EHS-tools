/**
 * AtmosFlow Engine v2.6
 * CIH-defensible IAQ assessment engine.
 *
 * Core principle: Engine decides what language is permitted.
 * Narrative AI writes only within those permissions.
 *
 * v2.6 §4 — `score(input)` is the public orchestration entry point.
 * It composes the legacy scoring pass, the v2.1 bridge mapping, the
 * v2.6 causal-chain pass, and the v2.6 hypothesis pass into a single
 * AssessmentScore. Existing direct callers of `legacyToAssessmentScore`
 * still receive populated `causalChains` and `hypotheses` arrays
 * because the bridge invokes both derivers internally.
 */

export { ENGINE_VERSION } from './types/citation'
export type { Citation, Cited, CitationOrganization } from './types/citation'

export type {
  Finding, FindingId, ZoneId, HypothesisId, CategoryName, Severity, Tier,
  ConditionType, CIHConfidenceTier, ProfessionalOpinionTier,
  EvidenceBasisKind, EvidenceBasis,
  SamplingAdequacyEvaluation, InstrumentAccuracyOutcome,
  RecommendedAction, PhraseLibraryEntry,
  CategoryScore, ZoneScore, AssessmentScore, AssessmentInput,
  DefensibilityFlags, AssessmentMeta,
  AssessorRef, QualifiedProfessional, ReviewStatus, IssuingFirm,
  Hypothesis, CausalChain, SamplingRecommendation,
} from './types/domain'
export { newHypothesisId } from './types/domain'

export type {
  Reading, MeasuredReading, ObservedReading, NotCollectedReading,
  InstrumentRef, SamplingContext,
  SampleType, SamplingContextEnum, SpatialCoverage, TemporalCoverage,
} from './types/reading'

export * from './report/index'
export * from './instruments/index'
export { legacyToAssessmentScore } from './bridge/legacy'
export type { BridgeContext, BridgeOptions } from './bridge/legacy'
export { deriveAssessmentMeta } from './bridge/meta'
export type { MetaInput } from './bridge/meta'

// v2.6 §2 / §3 — public re-exports of the diagnostic-reasoning
// engines. Application code can call them directly when working
// with custom inputs that don't flow through the bridge.
export { deriveCausalChains } from './causal-chains'
export { deriveHypotheses } from './hypotheses'
export type { HypothesisInput } from './hypotheses'

// ── Public API ────────────────────────────────────────────────

import { renderInternalReport } from './report/internal'
import { renderClientReport } from './report/client'
import { legacyToAssessmentScore } from './bridge/legacy'
import { scoreZone, compositeScore } from '../engines/scoring'
import { deriveCausalChains } from './causal-chains'
import { deriveHypotheses } from './hypotheses'
import type { AssessmentInput, AssessmentScore } from './types/domain'

/**
 * v2.6 §4 — `score(input)` is the public engine entry point.
 *
 * Internally it:
 *   1. Runs the per-zone scorer (legacy `scoreZone`).
 *   2. Computes the composite (legacy `compositeScore`).
 *   3. Maps the legacy shape to an `AssessmentScore` via the bridge.
 *   4. Re-derives causal chains via `deriveCausalChains()` so the
 *      orchestration is explicit at this entry point. (Re-derivation
 *      is idempotent; the bridge invoked the same function.)
 *   5. Re-derives hypotheses via `deriveHypotheses()` for the same
 *      reason.
 *
 * The result is structurally identical to `legacyToAssessmentScore()`
 * for the same input — callers may use either entry depending on
 * whether they have an `AssessmentInput` or a pre-scored legacy
 * shape.
 */
export function score(input: AssessmentInput): AssessmentScore {
  const buildingData = input.buildingData ?? {}
  const legacyZoneScores = input.zonesData.map(z => scoreZone(z, buildingData))
  const composite = compositeScore(legacyZoneScores)
  const merged = input.zonesData.map(z => ({ ...z, ...buildingData }))
  const base = legacyToAssessmentScore(
    legacyZoneScores as any,
    composite as any,
    merged as any,
    {
      meta: input.meta,
      presurvey: input.presurvey as any,
      building: buildingData as any,
    },
  )
  // Explicit re-derivation at the public API. The bridge has
  // already populated these fields; we recompute here so the
  // orchestration appears at this entry point and so callers using
  // a custom bridge-bypassing path still see populated arrays.
  const allFindings = base.zones.flatMap(z => z.categories.flatMap(c => c.findings))
  const causalChains = deriveCausalChains(base.zones, allFindings)
  const hypotheses = deriveHypotheses({
    zonesData: input.zonesData,
    buildingData,
    findings: allFindings,
    zones: base.zones,
  })
  const augmented: AssessmentScore = {
    ...base,
    causalChains,
    hypotheses,
    ...(input.photos ? { photos: input.photos } : {}),
    ...(input.readingsByInstrument ? { readingsByInstrument: input.readingsByInstrument } : {}),
  }
  return augmented
}

export const report = {
  internal: renderInternalReport,
  client: renderClientReport,
} as const
