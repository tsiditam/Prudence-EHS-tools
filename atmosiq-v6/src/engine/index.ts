/**
 * AtmosFlow Engine v2.1
 * CIH-defensible IAQ assessment engine.
 *
 * Core principle: Engine decides what language is permitted.
 * Narrative AI writes only within those permissions.
 */

export { ENGINE_VERSION } from './types/citation'
export type { Citation, Cited } from './types/citation'

export type {
  Finding, FindingId, ZoneId, CategoryName, Severity, Tier,
  ConditionType, CIHConfidenceTier, ProfessionalOpinionTier,
  EvidenceBasisKind, EvidenceBasis,
  SamplingAdequacyEvaluation, InstrumentAccuracyOutcome,
  RecommendedAction, PhraseLibraryEntry,
  CategoryScore, ZoneScore, AssessmentScore,
  DefensibilityFlags, AssessmentMeta,
  AssessorRef, QualifiedProfessional, ReviewStatus, IssuingFirm,
} from './types/domain'

export type {
  Reading, MeasuredReading, ObservedReading, NotCollectedReading,
  InstrumentRef, SamplingContext,
  SampleType, SamplingContextEnum, SpatialCoverage, TemporalCoverage,
} from './types/reading'

export * from './report/index'
export * from './instruments/index'
