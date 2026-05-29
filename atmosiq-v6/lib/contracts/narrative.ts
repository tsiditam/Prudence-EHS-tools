/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * /api/narrative contract — connectivity layer PR E.
 *
 * Documents the request / response shape for the AI narrative
 * generation endpoint at `api/narrative.js`. Backs the "Generate
 * narrative" affordance on the result screen. Captured here so
 * downstream callers (the SPA, the fine-tune dataset exporter,
 * any future server-side revalidator) read the same shape the
 * endpoint writes.
 *
 * Source of truth: `api/narrative.js`. The .js file is the
 * authoritative implementation; this .ts file is the typed
 * boundary spec — documentation + compile-time check for typed
 * callers. No runtime validator is enforced here.
 */

/**
 * Request body. The endpoint also accepts a Bearer token in the
 * Authorization header (Supabase access token). actor_id /
 * actor_email are derived server-side from the JWT and are never
 * read from the body.
 */
export interface NarrativeRequestBody {
  /** Compact engine-output payload the model writes narrative from. */
  readonly payload: NarrativePayload
}

/**
 * Compact engine-output payload the SPA assembles before calling the
 * endpoint. Already trimmed for token cost — no full report bytes,
 * no photos. The model writes IAQ narrative from this snapshot only.
 */
export interface NarrativePayload {
  readonly building?: Record<string, unknown>
  readonly presurvey?: Record<string, unknown>
  readonly composite?: unknown
  readonly zoneScores?: unknown
  readonly zones?: unknown
  readonly recommendations?: unknown
  readonly causalChains?: unknown
  readonly samplingPlan?: unknown
  readonly narrative?: unknown
}

/** Successful 200 response. */
export interface NarrativeOk {
  /** The generated narrative text. */
  readonly narrative: string
  /**
   * Banned-language review summary. `level: 'pass'` when no banned
   * phrases were detected; otherwise carries an actionable hint.
   */
  readonly language_review: NarrativeLanguageReview
  /** Concrete banned phrases the scanner caught. */
  readonly banned_language: readonly string[]
  /** Token + cost telemetry. */
  readonly usage: NarrativeUsage
}

export interface NarrativeLanguageReview {
  readonly level: 'pass' | 'warn' | 'block'
  readonly summary: string
}

export interface NarrativeUsage {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly estimated_cost_usd: number
}

/** Rate-limit response (per-minute, per-day, or free-tier cap). */
export interface NarrativeRateLimited {
  readonly error: 'rate_limited'
  readonly scope: 'per_minute' | 'per_day' | 'free_tier_daily'
  readonly retry_after: number
}

/** Auth + config error responses. */
export interface NarrativeAuthError {
  readonly error: 'Not authenticated' | 'Invalid token'
}

export interface NarrativeServerError {
  readonly error: string
}

/** Discriminated union of every documented response shape. */
export type NarrativeResponse =
  | NarrativeOk
  | NarrativeRateLimited
  | NarrativeAuthError
  | NarrativeServerError
