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
    projects_index: state.projects_index ?? null,

    // A scoped knowledge-graph projection (`knowledge_graph`, KG stage 2 §16)
    // was attached here. Removed from the Jasper context — NOT deleted; see
    // graphContext.ts, still built for the Evidence tab and the dev
    // traceability card.
    //
    // Why it stopped riding along: this call was never gated, while the KG
    // surface is (`isKnowledgeGraphEnabled` is off on the production host).
    // So the projection shipped in every uncached context block, in
    // production, for a feature no user could open — measured at roughly
    // 60% of the per-turn payload (4k of 8k tokens at 2 zones, 15k of 25k at
    // 8). Nobody chose that pairing; the flag governs the UI and the payload
    // was wired around it.
    //
    // What it carried that nothing else did was `contradicted_by` — the
    // evidence arguing AGAINST a finding. The machinery for it is complete
    // and proven: `projectGraph` emits CONTRADICTS_FINDING edges and
    // `summarizeGraph` resolves them, asserted in graphContext.test.ts. What
    // is missing is a PRODUCER. The mapping from engine state
    // (knowledgeGraphBuilder.ts) sets `supportsFindings` at four sites and
    // `contradictsFindings` at none, so the only thing that has ever
    // populated it is a hand-written KGModel in that test, and the array is
    // empty in every projection built from a real assessment.
    //
    // `supported_by` is `findingsInCat` — every finding in the same
    // category, which is a category join the context already carries, not
    // evidence linkage. The remainder was a third serialisation of the
    // findings (they are already under engine_outputs and walkthrough_findings).
    //
    // Its five grounding rules were the real loss and did not go with it:
    // four are now in FIELD_ASSISTANT_ROLE_PROMPT under "Reading the
    // engine's findings", where the CACHED prefix carries them once per
    // session rather than the uncached block re-sending them every turn. The
    // fifth was an instruction about `contradicted_by`, written for a
    // capability that was never built.
    //
    // To restore this: populate `contradictsFindings` from something real
    // first. Re-attaching an empty projection buys nothing and costs 60%.
  }
}
