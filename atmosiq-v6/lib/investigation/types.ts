/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 *
 * AtmosFlow 3.0 — Investigation Decision Framework: core type system.
 *
 * This is the canonical, strongly-typed object model for the AtmosFlow 3.0
 * evidence-based IAQ investigation methodology. It REPLACES, for engine
 * version >= 3.0, the 0–100 weighted-category / composite / risk-band model.
 *
 * Scope discipline (why these types exist as they do):
 *   - Findings carry EVIDENCE, DATA QUALITY, REFERENCE APPLICABILITY,
 *     an interpretation (FindingStatus), EVIDENCE STRENGTH, CONFIDENCE,
 *     INVESTIGATION PRIORITY, HYPOTHESIS links, LIMITATIONS,
 *     PROHIBITED interpretations, NEXT ACTIONS, and CITATIONS.
 *   - There is deliberately NO numeric "risk score" field. Any numeric
 *     value used internally for deterministic ordering must never be
 *     rendered or represented as a scientifically meaningful risk estimate.
 *   - Proprietary decision logic is labelled "AtmosFlow deterministic
 *     investigation methodology" and must never be attributed to AIHA,
 *     ASHRAE, OSHA, NIOSH, EPA, WHO, IICRC, ACGIH, or CDC unless the cited
 *     source actually prescribes that methodology.
 *
 * Engine-sacred boundary: this module is ADDITIVE. It imports nothing from
 * src/engines/scoring.js and changes no legacy scoring behaviour. Legacy
 * (engine < 3.0) assessments are routed to the legacy engine unchanged
 * (see version.ts).
 */

// ─────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────

export type FindingId = string
export type HypothesisId = string
export type RuleId = string
export type ActionId = string
export type EvidenceId = string
export type ReferenceId = string

// ─────────────────────────────────────────────────────────────────────────
// Investigation domains (Phase 5) — replace weighted scoring categories.
// Domains carry NO percentage weights. Each produces its own assessment.
// ─────────────────────────────────────────────────────────────────────────

export enum InvestigationDomain {
  VENTILATION_AND_AIR_DISTRIBUTION = 'ventilation_and_air_distribution',
  AIRBORNE_CONTAMINANTS = 'airborne_contaminants',
  MOISTURE_AND_MICROBIAL = 'moisture_and_microbial',
  HVAC_AND_BUILDING_SYSTEMS = 'hvac_and_building_systems',
  THERMAL_ENVIRONMENT = 'thermal_environment',
  POLLUTANT_SOURCES_AND_PATHWAYS = 'pollutant_sources_and_pathways',
  OCCUPANT_PATTERN = 'occupant_pattern',
  DATA_QUALITY_AND_LIMITATIONS = 'data_quality_and_limitations',
  // Specialized module domains (optional):
  DATA_CENTER_ENVIRONMENT = 'data_center_environment',
  BATTERY_ROOM = 'battery_room',
  CLEANROOM = 'cleanroom',
  TARGETED_OCCUPATIONAL_EXPOSURE = 'targeted_occupational_exposure',
}

// ─────────────────────────────────────────────────────────────────────────
// Finding status (Phase 6) — the interpretation, not a score.
// ─────────────────────────────────────────────────────────────────────────

export enum FindingStatus {
  /**
   * Evidence collected WITHIN the defined investigation scope did not
   * identify a condition requiring follow-up. This NEVER means safe,
   * healthy, compliant, hazard-free, or acceptable-in-all-respects. Every
   * rendered use must carry the scope limitation.
   */
  NO_CONCERN_IDENTIFIED = 'no_concern_identified',
  /**
   * A relevant physical condition, measurement pattern, or observation has
   * been directly established. Does NOT by itself establish health risk,
   * causation, or compliance impact.
   */
  CONDITION_IDENTIFIED = 'condition_identified',
  /**
   * Evidence suggests a potentially relevant condition but additional
   * investigation is required before a stronger determination.
   */
  FURTHER_EVALUATION_WARRANTED = 'further_evaluation_warranted',
  /**
   * Available evidence does not support a defensible technical
   * determination. Used INSTEAD of inventing a conclusion.
   */
  INSUFFICIENT_INFORMATION = 'insufficient_information',
}

// ─────────────────────────────────────────────────────────────────────────
// Evidence model (Phase 7)
// ─────────────────────────────────────────────────────────────────────────

export enum EvidenceType {
  DIRECT_MEASUREMENT = 'direct_measurement',
  CALCULATED_MEASUREMENT = 'calculated_measurement',
  VISUAL_OBSERVATION = 'visual_observation',
  OCCUPANT_REPORT = 'occupant_report',
  FACILITY_REPORT = 'facility_report',
  HISTORICAL_RECORD = 'historical_record',
  INFERRED_ASSOCIATION = 'inferred_association',
}

/** Averaging period / measurement time-basis (Phase 12). */
export enum AveragingPeriod {
  INSTANTANEOUS = 'instantaneous',
  GRAB = 'grab',
  SHORT_TERM = 'short_term',
  CEILING = 'ceiling',
  STEL_15_MIN = 'stel_15_min',
  MIN_30 = 'min_30',
  HOUR_1 = 'hour_1',
  TWA_8_HOUR = 'twa_8_hour',
  HOUR_24 = 'hour_24',
  ANNUAL = 'annual',
  OTHER = 'other',
}

export interface EvidenceItem {
  id: EvidenceId
  type: EvidenceType
  source: string
  observation: string
  timestamp?: string
  zoneId?: string
  location?: string
  instrument?: string
  calibrationStatus?: 'current' | 'expired' | 'unknown' | 'not_applicable'
  samplingDurationMinutes?: number
  averagingPeriod?: AveragingPeriod
  occupancyState?: string
  hvacOperatingState?: string
  outdoorReferenceAvailable?: boolean
  uncertainty?: string
  qualityFlags?: string[]
  provenance?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Evidence strength (Phase 8) — deterministic; not a point total.
// ─────────────────────────────────────────────────────────────────────────

export enum EvidenceStrength {
  STRONG = 'strong',
  MODERATE = 'moderate',
  LIMITED = 'limited',
  INSUFFICIENT = 'insufficient',
}

// ─────────────────────────────────────────────────────────────────────────
// Confidence (Phase 9) — reliance on the INTERPRETATION; distinct from
// evidence strength. Carries deterministic reason codes.
// ─────────────────────────────────────────────────────────────────────────

export enum ConfidenceLevel {
  HIGH = 'high',
  MODERATE = 'moderate',
  LIMITED = 'limited',
  INSUFFICIENT = 'insufficient',
}

/**
 * Deterministic, machine-stable confidence reason codes. Rendered in
 * reports so a reviewer can see WHY confidence was set. Extend the union as
 * rules are added; never emit a free-text-only confidence rationale.
 */
export type ConfidenceReasonCode =
  | 'OUTDOOR_AIRFLOW_NOT_MEASURED'
  | 'OUTDOOR_REFERENCE_NOT_AVAILABLE'
  | 'OCCUPANCY_ESTIMATED'
  | 'OCCUPANCY_NOT_DOCUMENTED'
  | 'SHORT_MEASUREMENT_DURATION'
  | 'SINGLE_TIME_POINT'
  | 'INSTRUMENT_CALIBRATION_EXPIRED'
  | 'INSTRUMENT_CALIBRATION_UNKNOWN'
  | 'INSTRUMENT_ACCURACY_UNKNOWN'
  | 'SURROGATE_INDICATOR_ONLY'
  | 'UNCORROBORATED_SINGLE_OBSERVATION'
  | 'OCCUPANT_OR_FACILITY_REPORT_UNCORROBORATED'
  | 'CONFLICTING_EVIDENCE_PRESENT'
  | 'REFERENCE_AVERAGING_PERIOD_MISMATCH'
  | 'REFERENCE_NOT_DIRECTLY_APPLICABLE'
  | 'REQUIRED_EVIDENCE_MISSING'
  | 'DIRECT_MEASUREMENT_REPRESENTATIVE'
  | 'CORROBORATING_EVIDENCE_PRESENT'

// ─────────────────────────────────────────────────────────────────────────
// Investigation priority (Phase 10) — NOT health-risk severity.
// ─────────────────────────────────────────────────────────────────────────

export enum InvestigationPriority {
  /** No expedited follow-up indicated within the investigation scope. */
  ROUTINE = 'routine',
  /** Monitor, maintain, correct, or investigate via normal follow-up. */
  ATTENTION = 'attention',
  /** Prompt investigation or corrective action warranted. */
  PRIORITY = 'priority',
  /** Warrants immediate competent-person/professional evaluation or protective action. */
  IMMEDIATE_EVALUATION = 'immediate_evaluation',
}

// ─────────────────────────────────────────────────────────────────────────
// Reference values & applicability (Phases 11–13)
// ─────────────────────────────────────────────────────────────────────────

export interface TechnicalCitation {
  organization: string
  document: string
  edition: string
  section?: string
  /**
   * True only when the cited organization actually prescribes the
   * methodology being applied. AtmosFlow-created decision logic sets this
   * false and is labelled "AtmosFlow deterministic investigation methodology".
   */
  prescribesMethodology?: boolean
  url?: string
}

export type ReferenceType =
  | 'occupational_exposure_limit'
  | 'recommended_exposure_limit'
  | 'public_health_standard'
  | 'public_health_guideline'
  | 'ventilation_criterion'
  | 'thermal_comfort_criterion'
  | 'investigative_benchmark'
  | 'internal_screening_trigger'
  | 'bibliographic_only'

export interface ReferenceValue {
  id: ReferenceId
  organization: string
  document: string
  edition: string
  section?: string
  parameter: string
  value?: number
  units?: string
  referenceType: ReferenceType
  averagingPeriod?: AveragingPeriod
  population?: string
  application?: string
  /** True = enforceable/mandatory (e.g. OSHA PEL); false = advisory/guidance. */
  mandatory: boolean
  measurementRequirements?: string[]
  applicabilityConditions?: string[]
  limitations?: string[]
  citation: TechnicalCitation
}

export enum ComparisonApplicability {
  /** Same parameter, compatible averaging period, applicable population/context. */
  DIRECTLY_COMPARABLE = 'directly_comparable',
  /** Numerically comparable for screening only (e.g. spot reading vs 24-hr NAAQS). */
  SCREENING_COMPARISON_ONLY = 'screening_comparison_only',
  /** Reference is contextual/background only; no direct comparison supported. */
  CONTEXTUAL_ONLY = 'contextual_only',
  /** The reference does not apply to this measurement. */
  NOT_COMPARABLE = 'not_comparable',
}

/** OEL-specific interpretation state (Phase 13). */
export enum OelComparisonStatus {
  NOT_APPLICABLE = 'not_applicable',
  NUMERICAL_SCREENING_TRIGGER = 'numerical_screening_trigger',
  POTENTIAL_EXPOSURE_CONCERN = 'potential_exposure_concern',
  COMPARISON_METHOD_SUPPORTED = 'comparison_method_supported',
  OEL_EXCEEDANCE_SUPPORTED = 'oel_exceedance_supported',
  PROFESSIONAL_REVIEW_REQUIRED = 'professional_review_required',
}

/** Result of running a measurement + reference through the applicability engine. */
export interface ReferenceAssessment {
  referenceId?: ReferenceId
  reference?: ReferenceValue
  applicability: ComparisonApplicability
  /** Deterministic reason codes explaining the applicability determination. */
  reasonCodes: string[]
  /** Present only for occupational-exposure-limit comparisons. */
  oelStatus?: OelComparisonStatus
  /** Allowed, defensible interpretation sentence(s) for this comparison. */
  allowedInterpretation: string
  /** Phrasings the renderer must NOT emit for this comparison. */
  prohibitedInterpretations: string[]
  numericallyAboveValue?: boolean
  professionalReviewRequired: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Data quality (Phase 19)
// ─────────────────────────────────────────────────────────────────────────

export interface DataQualityAssessment {
  requiredEvidencePresent: boolean
  presentEvidence: string[]
  missingRequiredEvidence: string[]
  missingDesirableEvidence: string[]
  interpretationConstraints: string[]
  /** The single most informative missing measurement, if any. */
  nextBestMeasurement?: string
}

// ─────────────────────────────────────────────────────────────────────────
// Next-best action (Phase 17)
// ─────────────────────────────────────────────────────────────────────────

export type NextActionType =
  | 'MEASURE'
  | 'INSPECT'
  | 'VERIFY'
  | 'SAMPLE'
  | 'INTERVIEW'
  | 'REVIEW_DOCUMENTS'
  | 'CORRECT'
  | 'MONITOR'
  | 'ESCALATE'

export interface NextAction {
  id: ActionId
  actionType: NextActionType
  description: string
  rationale: string
  addressesFindingIds: FindingId[]
  addressesHypothesisIds: HypothesisId[]
  priority: InvestigationPriority
  /** Plain-language description of what resolving this would clarify. */
  expectedInformationGain?: string
  professionalRequired?: boolean
  citations?: TechnicalCitation[]
}

// ─────────────────────────────────────────────────────────────────────────
// Hypotheses (Phase 16)
// ─────────────────────────────────────────────────────────────────────────

export type HypothesisStatus =
  | 'candidate'
  | 'supported'
  | 'not_supported'
  | 'inconclusive'
  | 'confirmed'

export interface InvestigationHypothesis {
  id: HypothesisId
  domain: InvestigationDomain
  statement: string
  status: HypothesisStatus
  supportingEvidenceIds: EvidenceId[]
  contraryEvidenceIds: EvidenceId[]
  unresolvedQuestions: string[]
  nextTests: NextAction[]
  /** Deterministic engine defaults this false; only established causation flips it. */
  causationEstablished: boolean
  confidence: ConfidenceLevel
}

// ─────────────────────────────────────────────────────────────────────────
// The canonical finding (Phase 4)
// ─────────────────────────────────────────────────────────────────────────

export interface InvestigationFinding {
  id: FindingId
  ruleId: RuleId
  engineVersion: string
  domain: InvestigationDomain
  parameter?: string
  observedCondition: string
  evidence: EvidenceItem[]
  evidenceStrength: EvidenceStrength
  dataQuality: DataQualityAssessment
  referenceAssessment?: ReferenceAssessment
  findingStatus: FindingStatus
  confidence: ConfidenceLevel
  confidenceReasons: ConfidenceReasonCode[]
  investigationPriority: InvestigationPriority
  hypothesisLinks?: HypothesisId[]
  limitations: string[]
  /** Interpretations the renderer must never emit for this finding. */
  prohibitedInterpretations: string[]
  recommendedNextActions: NextAction[]
  citations: TechnicalCitation[]
  professionalReviewRequired: boolean
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────
// Assessment summary (Phase 18) — conservatively derived; NOT a risk score.
// ─────────────────────────────────────────────────────────────────────────

export enum AssessmentStatus {
  NO_SIGNIFICANT_CONDITIONS_IDENTIFIED = 'no_significant_conditions_identified',
  CONDITIONS_IDENTIFIED = 'conditions_identified',
  FURTHER_EVALUATION_WARRANTED = 'further_evaluation_warranted',
  INSUFFICIENT_INFORMATION = 'insufficient_information',
}

export interface AssessmentSummary {
  status: AssessmentStatus
  highestPriority: InvestigationPriority
  overallConfidence: ConfidenceLevel
  priorityFindingCount: number
  attentionFindingCount: number
  importantDataGapCount: number
  keyDrivers: string[]
  topNextActions: NextAction[]
}

// ─────────────────────────────────────────────────────────────────────────
// Ordinal helpers — internal deterministic ordering ONLY. These integers are
// NOT risk scores and must never be rendered as scientifically meaningful.
// ─────────────────────────────────────────────────────────────────────────

export const PRIORITY_ORDER: Record<InvestigationPriority, number> = {
  [InvestigationPriority.ROUTINE]: 0,
  [InvestigationPriority.ATTENTION]: 1,
  [InvestigationPriority.PRIORITY]: 2,
  [InvestigationPriority.IMMEDIATE_EVALUATION]: 3,
}

export const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  [ConfidenceLevel.INSUFFICIENT]: 0,
  [ConfidenceLevel.LIMITED]: 1,
  [ConfidenceLevel.MODERATE]: 2,
  [ConfidenceLevel.HIGH]: 3,
}

export const EVIDENCE_STRENGTH_ORDER: Record<EvidenceStrength, number> = {
  [EvidenceStrength.INSUFFICIENT]: 0,
  [EvidenceStrength.LIMITED]: 1,
  [EvidenceStrength.MODERATE]: 2,
  [EvidenceStrength.STRONG]: 3,
}
