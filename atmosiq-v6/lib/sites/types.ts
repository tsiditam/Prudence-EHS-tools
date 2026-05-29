/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Site library — typed shape for `public.sites` (migration 017).
 *
 * Read-only (every field readonly) so consumers can't mutate a row in
 * place. The endpoint takes `SiteInput` for writes; the response
 * shape is `Site`. Mirrors the lib/context/types.ts readonly pattern.
 */

/** A persisted site row. Read-only — consumers never write here. */
export interface Site {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly address: string | null
  readonly building_type: string | null
  readonly notes: string | null
  /**
   * Reassessment cadence. 12 months is the default (annual IH
   * practice). A per-site override is intentionally NOT exposed in
   * the PR 1 UI; the column ships so a future PR can add the picker
   * without a schema change.
   */
  readonly reassessment_interval_months: number
  /** Latest finalized assessment that referenced this site. ISO string. */
  readonly last_finalized_at: string | null
  /** When the next reassessment-due email should fire. ISO string. */
  readonly next_due_at: string | null
  /** Non-null = reminders paused. The row stays for pre-population reuse. */
  readonly disabled_at: string | null
  readonly created_at: string
  readonly updated_at: string
}

/**
 * Input shape for /api/sites { action:'save' }. Upserts by id when
 * present; inserts otherwise. The server fills user_id, timestamps,
 * and the next_due_at re-compute.
 */
export interface SiteInput {
  readonly id?: string
  readonly name: string
  readonly address?: string | null
  readonly building_type?: string | null
  readonly notes?: string | null
  readonly reassessment_interval_months?: number
  /** Pass true to pause reminders without deleting the row. */
  readonly disabled?: boolean
}

/** Email preferences JSONB shape on profiles (migration 019). */
export interface EmailPreferences {
  readonly reassessment_reminders: boolean
  readonly onboarding_emails: boolean
  readonly calibration_expiry: boolean
  readonly portfolio_digest: boolean
  readonly sampling_results_outstanding: boolean
}

/** Default-on for every flag — matches the migration default. */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  reassessment_reminders: true,
  onboarding_emails: true,
  calibration_expiry: true,
  portfolio_digest: true,
  sampling_results_outstanding: true,
} as const
