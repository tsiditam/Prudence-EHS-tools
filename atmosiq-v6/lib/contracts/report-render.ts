/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report renderer contract — connectivity layer PR E.
 *
 * Documents the `data` shape the DOCX generator entry points consume.
 * After PR C, `data.assessmentContext` is the preferred source of the
 * identity layer (facility, address, recipient); the legacy
 * data.{building, presurvey, profile, …} fields remain as a fallback
 * and as the source for fields the connectivity layer does not yet
 * normalize (engine outputs, branding, raw photos).
 *
 * Source of truth: `src/components/DocxReport.js` (function
 * `buildContext`). This .ts file is the typed boundary spec — no
 * runtime validator is enforced.
 */

import type { AssessmentContext } from '../context/types'

/** Photo group keyed by photo-bucket id ('z0-mold', 'z1-hvac', …). */
export type PhotoBucketMap = Record<string, ReadonlyArray<{
  readonly label?: string | null
  readonly caption?: string | null
  readonly dataUrl?: string | null
}>>

/** Lab-results envelope (Appendix G). */
export type LabResultsBundle = unknown

/** Sensor-data envelope (Appendix H, Logger Studio session). */
export type SensorDataEnvelope = unknown

/** Engine-emitted output. Passed through unchanged. */
export type EngineComposite = unknown
export type EngineZoneScores = unknown
export type EngineRecommendations = unknown
export type EngineNarrative = unknown
export type EngineSamplingPlan = unknown
export type EngineCausalChains = unknown

/** Watermark configuration resolved from the user's plan tier. */
export interface WatermarkConfig {
  readonly tier?: string
  readonly notice?: string
  readonly badge?: string
}

/** IH professional-judgment override payload. */
export interface IhOverride {
  readonly triggers?: ReadonlyArray<string>
  readonly justification?: string
}

/** Standards manifest snapshot. */
export type StandardsManifest = unknown

/**
 * Input `data` object passed to `generateDocx` /
 * `generateConsultantOnly` / `generateTechnicalOnly` /
 * `getConsultantDocxBlob`. Every field is optional — the renderer
 * degrades gracefully when state is partial.
 *
 * `assessmentContext` is the connectivity-layer source for identity
 * fields. When absent, the renderer falls back to data.building /
 * data.presurvey / data.profile.
 */
export interface ReportRenderInput {
  // ── Connectivity layer ────────────────────────────────────────
  readonly assessmentContext?: AssessmentContext | null

  // ── Legacy identity layer (fallback when assessmentContext absent)
  readonly building?: Record<string, unknown>
  readonly presurvey?: Record<string, unknown>
  readonly profile?: Record<string, unknown>

  // ── Engine outputs (pass through unchanged) ───────────────────
  readonly zones?: ReadonlyArray<Record<string, unknown>>
  readonly equipment?: unknown
  readonly zoneScores?: EngineZoneScores
  readonly comp?: EngineComposite
  readonly oshaResult?: unknown
  readonly recs?: EngineRecommendations
  readonly samplingPlan?: EngineSamplingPlan
  readonly causalChains?: EngineCausalChains
  readonly narrative?: EngineNarrative

  // ── Assets ────────────────────────────────────────────────────
  readonly photos?: PhotoBucketMap
  readonly photoOverrides?: Record<string, unknown>
  readonly floorPlan?: unknown
  readonly labResults?: LabResultsBundle
  readonly sensorData?: SensorDataEnvelope

  // ── Provenance ────────────────────────────────────────────────
  readonly ts?: string
  readonly id?: string
  readonly version?: string
  readonly standardsManifest?: StandardsManifest

  // ── Branding / runtime overrides ─────────────────────────────
  readonly userMode?: string
  readonly escalationTriggers?: unknown
  readonly watermarkConfig?: WatermarkConfig | null
  readonly ihOverride?: IhOverride | null
  /**
   * Render the optional Assessment Index Appendix (ClientReport
   * renderer toggle, see src/engine/report/client.ts).
   */
  readonly includeAssessmentIndexAppendix?: boolean
}

/**
 * Internal context object produced by `buildContext(data)` and
 * consumed by section builders. Field set is the union of the
 * identity layer + engine pass-throughs + firm branding.
 *
 * Section builders (`sections-core`, `sections-v21client`,
 * `sections-recommendations`, …) read fields off this object. Any
 * new field here is observable across every section; remove or
 * rename with care.
 */
export interface DocxRenderContext {
  // Identity (PR C: prefers assessmentContext.{building,project})
  readonly facilityName: string
  readonly address: string
  readonly assessDate: string
  readonly reportDate: string
  readonly assessor: string
  readonly reportId: string
  readonly version: string

  // Legacy pass-throughs (still consumed by section builders)
  readonly building: Record<string, unknown>
  readonly presurvey: Record<string, unknown>
  readonly zones: ReadonlyArray<Record<string, unknown>>
  readonly zoneScores: EngineZoneScores
  readonly zoneCount: number
  readonly zoneNames: ReadonlyArray<string>
  readonly comp: EngineComposite
  readonly oshaResult: Record<string, unknown>
  readonly confidence: string
  readonly completeness: number
  readonly recs: EngineRecommendations
  readonly samplingPlan: EngineSamplingPlan
  readonly causalChains: EngineCausalChains
  readonly narrative: EngineNarrative
  readonly photos: PhotoBucketMap
  readonly floorPlan: unknown
  readonly reason: string
  readonly instrument: string
  readonly instrumentSerial: string
  readonly calibration: string
  readonly pidMeter: string
  readonly pidCal: string
  readonly standardsManifest: StandardsManifest

  // Connectivity-layer pass-through (PR C)
  readonly assessmentContext: AssessmentContext | null

  // Firm branding
  readonly firmName: string
  readonly firmAddress: string
  readonly firmPhone: string
  readonly firmEmail: string
  readonly firmLogo: string | null
  readonly firmLicense: string
  readonly peSeal: string | null
  readonly assessorCerts: ReadonlyArray<string>
}
