/**
 * AtmosFlow 3.0 — Investigation Decision Framework: public barrel.
 *
 * Evidence → data quality → reference applicability → domain interpretation →
 * finding → evidence strength → confidence → hypothesis → investigation
 * priority → next-best action → professional review → report.
 *
 * Stage-1 foundation (this module tree) provides the type system and the two
 * flagship deterministic engines (time-basis + reference applicability) plus
 * evidence-strength, confidence, summary, and version routing. Domain rule
 * engines, UI/report wiring, API, DB migrations, AI-prompt migration, the
 * full validation-case library, and the concordance framework land in
 * subsequent staged PRs — see docs/ATMOSFLOW_3_MIGRATION.md.
 */

export * from './types'
export * from './timeBasis'
export * from './applicability'
export * from './evidenceStrength'
export * from './confidence'
export * from './summary'
export * from './version'
// Stage 2 — reference registry, domain rule engines, escalation, orchestrator.
export * from './references'
export * from './escalation'
export * from './assess'
export type { ZoneObservation, InvestigationContext } from './rules/common'
