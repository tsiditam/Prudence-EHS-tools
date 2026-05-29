/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Event-spine types — the typed enum every emitter (client + server)
 * shares so the audit_log table speaks one vocabulary across the app.
 *
 * Why this exists:
 *   `auditLog()` accepts any string for `action`, so every call site
 *   today chooses its own name and there's no compile-time check that
 *   downstream queries (analytics dashboards, fine-tune dataset
 *   filters, compliance reports) are looking for the same string the
 *   call sites are writing. This module pins the canonical set.
 *
 * Why audit_log (not analytics_events):
 *   audit_log captures actor_id, target_id, target_type, details, and
 *   IP — the forensic shape product-flow events also need (who did
 *   what to what, when). analytics_events stays for high-volume
 *   browser-side telemetry (page-view, click). Per the connectivity
 *   plan: reuse audit_log; route new events through emitEvent /
 *   /api/events instead of inventing transport.
 */

/** Canonical, typed product-flow events. */
export type EventName =
  /** Logger Studio successfully parsed a sensor-logger CSV. */
  | 'logger_imported'
  /** Jasper's analyze_photo tool returned status:ok. */
  | 'photo_analyzed'
  /** Composite score computed for a draft (engine.scoring path). */
  | 'engine_ran'
  /** A Jasper turn was sent (one event per user message). */
  | 'jasper_asked'
  /** /api/narrative success path emitted a narrative. */
  | 'narrative_generated'
  /** handleExport in MobileApp.jsx succeeded (built-in OR template). */
  | 'report_exported'
  /**
   * finishAssessment in MobileApp.jsx wrote a finalized report row.
   * When `details.site_id` is present, /api/events dispatches
   * `enqueueReassessmentReminder` to schedule the re-assessment
   * email. Habit-loop PR 1.
   */
  | 'assessment_finalized'
  /**
   * Assessor sent a finalized report to a peer reviewer (habit-loop
   * PR 4). details: { peer_review_id, reviewer_email_hash }.
   */
  | 'peer_review_requested'
  /**
   * Reviewer submitted a response via the magic-link landing page
   * (habit-loop PR 4). details: { peer_review_id, status }.
   */
  | 'peer_review_completed'
  /**
   * User uploaded lab results CSV for a finalized assessment
   * (habit-loop PR 5). details: { report_id }. The /api/events
   * dispatcher cancels any pending sampling_results.reminder when
   * this fires.
   */
  | 'lab_results_attached'

export const KNOWN_EVENTS: readonly EventName[] = [
  'logger_imported',
  'photo_analyzed',
  'engine_ran',
  'jasper_asked',
  'narrative_generated',
  'report_exported',
  'assessment_finalized',
  'peer_review_requested',
  'peer_review_completed',
  'lab_results_attached',
] as const

/** Optional caller-supplied input for one event. */
export interface EmitEventInput {
  /**
   * Stable identifier of the thing the event is about
   * (draft id, conversation id, photo id). Optional but recommended —
   * lets target_type/target_id queries reconstruct per-assessment
   * timelines.
   */
  readonly target_id?: string | null
  /**
   * Free-form label for what target_id points at ('assessment',
   * 'conversation', 'photo', 'logger_session'). Mirrors the existing
   * audit_log convention.
   */
  readonly target_type?: string | null
  /**
   * Structured per-event payload. Kept loose intentionally — the
   * dashboard / fine-tune consumers project their own shape out of
   * details.* via JSON path queries.
   */
  readonly details?: Readonly<Record<string, unknown>> | null
}

/** Successful emit response from /api/events. */
export interface EmitEventResponse {
  readonly ok: true
}
