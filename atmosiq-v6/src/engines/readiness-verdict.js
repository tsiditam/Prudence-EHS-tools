/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow Readiness Verdict — single source of truth for the
 * "is this assessment ready to finalize?" question.
 *
 * Combines three pure inspectors into one consistent JSON shape:
 *   1. validateAssessment() from validation.js — 6 hard finalization
 *      blockers + soft warnings, exists since v2.7
 *   2. detectDefensibilityGaps() from defensibility-gaps.js — 6 soft
 *      evidentiary-context gaps that reduce defensibility under review
 *   3. confidenceCounts() — count of findings per confidence tier
 *
 * Engine-sacred boundary: this file imports validation.js (an existing
 * inspector, not a scoring path) and the new defensibility-gaps.js.
 * It does not touch scoring.js, threshold constants, or rendering.
 *
 * The returned verdict is the same shape consumed by:
 *   • The Readiness panel UI in results view
 *   • The chat agent's context block (so the agent can reason about
 *     gaps without needing a separate tool-call round trip)
 *
 * Pure: same input → same output. No I/O. No engine writes.
 */

import { validateAssessment } from './validation'
import { detectDefensibilityGaps } from './defensibility-gaps'

function confidenceCounts(assessment) {
  const counts = { high: 0, medium: 0, low: 0, qualitative_only: 0 }
  const zoneScores = assessment.zoneScores || []
  for (const zs of zoneScores) {
    for (const c of zs.cats || []) {
      for (const r of c.r || []) {
        if (!r) continue
        const tier =
          r.confidenceTier ||
          (r.qualitative_only === true ? 'qualitative_only' : null) ||
          // Fall back to severity-implied tier when no explicit tier is set,
          // so the breakdown is meaningful even on legacy findings.
          ({ critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' }[r.sev] ||
            null)
        if (tier && Object.prototype.hasOwnProperty.call(counts, tier)) counts[tier]++
      }
    }
  }
  return counts
}

/**
 * Top-line status pill. Maps the three signal streams to one of:
 *   'ready'    — no blockers, no gaps → assessor can finalize
 *   'gaps'     — no blockers but defensibility gaps exist → can
 *                finalize but should resolve or disclose first
 *   'blocked'  — finalization blockers exist → cannot export until
 *                resolved
 */
function deriveStatus({ canFinalize, gaps, dismissible }) {
  if (!canFinalize) return 'blocked'
  if (gaps.length > 0 || dismissible.length > 0) return 'gaps'
  return 'ready'
}

/**
 * buildReadinessVerdict(assessment) -> Verdict
 *
 * Verdict shape (this is what the UI and the chat agent consume):
 *   {
 *     status: 'ready' | 'gaps' | 'blocked',
 *     mode: 'FULL_ASSESSMENT' | 'IH_SCREENING' | 'FM' | ...,
 *     ready: boolean,                        // canFinalize and no gaps
 *     can_finalize: boolean,                 // engine validator says yes
 *     finalization_blockers: string[],       // hard blockers (from validation.js)
 *     finalization_warnings: string[],       // soft warnings (from validation.js)
 *     defensibility_gaps: Gap[],             // from defensibility-gaps.js
 *     confidence: { high, medium, low, qualitative_only },
 *     summary: string,                       // short human-readable one-liner
 *   }
 */
export function buildReadinessVerdict(assessment) {
  if (!assessment || typeof assessment !== 'object') {
    return {
      status: 'blocked',
      mode: 'UNKNOWN',
      ready: false,
      can_finalize: false,
      finalization_blockers: ['Assessment object missing or malformed.'],
      finalization_warnings: [],
      defensibility_gaps: [],
      confidence: { high: 0, medium: 0, low: 0, qualitative_only: 0 },
      summary: 'No assessment loaded.',
    }
  }

  const gate = validateAssessment(assessment)
  const gaps = detectDefensibilityGaps(assessment)
  const confidence = confidenceCounts(assessment)
  const dismissible = gate.dismissibleBlockers || []
  const status = deriveStatus({ canFinalize: gate.canFinalize, gaps, dismissible })
  const ready = status === 'ready'

  let summary
  if (status === 'ready') {
    summary = `Ready for sign-off — ${confidence.high + confidence.medium + confidence.low + confidence.qualitative_only} findings, no blockers.`
  } else if (status === 'gaps') {
    const parts = []
    if (gaps.length > 0) parts.push(`${gaps.length} defensibility gap${gaps.length === 1 ? '' : 's'}`)
    if (dismissible.length > 0) parts.push(`${dismissible.length} dismissible item${dismissible.length === 1 ? '' : 's'}`)
    summary = `${parts.join(' + ')} to resolve or disclose before sign-off.`
  } else {
    summary = `${gate.blockers.length} blocker${gate.blockers.length === 1 ? '' : 's'} to clear before this report can finalize.`
  }

  return {
    status,
    mode: gate.mode,
    ready,
    can_finalize: gate.canFinalize,
    finalization_blockers: gate.blockers,
    finalization_blocker_details: gate.hardBlockers || [],
    finalization_dismissible: dismissible,
    finalization_warnings: gate.warnings,
    defensibility_gaps: gaps,
    confidence,
    summary,
  }
}

export const __test = { confidenceCounts, deriveStatus }
