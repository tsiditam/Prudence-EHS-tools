/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Shared assessment-context shape — the single structure every
 * downstream module (Jasper, narrative generation, report rendering,
 * Logger Studio, photo analysis, future server-side revalidation)
 * reads from.
 *
 * Why this exists:
 *   Today each consumer pulls assessment data its own way. Jasper
 *   hand-builds a `context = {...}` literal in MobileApp.jsx; the DOCX
 *   renderer takes a separate prop bag; /api/report-templates-render
 *   accepts a freeform `assessment_context` whose shape nobody
 *   enforces. Adding a new consumer means a new bespoke data pull.
 *
 *   This interface (plus the builder in ./buildAssessmentContext.ts)
 *   gives every module one language to speak. The engine stays
 *   sacred — this is a *read* contract over the engine's outputs, not
 *   a new computation path.
 *
 * One-way data flow:
 *   Every field is `readonly`. Consumers READ the context; they never
 *   write back into it, into the engine, or into the assessment
 *   record. A consumer that tries to mutate a field fails at the type
 *   level. (See CLAUDE.md "Data flow".)
 *
 * Token / payload discipline:
 *   • `photos` is an index of {id, label, count} — never base64 bytes
 *     (the same discipline that fixed the Jasper hot-path bundle).
 *   • `logger_data_summary` reuses the already-capped summary from
 *     lib/jasper/logger-context-summary.ts.
 */

import type { LoggerContextSummary } from '../jasper/logger-context-summary'

/** A single finalization / defensibility blocker or gap detail. */
export interface ReadinessBlockerDetail {
  readonly id?: string
  readonly field?: string
  readonly label?: string
  readonly message?: string
  readonly location?: string
  readonly severity?: string
}

/** Defensibility gap surfaced by detectDefensibilityGaps(). */
export interface DefensibilityGap {
  readonly kind?: string
  readonly severity?: string
  readonly zones?: readonly string[]
  readonly count?: number
  readonly why?: string
}

/**
 * The verdict returned by buildReadinessVerdict() in
 * src/engines/readiness-verdict.js. Captured here as a read contract
 * so consumers don't each re-derive the shape. Mirrors that function's
 * return object field-for-field.
 */
export interface ReadinessVerdict {
  readonly status: 'ready' | 'gaps' | 'blocked'
  readonly mode: string
  readonly ready: boolean
  readonly can_finalize: boolean
  readonly finalization_blockers: readonly string[]
  readonly finalization_blocker_details?: readonly ReadinessBlockerDetail[]
  readonly finalization_dismissible?: readonly ReadinessBlockerDetail[]
  readonly finalization_warnings: readonly string[]
  readonly defensibility_gaps: readonly DefensibilityGap[]
  readonly confidence: {
    readonly high: number
    readonly medium: number
    readonly low: number
    readonly qualitative_only: number
  }
  readonly summary: string
}

/** Compact per-zone descriptor — label + use, no measurement payload. */
export interface ZoneSummary {
  readonly index: number
  readonly id: string | null
  readonly label: string | null
  readonly use: string | null
  readonly is_current: boolean
}

/** One finding rolled up for context — severity + title + location. */
export interface FindingSummary {
  readonly severity: string | null
  readonly title: string | null
  readonly location: string | null
  readonly zone_label: string | null
  readonly qualitative_only: boolean
}

/** Photo index entry — id + label + count, never the image bytes. */
export interface PhotoIndexEntry {
  readonly id: string
  readonly label: string | null
  readonly count: number
}

/** Engine-computed outputs, passed through unchanged from the engine. */
export interface EngineOutputs {
  readonly zone_scores: unknown
  readonly composite: unknown
  readonly recommendations: unknown
  readonly sampling_plan: unknown
  readonly narrative: unknown
  readonly causal_chains: unknown
}

/** Report-draft state — which deliverable, what options, last export. */
export interface ReportDraftState {
  readonly format: string | null
  readonly options: Readonly<Record<string, unknown>> | null
  readonly last_exported_at: string | null
}

/**
 * The canonical assessment context. Build it with
 * buildAssessmentContext(); never construct it by hand.
 */
export interface AssessmentContext {
  readonly meta: {
    readonly id: string | null
    readonly draft_id: string | null
    readonly mode: string
    readonly engine_version: string
    readonly generated_at: string
    readonly view: string | null
  }
  readonly project: {
    readonly client: string | null
    readonly requested_by: string | null
    readonly recipient: {
      readonly name: string | null
      readonly firm: string | null
      readonly email: string | null
      readonly phone: string | null
    }
  }
  readonly building: {
    readonly name: string | null
    readonly address: string | null
    readonly type: string | null
    readonly sqft: string | null
    readonly profile: string | null
  }
  readonly zones: readonly ZoneSummary[]
  readonly walkthrough_findings: readonly FindingSummary[]
  readonly logger_data_summary: LoggerContextSummary | null
  readonly photos: readonly PhotoIndexEntry[]
  readonly engine_outputs: EngineOutputs | null
  readonly readiness_verdict: ReadinessVerdict | null
  readonly report_draft_state: ReportDraftState | null
}

/**
 * Loose shape of the raw client/app state the builder accepts. Every
 * field is optional — the builder is defensive and produces a valid
 * context from a partial draft (e.g. on the dashboard before a draft
 * is hydrated). Mirrors the state slices already in scope at the
 * Jasper mount in MobileApp.jsx.
 */
export interface RawAssessmentState {
  view?: string
  presurvey?: Record<string, unknown>
  bldg?: Record<string, unknown>
  building?: Record<string, unknown>
  client?: Record<string, unknown>
  zones?: Array<Record<string, unknown>>
  curZone?: number
  equipment?: unknown
  photos?: Record<string, Array<Record<string, unknown>>>
  photoOverrides?: Record<string, unknown>
  sensorData?: unknown
  comp?: unknown
  composite?: unknown
  zoneScores?: unknown
  recs?: unknown
  narrative?: unknown
  samplingPlan?: unknown
  causalChains?: unknown
  confidence?: string
  profile?: Record<string, unknown>
  draftId?: string | null
  assessmentMode?: string
  reportDraftState?: Partial<ReportDraftState>
}

/**
 * Extends RawAssessmentState with Jasper-runtime fields that live in
 * MobileApp.jsx state but are not part of the persisted assessment
 * draft (incident log entries, discrepancy-scan payloads, and the
 * draft index used as an active-assessment fallback on the dashboard).
 */
export interface JasperContextInput extends RawAssessmentState {
  /** Active incident being reviewed in the incident-detail view. */
  incident?: unknown
  /** Discrepancy-scan payload attached during a "Review for discrepancies" run. */
  report_review?: unknown
  /** Draft / report index — used as facility-name fallback when bldg isn't hydrated. */
  index?: { drafts?: Array<{ facility?: string }>; reports?: unknown[] }
  /**
   * Summary of the Project / Site workspace the assessor is currently
   * working in (set when the project-detail view is open). Distinct from
   * AssessmentContext.project, which is the report-engagement metadata
   * (client / recipient) of a single assessment.
   */
  project_workspace?: Record<string, unknown> | null
}

/**
 * The context object passed as the `context` prop to FieldAssistant /
 * Jasper. It is a strict superset of AssessmentContext:
 *
 *   • All normalized AssessmentContext fields are present (meta, project,
 *     building, zones, walkthrough_findings, …) so new consumers can read
 *     the canonical shape.
 *   • The legacy Jasper field names (bldg, current_zone, readiness,
 *     logger_studio, …) are preserved as top-level aliases so that:
 *       1. FieldAssistant.jsx chip strip keeps working without changes.
 *       2. The AI's context block still surfaces the same key names the
 *          system prompt was authored against.
 *
 * Build it with buildJasperContext(); never construct it by hand.
 */
export type JasperContext = AssessmentContext & {
  // ── Legacy top-level aliases ──────────────────────────────────────
  /** Alias for meta.view. */
  readonly view: string | null
  /** Raw presurvey object — AI reads ps_recipient_* fields from here. */
  readonly presurvey: Record<string, unknown> | null
  /** Raw building object (same shape as state.bldg). */
  readonly bldg: Record<string, unknown> | null
  /** Raw zone object at the current zone index (with sensor readings). */
  readonly current_zone: Record<string, unknown> | null
  /** Number of zones in this assessment. */
  readonly zones_count: number
  /**
   * Short active-assessment descriptor rendered in the Jasper chip
   * strip and used as context by the AI.
   */
  readonly active_assessment: { readonly facility: string; readonly status: string } | null
  /** Assessor profile fields relevant to report eligibility. */
  readonly profile_minimal: {
    readonly plan: unknown
    readonly certs: unknown
    readonly firm: unknown
  } | null
  /** Alias for readiness_verdict — preserved for AI context-block compat. */
  readonly readiness: ReadinessVerdict | null
  /** Alias for logger_data_summary — preserved for AI context-block compat. */
  readonly logger_studio: LoggerContextSummary | null
  /** Active incident (passthrough from MobileApp state). */
  readonly incident: unknown
  /** Discrepancy-scan payload (passthrough from MobileApp state). */
  readonly report_review: unknown
  /**
   * Project / Site workspace summary (passthrough) — present when the
   * assessor opened Jasper from inside a project workspace, so the AI
   * knows which site engagement the conversation is about.
   */
  readonly project_workspace: Record<string, unknown> | null
}
