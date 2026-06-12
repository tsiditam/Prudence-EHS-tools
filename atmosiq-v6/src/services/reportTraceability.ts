/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * reportTraceability — pure traceability-row projection (KG §17).
 *
 * Single source of truth for the Evidence Traceability Matrix rows, shared by
 * the DOCX section (sections-traceability.js) and the on-screen preview card,
 * so the rendered report and the web view can never diverge. No docx import,
 * no engine access; just shapes a KGContext into auditable rows.
 */
import type { KGContext } from '../types/knowledgeGraph'

export interface TraceabilityRow {
  finding: string
  severity: string | null
  supporting: string
  conflicting: string
  standards: string
  confidence: string
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
const join = (arr?: string[]) => (arr && arr.length ? arr.join('; ') : '—')

// Annotate a standard with its screening framing so a reference can never be
// read as a health/compliance limit (CO2 / ASHRAE 62.1).
export const standardCell = (s: { label: string; is_health_limit: boolean }) =>
  s.is_health_limit ? s.label : `${s.label} (screening reference — not a health limit)`

/** One row per finding: its supporting/conflicting evidence, framed standards,
 * severity, and the engine's categorical confidence. */
export function traceabilityRows(graphContext: KGContext | null): TraceabilityRow[] {
  const findings = graphContext && Array.isArray(graphContext.findings) ? graphContext.findings : []
  return findings.map((f) => ({
    finding: String(f.finding || '').slice(0, 180),
    severity: f.severity || null,
    supporting: join((f.supported_by || []).map((e) => e.label)),
    conflicting: join((f.contradicted_by || []).map((e) => e.label)),
    standards: join((f.standards || []).map(standardCell)),
    confidence: cap(f.confidence),
  }))
}
