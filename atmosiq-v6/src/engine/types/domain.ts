/**
 * AtmosFlow Engine v2.1 — Core Domain Types
 * Finding, CategoryScore, ZoneScore, AssessmentScore
 */

import type { Citation } from './citation'
import type { SamplingContext } from './reading'

// ── Identity Types ──

export type FindingId = string & { readonly __brand: 'FindingId' }
export type ZoneId = string & { readonly __brand: 'ZoneId' }
export type CategoryName = 'Ventilation' | 'Contaminants' | 'HVAC' | 'Complaints' | 'Environment'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'
export type Tier = 'Critical' | 'High Risk' | 'Moderate' | 'Low Risk'

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

export interface Finding {
  readonly id: FindingId
  readonly category: CategoryName
  readonly zoneId: ZoneId | null

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

// ── Assessment Score ──

export interface AssessmentScore {
  readonly siteScore: number | null
  readonly siteTier: Tier | null
  readonly zones: ReadonlyArray<ZoneScore>
  readonly confidenceValue: number
  readonly confidenceBand: CIHConfidenceTier
  readonly defensibilityFlags: DefensibilityFlags
  readonly meta: AssessmentMeta
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

export interface AssessmentMeta {
  readonly siteName: string
  readonly siteAddress: string
  readonly assessmentDate: string
  readonly preparingAssessor: AssessorRef
  readonly reviewingProfessional?: QualifiedProfessional
  readonly reviewStatus: ReviewStatus
  readonly issuingFirm: IssuingFirm
}
