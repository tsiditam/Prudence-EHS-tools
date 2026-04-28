/**
 * AtmosFlow Engine v2.1 — Report Module Barrel
 */

export { evaluatePermissions } from './permissions'
export type { FindingPermissions } from './permissions'
export { evaluateSamplingAdequacy } from './sampling-adequacy'
export { evaluateZoneOpinion, evaluateSiteOpinion, OPINION_TIER_LANGUAGE, CONFIDENCE_TIER_LANGUAGE } from './professional-opinion'
export { PHRASE_LIBRARY, lookupPhrase } from './phrases/index'
export { validateNarrativeForFinding, validateClientReport, assertNoInternalFields, BannedTermViolation } from './validators'
export { shouldRefuseToIssue, evaluateRefusalTriggers, buildPreAssessmentMemo } from './pre-assessment-memo'
export { renderInternalReport } from './internal'
export { renderClientReport } from './client'
export * from './templates'
export type * from './types'
