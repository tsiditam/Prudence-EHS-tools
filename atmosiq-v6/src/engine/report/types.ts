/**
 * AtmosFlow Engine v2.1 — Report Output Types
 * Two render modes: internal (operator dashboard) and client (CIH deliverable).
 */

import type {
  FindingId, ZoneId, CategoryName, Tier, Severity,
  CIHConfidenceTier, ProfessionalOpinionTier, ConditionType,
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
  // v2.2 §5 — Table of Contents enumerating every body section that
  // was rendered. Computed at render time based on which sections are
  // populated. HTML uses anchor links; DOCX uses Word's native TOC
  // field via heading styles.
  readonly tableOfContents: TableOfContents
  readonly executiveSummary: ExecutiveSummary
  readonly scopeAndMethodology: string
  // v2.2 §7 — Sampling Methodology section (auto-generated from
  // AssessmentMeta.instrumentsUsed).
  readonly samplingMethodology: SamplingMethodologySection
  readonly buildingAndSystemContext: string
  // v2.4 §2 — per-parameter Results subsections (Carbon Dioxide,
  // Carbon Monoxide, Formaldehyde, Total VOCs, PM2.5/PM10,
  // Temperature, Relative Humidity). Each subsection carries the
  // standards background prose and a per-parameter measurement
  // summary derived from the legacy zone-data.
  readonly resultsSection?: ResultsSection
  readonly observedConditionsTable: ReadonlyArray<ObservedConditionRow>
  // v2.3 §2 — building-scoped findings (HVAC, water management)
  // render once at building level when at least one such finding
  // exists. The section is OPTIONAL and OMITTED entirely (header +
  // TOC entry) when no building-scoped findings are produced.
  readonly buildingAndSystemConditions?: BuildingAndSystemConditionsSection
  readonly zoneSections: ReadonlyArray<ZoneSection>
  readonly potentialContributingFactors: ReadonlyArray<ContributingFactor>
  readonly recommendationsRegister: RecommendationsRegister
  readonly limitationsAndProfessionalJudgment: string
  readonly signatoryBlock: SignatoryBlock
  readonly appendix: ClientReportAppendix
}

// v2.2 §5 — Table of Contents
export interface TocEntry {
  /** Stable anchor id used for HTML href targets and aria-labelledby. */
  readonly anchorId: string
  /** Display title rendered in the TOC and as the section heading. */
  readonly title: string
  /** Heading level — 1 for top-level sections, 2 for sub-sections. */
  readonly level: 1 | 2
}

export interface TableOfContents {
  readonly title: string
  readonly entries: ReadonlyArray<TocEntry>
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

/**
 * v2.3 §3 — RenderedFinding is the self-contained unit consumed by
 * the renderer. Each finding carries its narrative, observed value,
 * inline limitations, recommended actions, and confidence-tier
 * language as a single block — no aggregation into section-level
 * "Data Limitations" dumps.
 */
export interface RenderedFinding {
  readonly findingId: FindingId
  readonly conditionType: ConditionType
  /** Engine-approved narrative intent (what the renderer prints first). */
  readonly narrative: string
  /** Optional measured/observed value display string (e.g. "45 ppm"). */
  readonly observedValue?: string
  /** Limitations attached to this finding only. */
  readonly limitations: ReadonlyArray<string>
  /** Recommended actions tied to this finding only. */
  readonly recommendedActions: ReadonlyArray<RecommendedAction>
  /** CONFIDENCE_TIER_LANGUAGE[finding.confidenceTier] for sub-label use. */
  readonly confidenceTierLanguage: string
}

/**
 * v2.3 §5 — ZoneSection rework. observedConditions: string[] is
 * removed in favour of findings: RenderedFinding[]. dataLimitations
 * is removed entirely; limitations attach to each finding.
 */
export interface ZoneSection {
  readonly zoneId: string
  readonly zoneName: string
  /**
   * Optional zone description (floor area, occupancy, space use,
   * sample locations). Populated when zone-data carries enough
   * detail; renderer omits the line when empty.
   */
  readonly zoneDescription: string
  /** Optional sampling-summary line (e.g., "4 sample points"). */
  readonly samplingSummary: string
  /**
   * Findings rendered as self-contained blocks (narrative +
   * observed value + inline limitations + recommended actions).
   * When empty, the renderer prints the prescribed single-sentence
   * empty-zone notice.
   */
  readonly findings: ReadonlyArray<RenderedFinding>
  readonly interpretation: string
  /**
   * Zone-level recommended actions roll-up. v2.3 prefers per-finding
   * actions inside RenderedFinding, but this list still aggregates
   * them for downstream consumers (e.g., legacy dashboards).
   */
  readonly recommendedActions: ReadonlyArray<RecommendedAction>
  readonly professionalOpinion: ProfessionalOpinionTier
  readonly professionalOpinionLanguage: string
}

/**
 * v2.3 §2 — Building and System Conditions section.
 * - rendered=false signals the renderer to OMIT the section header,
 *   the TOC entry, and any "no findings" placeholder text. The
 *   omittedReason is appended to Scope of Work.
 * - rendered=true emits findings[] as a list of RenderedFinding
 *   blocks (one per building-scoped finding) with inline
 *   limitations and recommended actions.
 *
 * Renamed from BuildingConditionsSection (v2.2). The old name
 * remains as a type alias below for backward compat.
 */
export interface BuildingAndSystemConditionsSection {
  readonly rendered: boolean
  readonly findings: ReadonlyArray<RenderedFinding>
  /** Set when rendered=false; null/undefined when rendered=true. */
  readonly omittedReason?: string
}

/** Backward-compat alias for v2.2 callers. */
export type BuildingConditionsSection = BuildingAndSystemConditionsSection

/**
 * v2.4 §2 — Results section, rendered between Sampling Methodology
 * and Building and System Context. Each parameter subsection is
 * emitted only when at least one valid measurement was recorded.
 */
export interface ResultsSection {
  readonly title: string
  readonly subsections: ReadonlyArray<ParameterSubsection>
}
export interface ParameterSubsection {
  readonly heading: string
  readonly standardsBackground: string
  readonly measurementSummary: string
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
  // v2.4 §3 — six structured appendices
  readonly appendixA?: AppendixA
  readonly appendixB?: AppendixB
  readonly appendixC?: AppendixC
  readonly appendixD?: AppendixD
  readonly appendixE?: AppendixE
  readonly appendixF?: AppendixF
}

/**
 * v2.4 §3 — Appendix A: Per-zone tabulated measurements
 * One row per zone × parameter combination, including outdoor reference.
 */
export interface AppendixA {
  readonly title: string
  readonly description: string
  readonly rows: ReadonlyArray<AppendixAMeasurementRow>
}
export interface AppendixAMeasurementRow {
  readonly zoneName: string
  readonly parameter: string
  readonly value: string
  readonly unit: string
  readonly outdoorReference: string
  readonly notes: string
}

/**
 * v2.4 §3 — Appendix B: Sampling locations and methodology details
 * Per-instrument and per-zone documentation supporting reproducibility.
 */
export interface AppendixB {
  readonly title: string
  readonly description: string
  readonly instrumentRows: ReadonlyArray<AppendixBInstrumentRow>
  readonly zoneRows: ReadonlyArray<AppendixBZoneRow>
}
export interface AppendixBInstrumentRow {
  readonly model: string
  readonly serial: string
  readonly lastCalibration: string
  readonly calibrationStatus: string
  readonly parametersMeasured: ReadonlyArray<string>
}
export interface AppendixBZoneRow {
  readonly zoneName: string
  readonly samplingDuration: string
  readonly sampleLocations: string
  readonly outdoorReferenceTaken: boolean
}

/**
 * v2.4 §3 — Appendix C: Photo documentation
 * Optional. When zone-level photo references exist, they're enumerated.
 */
export interface AppendixC {
  readonly title: string
  readonly description: string
  readonly photos: ReadonlyArray<AppendixCPhoto>
}
export interface AppendixCPhoto {
  readonly caption: string
  readonly zoneName: string
  readonly relativePath: string
}

/**
 * v2.4 §3 — Appendix D: Standards and citations
 * Authoritative list of regulatory, consensus-standard, and peer-reviewed
 * citations actually invoked in this report. Engine version line is
 * recorded here (and ONLY here) per §7.
 */
export interface AppendixD {
  readonly title: string
  readonly description: string
  readonly citations: ReadonlyArray<Citation>
  readonly engineVersionLine: string
}

/**
 * v2.4 §3 — Appendix E: Quality assurance and instrument calibration
 * Calibration records, QA notes, and limitations of the QA program.
 */
export interface AppendixE {
  readonly title: string
  readonly description: string
  readonly calibrationRecords: ReadonlyArray<AppendixECalibrationRow>
  readonly qaNotes: ReadonlyArray<string>
}
export interface AppendixECalibrationRow {
  readonly instrumentModel: string
  readonly serial: string
  readonly lastCalibration: string
  readonly status: string
}

/**
 * v2.4 §3 — Appendix F: Glossary of terms and abbreviations
 * Reader-facing glossary entries.
 */
export interface AppendixF {
  readonly title: string
  readonly description: string
  readonly entries: ReadonlyArray<AppendixFGlossaryEntry>
}
export interface AppendixFGlossaryEntry {
  readonly term: string
  readonly definition: string
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
