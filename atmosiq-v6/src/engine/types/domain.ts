/**
 * AtmosFlow Engine v2.1 — Core Domain Types
 * Finding, CategoryScore, ZoneScore, AssessmentScore
 */

import type { Citation } from './citation'
import type { SamplingContext, InstrumentRef } from './reading'

// ── Identity Types ──

export type FindingId = string & { readonly __brand: 'FindingId' }
export type ZoneId = string & { readonly __brand: 'ZoneId' }
export type HypothesisId = string & { readonly __brand: 'HypothesisId' }
export type CategoryName = 'Ventilation' | 'Contaminants' | 'HVAC' | 'Complaints' | 'Environment'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'
export type Tier = 'Critical' | 'High Risk' | 'Moderate' | 'Low Risk'

/**
 * v2.6 §3 — generate a stable, low-collision Hypothesis id. Caller
 * may supply a deterministic id via the engine's id generator or
 * accept this random one. Test fixtures should pin ids so snapshot
 * comparisons stay stable.
 */
export const newHypothesisId = (): HypothesisId =>
  `hyp_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}` as HypothesisId

// ── Condition Types ──

export type ConditionType =
  | 'ventilation_co2_only'
  | 'ventilation_inadequate_outdoor_air'
  | 'ventilation_observational_only'
  | 'co_above_pel_documented'
  | 'co_screening_elevated'
  | 'hcho_above_pel_documented'
  | 'hcho_screening_elevated'
  | 'tvoc_screening_elevated'
  | 'pm_above_naaqs_documented'
  | 'pm_screening_elevated'
  | 'pm_indoor_amplification_screening'
  | 'particle_screening_only'
  | 'apparent_microbial_growth'
  | 'objectionable_odor'
  | 'possible_corrosive_environment'
  | 'hvac_maintenance_overdue'
  | 'hvac_filter_loaded'
  | 'hvac_filter_below_recommended_class'
  | 'hvac_outdoor_air_damper_compromised'
  | 'hvac_drain_pan_microbial_reservoir'
  | 'occupant_symptoms_anecdotal'
  | 'occupant_cluster_anecdotal'
  | 'symptoms_resolve_away_from_building'
  | 'temperature_outside_comfort'
  | 'temperature_low_data_center'
  | 'humidity_microbial_amplification_range'
  | 'humidity_above_comfort_upper_bound'
  | 'humidity_below_comfort_lower_bound'
  | 'active_or_historical_water_damage'

// ── Confidence & Opinion Tiers ──

export type CIHConfidenceTier =
  | 'validated_defensible'
  | 'provisional_screening_level'
  | 'qualitative_only'
  | 'insufficient_data'

export type ProfessionalOpinionTier =
  | 'no_significant_concerns_identified'
  | 'conditions_warrant_monitoring'
  | 'conditions_warrant_further_investigation'
  | 'conditions_warrant_corrective_action'

// ── Evidence Basis ──

export type EvidenceBasisKind =
  | 'documented_8hr_twa'
  | 'screening_continuous'
  | 'screening_grab'
  | 'visual_olfactory_screening'
  | 'occupant_report_anecdotal'
  | 'occupant_survey_structured'
  | 'documented_records'
  | 'laboratory_speciation'

export interface EvidenceBasis {
  readonly kind: EvidenceBasisKind
  readonly rationale: string
  readonly citationRefs: ReadonlyArray<string>
}

// ── Sampling Adequacy ──

export interface SamplingAdequacyEvaluation {
  readonly forConclusion: boolean
  readonly forScreening: boolean
  readonly forHypothesis: boolean
  readonly rationale: ReadonlyArray<string>
}

// ── Instrument Accuracy ──

export interface InstrumentAccuracyOutcome {
  readonly checked: boolean
  readonly withinNoiseFloor: boolean
  readonly observedValue?: number
  readonly thresholdValue?: number
  readonly tolerance?: number
  readonly note?: string
}

// ── Recommended Actions ──

export interface RecommendedAction {
  readonly priority: 'immediate' | 'short_term' | 'further_evaluation' | 'long_term'
  readonly timeframe: string
  readonly action: string
  readonly standardReference?: string
}

// ── Phrase Library ──

export interface PhraseLibraryEntry {
  readonly conditionType: ConditionType
  readonly intentTemplate: string
  readonly bannedAlternatives: ReadonlyArray<string>
  readonly definitiveConclusionRequires: ReadonlyArray<EvidenceBasisKind>
  readonly causationSupportRequires: ReadonlyArray<EvidenceBasisKind>
  readonly regulatoryConclusionRequires: ReadonlyArray<EvidenceBasisKind>
  readonly defaultLimitations: ReadonlyArray<string>
  readonly defaultRecommendedActions: ReadonlyArray<RecommendedAction>
}

// ── Finding ──

// v2.2 §1b — building-scoped findings (HVAC, water management) render
// once at the building level rather than be exploded across every zone
// the system serves. Zone-scoped findings continue to render per zone.
export type FindingScope = 'zone' | 'building' | 'hvac_system'

export interface Finding {
  readonly id: FindingId
  readonly category: CategoryName
  readonly zoneId: ZoneId | null
  readonly scope: FindingScope

  // INTERNAL ONLY — never rendered to client
  readonly severityInternal: Severity
  readonly titleInternal: string
  readonly observationInternal: string
  readonly deductionInternal: number

  // CIH-defensibility fields
  readonly conditionType: ConditionType
  readonly confidenceTier: CIHConfidenceTier
  readonly definitiveConclusionAllowed: boolean
  readonly causationSupported: boolean
  readonly regulatoryConclusionAllowed: boolean
  readonly approvedNarrativeIntent: string
  readonly evidenceBasis: EvidenceBasis
  readonly samplingAdequacy: SamplingAdequacyEvaluation
  readonly instrumentAccuracyConsidered: InstrumentAccuracyOutcome
  readonly limitations: ReadonlyArray<string>
  readonly recommendedActions: ReadonlyArray<RecommendedAction>

  readonly thresholdSource: string
  readonly observedValue?: string
  readonly thresholdValue?: string
}

// ── Category Score ──

export interface CategoryScore {
  readonly category: CategoryName
  readonly rawScore: number
  readonly cappedScore: number
  readonly maxScore: number
  readonly status: 'scored' | 'insufficient' | 'data_gap' | 'suppressed'
  readonly findings: ReadonlyArray<Finding>
  readonly sufficiencyRatio: number
}

// ── Zone Score ──

export interface ZoneScore {
  readonly zoneId: ZoneId
  readonly zoneName: string
  readonly composite: number | null
  readonly tier: Tier | null
  readonly confidence: CIHConfidenceTier
  readonly categories: ReadonlyArray<CategoryScore>
  readonly professionalOpinion: ProfessionalOpinionTier
}

// ── Hypothesis Engine (v2.6 §3) ──

/**
 * A sampling/diagnostic recommendation attached to a Hypothesis.
 * Tells the inspector what to measure to confirm or refute.
 */
export interface SamplingRecommendation {
  /** What to sample, e.g. "Total culturable fungi (indoor + outdoor paired)". */
  readonly parameter: string
  /** How to sample it, e.g. "Andersen N6 single-stage impactor; NIOSH 0800". */
  readonly method: string
  /** Why this method — what it would establish or refute. */
  readonly rationale: string
}

/**
 * v2.6 §3 — Hypothesis fires on observation patterns BEFORE
 * measurements confirm them. Each hypothesis carries the
 * suggested sampling methodology so the deliverable tells the
 * inspector what to do next, not just what was observed.
 */
export interface Hypothesis {
  readonly id: HypothesisId
  /** Reader-friendly label, e.g. "Bioaerosol amplification". */
  readonly name: string
  /**
   * Free-form observations / findings that triggered this
   * hypothesis (e.g. "Visible mold at southwest wall",
   * "Respiratory symptoms reported by 4 occupants").
   */
  readonly basis: ReadonlyArray<string>
  readonly relatedFindingIds: ReadonlyArray<FindingId>
  readonly suggestedSampling: ReadonlyArray<SamplingRecommendation>
  /** Confidence in the hypothesis itself (not in any finding). */
  readonly cihConfidenceTier: CIHConfidenceTier
}

// ── Causal Chain Engine (v2.6 §2) ──

/**
 * v2.6 §2 — A reasoned link across findings into a synthesized
 * root cause. Fires deterministically when its trigger pattern
 * matches the finding set. `causationSupported` controls whether
 * the renderer is permitted to use causal language for this chain.
 */
export interface CausalChain {
  /** Stable per-rule id — keeps reports reproducible across runs. */
  readonly id: string
  /** Reader-friendly label, e.g. "Moisture-driven microbial amplification". */
  readonly name: string
  readonly relatedFindingIds: ReadonlyArray<FindingId>
  readonly rootCause: string
  readonly causationSupported: boolean
  readonly contributingZones: ReadonlyArray<ZoneId>
  readonly citation: Citation
}

// ── Assessment Input (v2.6 §3 / §4) ──

/**
 * v2.6 §4 — orchestration input for the public `score()` entry
 * point. Wraps the legacy zone-data shape the bridge consumes,
 * preserved as `unknown[]` here to avoid coupling the engine
 * domain to the legacy column-letter field names.
 */
export interface AssessmentInput {
  readonly meta: AssessmentMeta
  /** Legacy zone-data records, one per zone (zn, su, co2, tf, …). */
  readonly zonesData: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** Building-level walkthrough fields (hm, fc, dp, …). */
  readonly buildingData?: Readonly<Record<string, unknown>>
  readonly presurvey?: Readonly<Record<string, unknown>>
  readonly photos?: ReadonlyArray<unknown>
  readonly readingsByInstrument?: Readonly<Record<string, number>>
}

// ── Assessment Score ──

export interface AssessmentScore {
  readonly siteScore: number | null
  readonly siteTier: Tier | null
  readonly zones: ReadonlyArray<ZoneScore>
  readonly confidenceValue: number
  readonly confidenceBand: CIHConfidenceTier
  readonly defensibilityFlags: DefensibilityFlags
  readonly meta: AssessmentMeta
  /**
   * v2.6 §2 — synthesized causal chains tying multiple findings
   * back to a common root cause. Empty when no chain rule fires.
   */
  readonly causalChains: ReadonlyArray<CausalChain>
  /**
   * v2.6 §3 — diagnostic hypotheses with suggested sampling
   * methodology. Empty when no hypothesis trigger fires.
   */
  readonly hypotheses: ReadonlyArray<Hypothesis>
  /**
   * v2.4 §2 — opaque, structurally-typed map of per-parameter
   * range/average/elevated-zone summaries computed from legacy
   * zone-data. Consumed by the report renderer's Results section.
   * Type is `unknown` here to avoid coupling the engine domain to the
   * report layer; the bridge populates it with a `ParameterRangeSet`
   * (see src/engine/report/parameter-ranges.ts).
   */
  readonly parameterRanges?: unknown
  /**
   * v2.4 §2 — original legacy zone-data slice retained for the report
   * renderer's Appendix A per-zone tabulation. Same opacity rationale.
   */
  readonly legacyZonesData?: unknown
  /**
   * v2.5 §5 — optional photo set documented during the assessment.
   * Consumed by the Appendix C builder. Type opaque to avoid
   * coupling the engine domain to the report layer; the bridge or
   * caller populates it with `ReadonlyArray<AssessmentPhoto>` (see
   * src/engine/report/appendix-c.ts).
   */
  readonly photos?: unknown
  /**
   * v2.5 §7 — optional map keyed by instrument model with the
   * count of readings tied to each. When present, instruments with
   * zero readings are filtered from Sampling Methodology and
   * Appendix B.
   */
  readonly readingsByInstrument?: Readonly<Record<string, number>>
}

export interface DefensibilityFlags {
  readonly hasInstrumentData: boolean
  readonly hasCalibrationRecords: boolean
  readonly hasSufficientZoneCoverage: boolean
  readonly hasQualifiedAssessor: boolean
  readonly overallDefensible: boolean
}

// ── Assessment Meta ──

export interface AssessorRef {
  readonly fullName: string
  readonly credentials: ReadonlyArray<string>
}

export interface QualifiedProfessional {
  readonly fullName: string
  readonly credentials: ReadonlyArray<'CIH' | 'CSP' | 'PE' | 'ROH' | 'CHMM' | 'Other'>
  readonly licenseNumbers?: ReadonlyArray<string>
  readonly licensingJurisdictions?: ReadonlyArray<string>
  readonly contact?: { email?: string; phone?: string }
  readonly signatureDate?: string
}

export type ReviewStatus =
  | 'draft_pending_professional_review'
  | 'reviewed_by_qualified_professional'
  | 'final_issued_to_client'

export interface IssuingFirm {
  readonly name: string
  readonly address?: string
  readonly registration?: string
  readonly contact?: { email?: string; phone?: string; website?: string }
}

// v2.2 §3 — letter-format transmittal recipient model
export interface Recipient {
  readonly fullName: string
  readonly title?: string
  readonly organization: string
  readonly addressLine1?: string
  readonly addressLine2?: string
  readonly city?: string
  readonly state?: string
  readonly zip?: string
}

// v2.2 §3 — structured signatory line for letter-format transmittal
export interface SignatoryLine {
  readonly fullName: string
  readonly credentials: ReadonlyArray<string>
  readonly title: string
  readonly licenseNumbers?: ReadonlyArray<string>
}

// v2.2 §3 — letter-format transmittal replaces the v2.1 single
// verbatim paragraph. The body paragraphs are templated and include
// site, recipient, and date references.
export interface TransmittalLetter {
  readonly date: string
  readonly recipient: Recipient
  readonly projectNumber: string
  readonly subjectLine: string
  readonly salutation: string
  readonly bodyParagraphs: ReadonlyArray<string>
  readonly closing: string
  readonly signatoryFirm: string
  readonly preparedBy: ReadonlyArray<SignatoryLine>
}

export interface AssessmentMeta {
  readonly siteName: string
  readonly siteAddress: string
  readonly assessmentDate: string
  readonly preparingAssessor: AssessorRef
  readonly reviewingProfessional?: QualifiedProfessional
  readonly reviewStatus: ReviewStatus
  readonly issuingFirm: IssuingFirm
  // v2.2 §2 — project number rendered on cover, transmittal, and footer
  readonly projectNumber: string
  // v2.2 §3 — letter-format transmittal recipient
  readonly transmittalRecipient: Recipient
  // v2.2 §7 — instruments used during assessment, drives Sampling
  // Methodology section narrative auto-generation
  readonly instrumentsUsed?: ReadonlyArray<InstrumentRef>
}
