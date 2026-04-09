// ─────────────────────────────────────────────────────────────
// Prudence EHS Intelligence Engine — Client-Side Types
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────
// Enum Constants
// ─────────────────────────────────────────────

export const USER_ROLE = {
  ADMIN: "ADMIN",
  REVIEWER: "REVIEWER",
  VIEWER: "VIEWER",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const AUTHORITY_TYPE = {
  REGULATORY: "REGULATORY",
  CONSENSUS_STANDARD: "CONSENSUS_STANDARD",
  GUIDANCE: "GUIDANCE",
  INTERNAL_MEMO: "INTERNAL_MEMO",
} as const;
export type AuthorityType =
  (typeof AUTHORITY_TYPE)[keyof typeof AUTHORITY_TYPE];

export const REFERENCE_STATUS = {
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  DRAFT: "DRAFT",
} as const;
export type ReferenceStatus =
  (typeof REFERENCE_STATUS)[keyof typeof REFERENCE_STATUS];

export const FINDING_CLASSIFICATION = {
  REGULATORY_DEFICIENCY: "REGULATORY_DEFICIENCY",
  TECHNICAL_BENCHMARK_GAP: "TECHNICAL_BENCHMARK_GAP",
  BEST_PRACTICE_IMPROVEMENT: "BEST_PRACTICE_IMPROVEMENT",
  UNABLE_TO_DETERMINE: "UNABLE_TO_DETERMINE",
  EXPERT_REVIEW_REQUIRED: "EXPERT_REVIEW_REQUIRED",
} as const;
export type FindingClassification =
  (typeof FINDING_CLASSIFICATION)[keyof typeof FINDING_CLASSIFICATION];

export const FINDING_SEVERITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MODERATE",
  LOW: "LOW",
  INFORMATIONAL: "INFORMATIONAL",
} as const;
export type FindingSeverity =
  (typeof FINDING_SEVERITY)[keyof typeof FINDING_SEVERITY];

export const FACT_STATUS = {
  CONFIRMED: "CONFIRMED",
  INFERRED: "INFERRED",
  NOT_FOUND: "NOT_FOUND",
  CONTRADICTED: "CONTRADICTED",
} as const;
export type FactStatus = (typeof FACT_STATUS)[keyof typeof FACT_STATUS];

export const REVIEW_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
} as const;
export type ReviewStatus =
  (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

export const ESCALATION_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  DISMISSED: "DISMISSED",
} as const;
export type EscalationStatus =
  (typeof ESCALATION_STATUS)[keyof typeof ESCALATION_STATUS];

// ─────────────────────────────────────────────
// Union Types
// ─────────────────────────────────────────────

export type DocumentType =
  | "fire_protection_plan"
  | "hazcom_program"
  | "emergency_action_plan"
  | "lockout_tagout_program"
  | "confined_space_program"
  | "respiratory_protection_program"
  | "hearing_conservation_program"
  | "bloodborne_pathogens_plan"
  | "fall_protection_plan"
  | "electrical_safety_program"
  | "hot_work_permit_program"
  | "process_safety_management"
  | "stormwater_pollution_prevention"
  | "spill_prevention_control"
  | "hazardous_waste_management"
  | "air_quality_management"
  | "asbestos_management_plan"
  | "lead_management_plan"
  | "indoor_air_quality_plan"
  | "ergonomics_program"
  | "fleet_safety_program"
  | "contractor_safety_program"
  | "construction_safety_plan"
  | "demolition_plan"
  | "crane_lift_plan"
  | "scaffolding_plan"
  | "excavation_plan"
  | "general_safety_program"
  | "other";

export type StandardTrack =
  | "OSHA"
  | "NFPA"
  | "EPA"
  | "ANSI"
  | "ASHRAE"
  | "ASTM"
  | "ICC"
  | "DOT"
  | "MSHA"
  | "NEC"
  | "IFC"
  | "IBC"
  | "NIOSH"
  | "ACGIH"
  | "state_specific"
  | "internal"
  | "multi_standard";

export type ReadingLevel =
  | "executive"
  | "professional"
  | "technical"
  | "field_worker"
  | "general_public";

export type OutputMode =
  | "full_report"
  | "executive_summary"
  | "findings_only"
  | "checklist"
  | "redline"
  | "gap_analysis";

// ─────────────────────────────────────────────
// Entity Interfaces
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organization?: OrganizationProfile;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  industry: string;
  siteCount: number;
  defaultReadingLevel: string;
  enabledRulePacks: string[];
  enabledAuthorities: string[];
  users?: User[];
  buildings?: BuildingProfile[];
  documentReviews?: DocumentReview[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BuildingProfile {
  id: string;
  name: string;
  address: string;
  buildingType: string;
  occupancyType: string;
  yearBuilt: number | null;
  squareFootage: number | null;
  hvacType: string | null;
  organizationId: string;
  organization?: OrganizationProfile;
  documentReviews?: DocumentReview[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Reference {
  id: string;
  referenceId: string;
  authorityName: string;
  authorityType: AuthorityType;
  domain: string;
  jurisdiction: string | null;
  citationText: string;
  title: string;
  sectionNumber: string | null;
  effectiveDate: Date | string | null;
  status: ReferenceStatus;
  officialSourceUrl: string | null;
  plainLanguageSummary: string | null;
  applicabilityTags: string[];
  triggerTags: string[];
  requiredElements: Record<string, unknown> | null;
  exceptions: string[];
  definitions: Record<string, unknown> | null;
  crossReferences: string[];
  enforceabilityLevel: string | null;
  reviewedBy: string | null;
  reviewDate: Date | string | null;
  fragments?: ReferenceFragment[];
  citationLinks?: CitationLink[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ReferenceFragment {
  id: string;
  referenceId: string;
  reference?: Reference;
  fragmentKey: string;
  fragmentText: string;
  pageOrSection: string | null;
  createdAt: Date | string;
}

export interface RulePack {
  id: string;
  packId: string;
  name: string;
  topic: string;
  domain: string;
  version: string;
  description: string | null;
  isEnabled: boolean;
  rules?: Rule[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Rule {
  id: string;
  ruleCode: string;
  rulePackId: string;
  rulePack?: RulePack;
  topic: string;
  description: string;
  triggerConditions: Record<string, unknown>;
  requiredEvidence: string[];
  comparisonLogic: Record<string, unknown> | null;
  findingTitle: string;
  findingClassification: FindingClassification;
  defaultSeverity: FindingSeverity;
  citationBundle: string[];
  outputTemplate: string | null;
  escalationThreshold: number | null;
  isEnabled: boolean;
  requiredElements?: RequiredElement[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RequiredElement {
  id: string;
  ruleId: string;
  rule?: Rule;
  elementKey: string;
  label: string;
  description: string | null;
  isCritical: boolean;
  sourceReference: string | null;
}

export interface DocumentReview {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  documentType: string;
  standardTrack: string | null;
  applicableRulePacks: string[];
  status: ReviewStatus;
  organizationId: string | null;
  organization?: OrganizationProfile | null;
  buildingId: string | null;
  building?: BuildingProfile | null;
  requestedOutputMode: string | null;
  requestedReadingLevel: string | null;
  overallScore: number | null;
  expertReviewFlag: boolean;
  extractedFacts?: ExtractedFact[];
  findings?: Finding[];
  expertReviewItems?: ExpertReviewQueue[];
  reviewCompletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ExtractedFact {
  id: string;
  reviewId: string;
  review?: DocumentReview;
  factKey: string;
  factValue: string;
  factStatus: FactStatus;
  sourceExcerpt: string | null;
  sourcePage: string | null;
  confidence: number;
  createdAt: Date | string;
}

export interface Finding {
  id: string;
  reviewId: string;
  review?: DocumentReview;
  findingCode: string;
  classification: FindingClassification;
  topic: string;
  title: string;
  status: string;
  severity: FindingSeverity;
  evidenceBasis: string;
  whyItMatters: string | null;
  recommendedAction: string | null;
  confidence: number;
  escalation: boolean;
  escalationReason: string | null;
  redlineSuggestion: string | null;
  citationLinks?: CitationLink[];
  expertReviewItems?: ExpertReviewQueue[];
  createdAt: Date | string;
}

export interface CitationLink {
  id: string;
  findingId: string;
  finding?: Finding;
  referenceId: string;
  reference?: Reference;
  shortCitation: string;
  supportingExcerpt: string | null;
  createdAt: Date | string;
}

export interface ReadingLevelTemplate {
  id: string;
  levelKey: string;
  label: string;
  description: string | null;
  gradeLevel: number | null;
  promptInstructions: string;
  createdAt: Date | string;
}

export interface ExpertReviewQueue {
  id: string;
  reviewId: string;
  review?: DocumentReview;
  findingId: string | null;
  finding?: Finding | null;
  reason: string;
  confidenceLevel: number | null;
  unresolvedContradictions: string[];
  reviewerNotes: string | null;
  status: EscalationStatus;
  assignedTo: string | null;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user?: User | null;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date | string;
}

// ─────────────────────────────────────────────
// Composite / Output Types
// ─────────────────────────────────────────────

/** Full review output shape returned by the intelligence engine. */
export interface ReviewResult {
  review_id: string;
  document_type: DocumentType | string;
  standard_track: StandardTrack | string | null;
  applicable_rule_packs: string[];
  extracted_facts: ExtractedFactOutput[];
  findings: FindingOutput[];
  overall_summary: OverallSummary;
  expert_review_flag: boolean;
  exports: ReviewExports;
}

export interface ExtractedFactOutput {
  fact_key: string;
  fact_value: string;
  fact_status: FactStatus;
  source_excerpt: string | null;
  source_page: string | null;
  confidence: number;
}

/** Full finding output as returned by the engine. */
export interface FindingOutput {
  finding_code: string;
  classification: FindingClassification;
  topic: string;
  title: string;
  severity: FindingSeverity;
  evidence_basis: string;
  why_it_matters: string | null;
  recommended_action: string | null;
  citations: FindingCitation[];
  confidence: number;
  escalation: boolean;
  escalation_reason: string | null;
  redline_suggestion: string | null;
}

export interface FindingCitation {
  short_citation: string;
  reference_id: string;
  supporting_excerpt: string | null;
}

export interface OverallSummary {
  overall_score: number | null;
  total_findings: number;
  critical_count: number;
  high_count: number;
  moderate_count: number;
  low_count: number;
  informational_count: number;
  strengths: string[];
  priority_actions: string[];
  narrative: string;
}

export interface ReviewExports {
  pdf_url: string | null;
  csv_url: string | null;
  json_url: string | null;
  redline_url: string | null;
}

/** Result of evaluating a single rule against extracted facts. */
export interface RuleEvaluation {
  rule_code: string;
  rule_pack_id: string;
  topic: string;
  triggered: boolean;
  trigger_reason: string | null;
  matched_facts: string[];
  missing_evidence: string[];
  finding_classification: FindingClassification | null;
  finding_severity: FindingSeverity | null;
  finding_title: string | null;
  confidence: number;
  escalation: boolean;
  escalation_reason: string | null;
  citation_bundle: string[];
  required_elements_met: Record<string, boolean>;
}

// ─────────────────────────────────────────────
// Safe-Phrase Constants
// ─────────────────────────────────────────────

/**
 * Approved hedging and framing phrases for AI-generated EHS content.
 * Use these in output templates to avoid over-assertive language.
 */
export const SAFE_PHRASES = [
  "Based on the document as submitted",
  "This review is limited to the content provided",
  "This does not constitute legal advice",
  "Professional judgment by a qualified EHS specialist is recommended",
  "Consult the Authority Having Jurisdiction (AHJ) for site-specific requirements",
  "This analysis is based on the standards in effect as of the review date",
  "Additional documentation may be required to fully assess compliance",
  "Field verification is recommended to confirm document accuracy",
  "This finding is based on the information available at the time of review",
  "Regulatory requirements may vary by jurisdiction",
  "This tool supplements but does not replace professional EHS review",
  "Confidence levels reflect analytical certainty, not regulatory weight",
  "Absence of a finding does not guarantee compliance",
  "Cross-reference with applicable local amendments is advised",
  "This output is generated for informational and decision-support purposes only",
] as const;

export type SafePhrase = (typeof SAFE_PHRASES)[number];

// ─────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────

/** Pick only the scalar (non-relation) fields from an entity. */
export type ScalarFields<T> = {
  [K in keyof T as T[K] extends
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | string[]
    | number[]
    | Record<string, unknown>
    | (Date | string)
    | (Date | string | null)
    ? K
    : never]: T[K];
};

/** Make specific keys optional. */
export type WithOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

/** Input type for creating a new entity (omit auto-generated fields). */
export type CreateInput<T> = Omit<T, "id" | "createdAt" | "updatedAt">;

/** Input type for updating an entity (all fields optional except id). */
export type UpdateInput<T> = Partial<Omit<T, "id" | "createdAt" | "updatedAt">> & {
  id: string;
};
