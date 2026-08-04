/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — domain types.
 *
 * The typed contract for the mold screening engine (src/engines/mold/*). Like
 * the Knowledge Graph types, every field is `readonly`: the engine is a PURE
 * projection of assessment inputs → a screening result. Consumers read the
 * result; they never write back into it, the inputs, or the IAQ engine.
 *
 * Nothing in this contract expresses a health verdict. Severity is CATEGORICAL
 * (`observation | screening_indicator | elevated_indicator`), classifications
 * are S520 enums, and every finding carries `screeningOnly` + a required
 * professional-review flag.
 */

/** IICRC S520 water-intrusion category (sanitary quality at source). */
export type WaterCategoryId = 1 | 2 | 3

/** IICRC S520 condition of an indoor environment. */
export type RemediationConditionId = 1 | 2 | 3

/**
 * Categorical severity for a mold screening finding. Deliberately NOT a number:
 * a numeric mold "risk score" would imply a health/exposure verdict the module
 * must never assert (cf. the KG's categorical confidence).
 *   - observation         : recorded fact, no screening flag raised
 *   - screening_indicator : warrants further evaluation
 *   - elevated_indicator  : multiple/《strong》 screening indicators converge
 */
export type MoldSeverity = 'observation' | 'screening_indicator' | 'elevated_indicator'

/** Family a finding belongs to (drives grouping in UI + report). */
export type MoldFindingCategory =
  | 'moisture'
  | 'water_damage'
  | 'visible_growth'
  | 'spore_screening'
  | 'hvac'

/** Categorical outcome of comparative indoor/outdoor spore screening. */
export type SporeScreeningOutcome =
  | 'consistent-with-normal-ecology'
  | 'possible-amplification-indicator'
  | 'insufficient-data'

/** A single moisture reading captured in the field. */
export interface MoistureReading {
  readonly zoneId: string
  readonly material: 'wood' | 'drywall' | 'concrete' | 'other'
  /** Numeric reading in the material's native scale (see MOISTURE_INDICATORS). */
  readonly value: number | null
  /** Free-text location within the zone (e.g. "N wall base, behind casework"). */
  readonly location?: string
}

/** A water-intrusion event described at intake. */
export interface WaterEvent {
  readonly zoneId: string
  /** Described source; classified to a Category, never inferred from a number. */
  readonly source: string
  /** ISO date of the event, if known. */
  readonly date?: string | null
  /** Whether standing water / prolonged saturation was observed. */
  readonly prolonged?: boolean
}

/** Observed visible growth / water damage in a zone. */
export interface GrowthObservation {
  readonly zoneId: string
  readonly visibleGrowth: boolean
  /** Approx. affected area in ft², if estimable (screening scale only). */
  readonly areaSqFt?: number | null
  /** Whether the affected material is porous (drywall, carpet, ceiling tile…). */
  readonly porousMaterial?: boolean
  readonly mustyOdor?: boolean
  /** Growth confined to surface vs. suspected within cavities/systems. */
  readonly hiddenSuspected?: boolean
}

/** One genus row from a spore-trap lab result. */
export interface SporeSample {
  readonly zoneId: string
  /** 'indoor' sample or the paired 'outdoor' reference. */
  readonly location: 'indoor' | 'outdoor'
  readonly genus: string
  /** Raw structures/m³ as reported by the lab. */
  readonly countPerM3: number
}

/** The normalized input the engine projects from. */
export interface MoldAssessmentInput {
  readonly zones: readonly { readonly id: string; readonly label?: string }[]
  readonly waterEvents?: readonly WaterEvent[]
  readonly moisture?: readonly MoistureReading[]
  readonly growth?: readonly GrowthObservation[]
  readonly spores?: readonly SporeSample[]
  readonly hvacInvolved?: boolean
}

/** A classified water-intrusion event. */
export interface WaterCategoryResult {
  readonly zoneId: string
  readonly categoryId: WaterCategoryId
  readonly label: string
  readonly definition: string
  readonly mayEscalate: boolean
  readonly source: string
}

/** A classified indoor-environment condition, per zone. */
export interface ConditionResult {
  readonly zoneId: string
  readonly conditionId: RemediationConditionId
  readonly label: string
  readonly definition: string
  readonly basis: readonly string[]
  readonly source: string
}

/** Comparative spore-screening result for a zone. */
export interface SporeScreeningResult {
  readonly zoneId: string
  readonly outcome: SporeScreeningOutcome
  /** Genera where indoor exceeds the outdoor reference. */
  readonly indoorExceedsOutdoor: readonly string[]
  /** Water-damage-associated genera present indoors. */
  readonly indicatorGeneraIndoors: readonly string[]
  readonly source: string
  readonly noHealthLimitNote: string
}

/** A single screening finding. Mirrors — but never reuses — IAQ findings. */
export interface MoldFinding {
  readonly id: string
  readonly zoneId: string
  readonly category: MoldFindingCategory
  readonly severity: MoldSeverity
  readonly summary: string
  readonly evidence: readonly string[]
  readonly standardRefs: readonly string[]
  /** Always true: every mold finding is screening, never a determination. */
  readonly screeningOnly: true
  /** Always true: every mold finding requires qualified-professional review. */
  readonly requiresProfessionalReview: true
}

/** The complete, deterministic result of a mold screening pass. */
export interface MoldScreeningResult {
  readonly version: string
  readonly waterCategories: readonly WaterCategoryResult[]
  readonly conditions: readonly ConditionResult[]
  readonly sporeScreening: readonly SporeScreeningResult[]
  readonly findings: readonly MoldFinding[]
  readonly limitations: readonly string[]
  readonly standardsCited: readonly string[]
  readonly disclaimer: string
}
