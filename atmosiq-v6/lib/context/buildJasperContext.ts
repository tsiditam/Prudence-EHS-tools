/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * buildJasperContext — thin adapter that wraps buildAssessmentContext
 * with the legacy Jasper field names the AI context block and the
 * FieldAssistant.jsx chip strip have always read.
 *
 * Why a separate function rather than using AssessmentContext directly:
 *   The normalized AssessmentContext uses clean key names (building,
 *   readiness_verdict, logger_data_summary, zones). Jasper's system
 *   prompt was authored against the original MobileApp.jsx literal
 *   (bldg, readiness, logger_studio, current_zone). Renaming those
 *   keys in one step would change what the AI "sees" in its context
 *   block and risks silent quality regression.
 *
 *   This adapter is the seam: it calls buildAssessmentContext(), then
 *   attaches the legacy aliases so both the AI and the UI component
 *   keep working without change. The normalized fields are also
 *   present, so new consumers can read the canonical shape.
 *
 * Migration path (planned PR C+):
 *   Once the system prompt is updated to use normalized key names,
 *   this file can be deleted and callers can use AssessmentContext
 *   directly.
 *
 * Engine-sacred boundary: this adapter is read-only. It composes
 * buildAssessmentContext() and maps its output. It performs no scoring
 * and writes nothing back.
 */

import { buildAssessmentContext } from './buildAssessmentContext'
import type { JasperContext, JasperContextInput } from './types'

/**
 * Build the Jasper context prop from raw app state. Returns a strict
 * superset of AssessmentContext that also carries the legacy field
 * names the AI system prompt and FieldAssistant.jsx chip strip expect.
 *
 * Defensive: safe to call on a partial draft (dashboard before a
 * draft is hydrated). Never throws; all sections degrade gracefully.
 */
export function buildJasperContext(state: JasperContextInput): JasperContext {
  const base = buildAssessmentContext(state)

  const zones = Array.isArray(state.zones) ? state.zones : []
  const curZone = typeof state.curZone === 'number' ? state.curZone : -1
  const isFinalized = state.view === 'results' || state.view === 'report'

  // active_assessment: reuse the already-normalized building.name.
  // Fall back to the first in-progress draft so the chip strip names
  // the facility on the dashboard before a specific draft is opened.
  type DraftIndex = { drafts?: Array<{ facility?: string }> }
  const facilityName =
    base.building.name ||
    ((state.index as DraftIndex)?.drafts?.[0]?.facility ?? null)

  const active_assessment = facilityName
    ? { facility: facilityName, status: isFinalized ? 'Finalized report' : 'Draft assessment' }
    : null

  // current_zone: pass the raw zone object so FieldAssistant.jsx chip
  // strip can read sensor readings (.co2, .rh, .pm, .tv) and zone
  // identity (.zid, .n). Not the ZoneSummary from the base context.
  const current_zone =
    curZone >= 0 && curZone < zones.length
      ? (zones[curZone] as Record<string, unknown>)
      : null

  // profile_minimal: the three plan/cert/firm fields the AI uses to
  // gauge report-type eligibility without exposing the full profile.
  const profile = (state.profile || {}) as Record<string, unknown>
  const profile_minimal = state.profile
    ? {
        plan: profile.plan ?? null,
        certs: profile.certs ?? null,
        firm: profile.firm ?? null,
      }
    : null

  return {
    // ── Normalized AssessmentContext fields ───────────────────────
    ...base,

    // ── Legacy Jasper field names (aliases + runtime passthrough) ─
    // Preserved for backward compatibility with the AI's context
    // block and the FieldAssistant.jsx chip strip.
    view: base.meta.view,
    presurvey: (state.presurvey as Record<string, unknown>) || null,
    bldg: (state.bldg as Record<string, unknown>) || null,
    current_zone,
    zones_count: zones.length,
    active_assessment,
    profile_minimal,
    readiness: base.readiness_verdict,
    logger_studio: base.logger_data_summary,
    incident: state.incident ?? null,
    report_review: state.report_review ?? null,
    project_workspace: state.project_workspace ?? null,
  }
}
