/**
 * AtmosFlow Engine v2.1 — Report Output Types
 * Two render modes: internal (operator dashboard) and client (CIH deliverable).
 */

import type {
  FindingId, ZoneId, CategoryName, Tier, Severity,
  CIHConfidenceTier, ProfessionalOpinionTier,
  Finding, CategoryScore, ZoneScore, AssessmentScore, AssessmentMeta,
  RecommendedAction, DefensibilityFlags, ReviewStatus,
  TransmittalLetter,
} from '../types/domain'
import type { Citation } from '../types/citation'
import type { FindingGroup } from './finding-groups'
import type { ReportValidation } from './cih-validation'

export type { FindingGroup, FindingObservation, FindingGroupName } from './finding-groups'

// ── Client Report ──

export interface ClientRenderOptions {
  readonly includeAssessmentIndexAppendix?: boolean
  readonly draftWatermark?: boolean
}

export type ClientReportResult =
  | { kind: 'report'; report: ClientReport; validation: ReportValidation }
  | { kind: 'pre_assessment_memo'; memo: PreAssessmentMemo; reasons: ReadonlyArray<string> }

export type { ReportValidation, ValidationIssue, ValidationSeverity, BlockedTermHit } from './cih-validation'

export interface ClientReport {
  readonly engineVersion: string
  readonly generatedAt: number
  readonly meta: AssessmentMeta
  readonly reviewStatus: ReviewStatus
  readonly cover: CoverPage
  // v2.1: single verbatim screening-level disclosure paragraph.
  // v2.2: kept for backward compatibility but the structural transmittal
  // is now in transmittalLetter; the verbatim screening paragraph moved
  // to methodologyDisclosure.
  readonly transmittal: string
  // v2.2 §3 — letter-format transmittal (date, recipient, subject,
  // salutation, body, closing, signatories).
  readonly transmittalLetter: TransmittalLetter
  // v2.2 §3 — Methodology Disclosure section content (between cover
  // and Executive Summary).
  readonly methodologyDisclosure: string
  readonly executiveSummary: ExecutiveSummary
  readonly scopeAndMethodology: string
  // v2.2 §7 — Sampling Methodology section (auto-generated from
  // AssessmentMeta.instrumentsUsed).
  readonly samplingMethodology: SamplingMethodologySection
  readonly buildingAndSystemContext: string
  readonly observedConditionsTable: ReadonlyArray<ObservedConditionRow>
  // v2.2 §1b/§12 — building-scoped findings (HVAC, water management)
  // render once at building level rather than be exploded across every
  // zone the system serves.
  readonly buildingAndSystemConditions: BuildingConditionsSection
  readonly zoneSections: ReadonlyArray<ZoneSection>
  readonly potentialContributingFactors: ReadonlyArray<ContributingFactor>
  readonly recommendationsRegister: RecommendationsRegister
  readonly limitationsAndProfessionalJudgment: string
  readonly signatoryBlock: SignatoryBlock
  readonly appendix: ClientReportAppendix
}

// v2.2 §7 — Sampling Methodology section
export interface SamplingMethodologySection {
  // Per-instrument paragraphs, one per InstrumentRef in
  // AssessmentMeta.instrumentsUsed.
  readonly instrumentParagraphs: ReadonlyArray<string>
  // Overall methodology paragraph covering sample-location selection,
  // outdoor-air comparison sampling, and reference to Appendix B.
  readonly overallParagraph: string
}

export interface CoverPage {
  readonly title: string
  readonly facility: string
  readonly location: string
  readonly date: string
  readonly preparedBy: string
  readonly status: string
  readonly methodologyLine: string
  readonly draftNotice?: string
}

// v2.2 §6 — Executive Summary opens with a 4-row metadata table
// (CTSI format), followed by four narrative blocks. The 29-bullet
// "summary of findings" exhaust dump is removed; the per-finding list
// belongs in Zone-by-Zone Findings, not Executive Summary.
export interface ExecSummaryMetadata {
  readonly clientName: string
  readonly reportDate: string
  readonly projectNumber: string
  readonly surveyDate: string
  readonly projectAddress: string
  readonly surveyArea: string
  readonly requestedBy: string
  readonly siteContact: string
}

export interface ExecutiveSummary {
  readonly metadataTable: ExecSummaryMetadata
  // CTSI-style narrative blocks. Each block is a single multi-sentence
  // paragraph (or list, in the case of observations and
  // recommendations). No numeric scores, no severity tiers.
  readonly scopeOfWork: string
  readonly resultsNarrative: string
  readonly observations: ReadonlyArray<string>
  // v2.2 — findings grouped by reader-friendly domain (Air Quality
  // Indicators / Corrosion Indicators / HVAC System / Environmental
  // Conditions / Occupant Feedback). Each group carries
  // observations with a bold lead term + short statement. Empty
  // groups are not included; an office assessment without corrosion
  // findings simply won't have a "Corrosion Indicators" group.
  readonly findingsByGroup: ReadonlyArray<FindingGroup>
  readonly recommendations: ReadonlyArray<RecommendedAction>
  readonly overallProfessionalOpinion: ProfessionalOpinionTier
  readonly overallProfessionalOpinionLanguage: string
  // v2.1 fields kept for backward compat with consumers that walked
  // overview / summaryOfFindings / priorityActions. These are derived
  // values; new consumers should read the structured fields above.
  readonly overview: string
  readonly summaryOfFindings: ReadonlyArray<string>
  readonly priorityActions: ReadonlyArray<RecommendedAction>
}

export interface ZoneSection {
  readonly zoneId: string
  readonly zoneName: string
  readonly observedConditions: ReadonlyArray<string>
  readonly interpretation: string
  readonly dataLimitations: ReadonlyArray<string>
  readonly recommendedActions: ReadonlyArray<RecommendedAction>
  readonly professionalOpinion: ProfessionalOpinionTier
}

// v2.2 §12 — Building and System Conditions section. Renders building-
// scoped findings (HVAC system maintenance/condition, drain pan, OA
// damper, water management) ONCE rather than repeated in every zone
// the system serves.
export interface BuildingConditionsSection {
  readonly observedConditions: ReadonlyArray<string>
  readonly dataLimitations: ReadonlyArray<string>
  readonly recommendedActions: ReadonlyArray<RecommendedAction>
}

export interface ObservedConditionRow {
  readonly zone: string
  readonly parameter: string
  readonly value: string
  readonly unit: string
  readonly reference: string
  readonly interpretation: string
}

export interface ContributingFactor {
  readonly name: string
  readonly relatedFindings: ReadonlyArray<string>
  readonly description: string
  readonly causationSupported: boolean
}

export interface RecommendationsRegister {
  readonly immediate: ReadonlyArray<RecommendedAction>
  readonly shortTerm: ReadonlyArray<RecommendedAction>
  readonly furtherEvaluation: ReadonlyArray<RecommendedAction>
  readonly longTermOptional: ReadonlyArray<RecommendedAction>
}

export interface SignatoryBlock {
  readonly preparedBy: { name: string; credentials: string; firm: string; contact: string }
  readonly reviewedBy: { name: string; credentials: string; licenseNumbers: string } | null
  readonly status: string
  readonly draftWatermark: boolean
}

export interface ClientReportAppendix {
  readonly rawMeasurementSnapshot?: ReadonlyArray<MeasurementRow>
  readonly standardsManifest: ReadonlyArray<Citation>
  readonly assessmentIndexInformationalOnly?: AssessmentIndexAppendix
}

export interface MeasurementRow {
  readonly zone: string
  readonly parameter: string
  readonly indoor: string
  readonly outdoor: string
  readonly delta: string
  readonly unit: string
}

export interface AssessmentIndexAppendix {
  readonly disclaimer: string
  readonly siteScore: number
  readonly siteTier: string
  readonly zoneScores: ReadonlyArray<{ zoneName: string; composite: number; tier: string }>
}

// ── Pre-Assessment Memo ──

export interface PreAssessmentMemo {
  readonly engineVersion: string
  readonly generatedAt: number
  readonly meta: AssessmentMeta
  readonly cover: CoverPage
  readonly purposeStatement: string
  readonly dataGaps: ReadonlyArray<{ trigger: string; description: string }>
  readonly recommendedFollowUp: ReadonlyArray<string>
  readonly signatoryBlock: SignatoryBlock
  readonly notice: string
}

// ── Internal Report ──

export interface InternalReport {
  readonly engineVersion: string
  readonly generatedAt: number
  readonly meta: AssessmentMeta
  readonly siteScore: number | null
  readonly siteTier: Tier | null
  readonly confidenceValue: number
  readonly confidenceBand: CIHConfidenceTier
  readonly defensibilityFlags: DefensibilityFlags
  readonly zones: ReadonlyArray<InternalZoneReport>
  readonly hypotheses: ReadonlyArray<ContributingFactor>
  readonly samplingRecommendations: ReadonlyArray<RecommendedAction>
  readonly prioritizationQueue: ReadonlyArray<PrioritizationEntry>
  readonly missingDataFlags: ReadonlyArray<string>
}

export interface InternalZoneReport {
  readonly zoneId: string
  readonly zoneName: string
  readonly composite: number | null
  readonly tier: Tier | null
  readonly confidence: CIHConfidenceTier
  readonly categories: ReadonlyArray<InternalCategoryReport>
}

export interface InternalCategoryReport {
  readonly category: CategoryName
  readonly rawScore: number
  readonly cappedScore: number
  readonly maxScore: number
  readonly status: string
  readonly findings: ReadonlyArray<InternalFindingReport>
}

export interface InternalFindingReport {
  readonly id: string
  readonly severityInternal: Severity
  readonly titleInternal: string
  readonly observationInternal: string
  readonly deductionInternal: number
  readonly conditionType: string
  readonly confidenceTier: CIHConfidenceTier
  readonly permissions: {
    definitiveConclusionAllowed: boolean
    causationSupported: boolean
    regulatoryConclusionAllowed: boolean
  }
}

export interface PrioritizationEntry {
  readonly findingId: string
  readonly zone: string
  readonly deduction: number
  readonly confidence: CIHConfidenceTier
  readonly priority: number
}
