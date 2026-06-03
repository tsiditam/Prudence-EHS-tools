/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * HydroScan engine barrel. One import surface for every downstream consumer
 * (UI, Marlow AI context, DOCX report). The engine READS the hardcoded
 * standards manifest and produces screening-only findings; it never mutates
 * the standards or asserts a regulatory compliance determination.
 */

export { ENGINE_VERSION } from '../version.js'
export { evaluateResults } from './evaluate'
export { buildWaterCausalChains } from './causal-chains'
export { generateSamplingPlan } from './sampling-plan'
export { generateRecommendations } from './recommendations'
export { fD, tierColor, tierLabel, tierBg, sevColor } from './format'

// Phase 3 — tiering, overlays & defensibility primitives
export { TIER_RANK, escalateTier, highestTier } from './tier'
export { applyStateOverlay } from './state-overlay'
export { computeLSI } from './lsi'
export type { LSIInputs, LSIResult } from './lsi'
export { createCitationTracker, extractCitations, bibliographyFor } from './citation-tracker'
export type { CitationTracker } from './citation-tracker'
export { buildReadiness } from './readiness'
export type { ReadinessVerdict, ReadinessBlocker, BlockerTier } from './readiness'
export { markScreeningOnly, markQualitativeOnly, SCREENING_NOTICE, DRAFT_WATERMARK } from './defensibility'
export type { WatermarkConfig } from './defensibility'

export type {
  Tier,
  Severity,
  Violation,
  Advisory,
  Param,
  LabResult,
  Finding,
  ComplianceResult,
  CausalChain,
  SamplingPlanItem,
  Recommendations,
  StateExceedance,
} from '../types/engine'
