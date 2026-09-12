/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The closed evidence package — typed boundary spec.
 *
 * Source of truth is `src/report/evidencePackage.js`; that module is the
 * authoritative implementation and this file is the documented boundary,
 * the same arrangement `./narrative.ts` has with `api/narrative.js`. No
 * runtime validator is enforced here.
 *
 * Every field is `readonly`. The package is what an AI writer is allowed to
 * work from and nothing downstream writes back into it — the one-way rule
 * `lib/context/types.ts` already states for the assessment context.
 */

/** Identity and provenance. Never alterable by a writer. */
export interface EvidenceFact {
  readonly id: string
  readonly label: string
  readonly value: string
}

/** The criterion that actually judged a reading. */
export interface AppliedCriterion {
  readonly id: string
  /** The citation string, e.g. "OSHA 29 CFR 1910.1000 Table Z-1". */
  readonly standard: string | null
  /** A key of CRITERION_CLASS in src/constants/criteria.js. */
  readonly class: string | null
  /** A key of AVERAGING in src/constants/criteria.js. */
  readonly averaging: string | null
  readonly band: readonly number[] | null
  readonly band_label: string | null
}

/**
 * One printed reading.
 *
 * `criterion: null` is the CONSTRAINT, not missing information: no criterion
 * was applied, so nothing may be said about the reading against any standard.
 */
export interface EvidenceMeasurement {
  readonly id: string
  readonly kind: 'zone' | 'outdoor_reference' | 'site_mean'
  readonly zone: string | null
  readonly parameter: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly criterion: AppliedCriterion | null
  /**
   * Whether a reading of this kind can SETTLE the comparison, straight off
   * `AVERAGING[x].determinativeFrom`. Null when no criterion applied.
   */
  readonly determinative: boolean | null
  readonly evaluated: boolean
}

/** What was seen or described. Carries no verdict, by construction. */
export interface EvidenceObservation {
  readonly id: string
  readonly scope: 'building' | 'zone' | 'occupant_report' | 'assessor_note'
  readonly zone: string | null
  readonly text: string
}

/** An engine conclusion. `text` is the engine's sentence, verbatim. */
export interface EvidenceFinding {
  readonly id: string
  readonly zone: string
  readonly text: string
  readonly severity: string
  readonly basis: string
  readonly standard: string | null
  readonly category: string | null
  readonly parameter: string | null
  readonly criterion_id: string | null
  readonly criterion_class: string | null
  readonly averaging: string | null
  readonly determinative: boolean | null
  /**
   * True when the report row could not be joined back to an engine finding —
   * some layer reworded it. Diagnostic only; withheld from the writer.
   */
  readonly unjoined?: boolean
}

/** A standard this report actually cites. */
export interface EvidenceReference {
  readonly id: string
  readonly name: string
  readonly basis: string
  readonly usage: string
  readonly number: number | null
}

/** What MAY be asserted about one finding, parameter or pathway. */
export interface AllowedInterpretation {
  readonly id: string
  readonly subject: string
  readonly subject_kind: 'finding' | 'parameter' | 'pathway'
  readonly statement: string
}

/** What may NOT be, and why. Specific to this assessment, not a general rule. */
export interface ProhibitedClaim {
  readonly id: string
  readonly subject: string
  readonly subject_kind: 'finding' | 'parameter' | 'pathway'
  readonly parameter?: string | null
  readonly claim: 'compliance_determination' | 'criterion_comparison' | 'causation'
  readonly why: string
}

/**
 * A disclosure the narrative must carry.
 *
 * `when` scopes it to prose that raises the subject — null means always.
 * `must_mention` is alternative token sets, any one of which proves the
 * disclosure survived a rewrite; the writer is expected to reword.
 */
export interface RequiredLimitation {
  readonly id: string
  readonly text: string
  readonly when: readonly string[] | null
  readonly must_mention: ReadonlyArray<readonly string[]>
}

/** An eligible action, from the report's action register. */
export interface RecommendationOption {
  readonly id: string
  readonly priority: string
  readonly timeframe: string
  readonly action: string
  readonly location: string
  readonly control: string
  readonly owner: string
  readonly evidence: string
}

/** A figure the narrative may state, for the audit's number check. */
export interface ImmutableValue {
  readonly value: number
  readonly unit: string
  readonly source: string
}

export interface EvidencePackage {
  readonly version: number
  readonly report_id: string | null
  readonly facts: readonly EvidenceFact[]
  readonly measurements: readonly EvidenceMeasurement[]
  readonly observations: readonly EvidenceObservation[]
  readonly findings: readonly EvidenceFinding[]
  readonly references: readonly EvidenceReference[]
  readonly allowed_interpretations: readonly AllowedInterpretation[]
  readonly prohibited_claims: readonly ProhibitedClaim[]
  readonly required_limitations: readonly RequiredLimitation[]
  /** The report's Limitations section, as read-only context. */
  readonly report_limitations: readonly string[]
  readonly recommendation_options: readonly RecommendationOption[]
  readonly sections: {
    readonly writable: readonly string[]
    readonly immutable: readonly string[]
  }
  /** Withheld from the writer by `packageForWriter`. */
  readonly immutable_values?: readonly ImmutableValue[]
}

/** One thing the prose asserts that the package does not support. */
export interface NarrativeAuditIssue {
  readonly id: string
  readonly where: string
  readonly message: string
  readonly severity: 'blocking' | 'warning'
}

export interface NarrativeAuditSummary {
  readonly supported: boolean
  readonly blocking: number
  readonly warnings: number
  readonly summary: string
}

/** What `generateNarrative` resolves to. */
export interface NarrativeResult {
  readonly narrative: string | null
  readonly audit: readonly NarrativeAuditIssue[]
  readonly auditSummary: NarrativeAuditSummary | null
  readonly evidence: EvidencePackage | null
}
