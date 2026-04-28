/**
 * AtmosFlow Engine v2.1 — Report Output Types
 * Two render modes: internal (operator dashboard) and client (CIH deliverable).
 */

import type {
  FindingId, ZoneId, CategoryName, Tier, Severity,
  CIHConfidenceTier, ProfessionalOpinionTier,
  Finding, CategoryScore, ZoneScore, AssessmentScore, AssessmentMeta,
  RecommendedAction, DefensibilityFlags, ReviewStatus,
} from '../types/domain'
import type { Citation } from '../types/citation'

// ── Client Report ──

export interface ClientRenderOptions {
  readonly includeAssessmentIndexAppendix?: boolean
  readonly draftWatermark?: boolean
}

export type ClientReportResult =
  | { kind: 'report'; report: ClientReport }
  | { kind: 'pre_assessment_memo'; memo: PreAssessmentMemo; reasons: ReadonlyArray<string> }

export interface ClientReport {
  readonly engineVersion: string
  readonly generatedAt: number
  readonly meta: AssessmentMeta
  readonly reviewStatus: ReviewStatus
  readonly cover: CoverPage
  readonly transmittal: string
  readonly executiveSummary: ExecutiveSummary
  readonly scopeAndMethodology: string
  readonly buildingAndSystemContext: string
  readonly observedConditionsTable: ReadonlyArray<ObservedConditionRow>
  readonly zoneSections: ReadonlyArray<ZoneSection>
  readonly potentialContributingFactors: ReadonlyArray<ContributingFactor>
  readonly recommendationsRegister: RecommendationsRegister
  readonly limitationsAndProfessionalJudgment: string
  readonly signatoryBlock: SignatoryBlock
  readonly appendix: ClientReportAppendix
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

export interface ExecutiveSummary {
  readonly overview: string
  readonly summaryOfFindings: ReadonlyArray<string>
  readonly overallProfessionalOpinion: ProfessionalOpinionTier
  readonly overallProfessionalOpinionLanguage: string
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
