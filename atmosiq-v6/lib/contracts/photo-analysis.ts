/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * analyze_photo tool contract — connectivity layer PR E.
 *
 * Documents the input / output shape Jasper's `analyze_photo` tool
 * dispatches on. The dispatcher lives in
 * `src/constants/field-assistant-tools.js`; the prompt + role
 * description live in `src/constants/field-assistant-tools.js` +
 * `src/constants/field-assistant-prompt.js`. This file pins the
 * boundary in TypeScript so future consumers (test suites, fine-tune
 * exporters, telemetry dashboards) read the same shape the
 * dispatcher writes.
 *
 * The dispatcher is plain JS (no TS imports possible from it without
 * the .js→.ts landmine, per CLAUDE.md pitfall #4). This contract is
 * therefore documentation + compile-time check for typed consumers;
 * no runtime validation is performed here.
 *
 * Source of truth: `src/constants/field-assistant-tools.js`
 * (function `analyzePhoto` + the `parseVisionResponse` clamp).
 */

/** Input the Anthropic tool_use block passes to the dispatcher. */
export interface AnalyzePhotoInput {
  /** Required. ID of an attached photo, surfaced in the AI's context block. */
  readonly photo_id: string
  /** Optional focus area. Defaults to 'general'. */
  readonly focus?: 'mold' | 'moisture' | 'hvac' | 'ventilation' | 'dust' | 'general'
}

/** Confidence tier used by the vision response + telemetry. */
export type VisionConfidence = 'low' | 'medium' | 'high'

/** Successful analysis output. */
export interface AnalyzePhotoOk {
  readonly status: 'ok'
  /** 1-2 sentences describing what's visible. */
  readonly observed: string
  /** Up to 5 short concern clauses. Empty when the image shows no IAQ content. */
  readonly concerns: readonly string[]
  /** Hedged tentative classification, or null for non-IAQ images. */
  readonly probable_iaq_class: string | null
  /** Up to 5 next-step actions (sampling / documentation). */
  readonly recommended_actions: readonly string[]
  readonly confidence: VisionConfidence
  /** Up to 4 citations. Never invented — drawn from IICRC S520 / EPA / ASHRAE. */
  readonly citations: readonly string[]
  /** Screening-only disclaimer text. Always populated. */
  readonly disclaimers: string
  /** Always true. Vision output never substitutes for a CIH review. */
  readonly ih_review_required: true
  /** Vision model identifier. */
  readonly model: string
  /** ISO timestamp when the analysis was produced. */
  readonly generated_at: string
}

/** Photo_id not in the conversation. */
export interface AnalyzePhotoNotFound {
  readonly status: 'not_found'
  readonly photo_id: string
  readonly known_photo_ids: readonly string[]
  readonly message: string
}

/** No photos attached to the conversation at all. */
export interface AnalyzePhotoNoPhotos {
  readonly status: 'no_photos_attached'
  readonly message: string
}

/** Dispatcher / upstream error path. */
export interface AnalyzePhotoError {
  readonly status: 'error'
  readonly error:
    | 'missing_photo_id'
    | 'invalid_photo'
    | 'vision_unavailable'
    | 'vision_call_failed'
    | 'vision_upstream_error'
    | 'vision_unparseable'
  readonly message: string
  readonly upstream_status?: number
}

/** Discriminated union of every dispatcher return shape. */
export type AnalyzePhotoResult =
  | AnalyzePhotoOk
  | AnalyzePhotoNotFound
  | AnalyzePhotoNoPhotos
  | AnalyzePhotoError

/**
 * Telemetry shape recorded on the dispatcher context. Read by the
 * Jasper handler to write per-turn vision-usage rows. Pinning the
 * fields here keeps the telemetry / analytics dashboards stable.
 */
export interface VisionUsageRecord {
  readonly photo_id: string
  readonly focus: string
  readonly input_tokens: number | null
  readonly output_tokens: number | null
  readonly confidence: VisionConfidence
}
