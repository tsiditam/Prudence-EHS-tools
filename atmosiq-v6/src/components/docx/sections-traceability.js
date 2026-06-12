/**
 * AtmosFlow DOCX Report — Evidence Traceability Matrix (KG stage 4, spec §17).
 *
 * A CIH-reasoning body section (rendered only for data.reportStyle === 'cih',
 * alongside the Conceptual Site Model and Findings Confidence Register). For
 * every flagged screening finding it traces the chain of custody from the
 * finding back to the evidence that supports or conflicts with it and the
 * standards it references — sourced from the SAME derived knowledge graph the
 * Evidence Map UI and Jasper read, so the report can never disagree with them.
 *
 * Engine-sacred audit: consumes the graph projection (built upstream from
 * zoneScores / causalChains / recs); no scoring, no thresholds, no compliance
 * determinations. Standards framed is_health_limit=false are annotated as
 * screening references, never limits. Each finding requires IH review.
 *
 * traceabilityRows() is the pure, tested seam; buildEvidenceTraceabilityMatrix
 * is the thin DOCX wrapper. Returns null when there is nothing to render.
 */

import { AlignmentType } from 'docx'
import { COLORS, SEV_COLORS } from './styles'
import { p } from './paragraphs'
import { buildTable } from './tables'

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
const join = (arr) => (arr && arr.length ? arr.join('; ') : '—')

// Annotate a standard with its screening framing so a reference can never be
// read as a health/compliance limit in the deliverable (CO2 / ASHRAE 62.1).
const standardCell = (s) =>
  s.is_health_limit ? s.label : `${s.label} (screening reference — not a health limit)`

/**
 * Pure projection: graph context -> traceability rows. One row per finding,
 * each carrying its supporting / conflicting evidence labels, framed
 * standards, severity, and the categorical confidence the engine assigned.
 */
export function traceabilityRows(graphContext) {
  const findings = (graphContext && Array.isArray(graphContext.findings)) ? graphContext.findings : []
  return findings.map((f) => ({
    finding: String(f.finding || '').slice(0, 180),
    severity: f.severity || null,
    supporting: join((f.supported_by || []).map((e) => e.label)),
    conflicting: join((f.contradicted_by || []).map((e) => e.label)),
    standards: join((f.standards || []).map(standardCell)),
    confidence: cap(f.confidence),
  }))
}

export function buildEvidenceTraceabilityMatrix(graphContext) {
  const rows = traceabilityRows(graphContext)
  if (rows.length === 0) return null

  const out = [
    p(
      'Each flagged screening finding is traced to the field evidence that supports or conflicts with it and to the standards it references. Relationships are derived from the deterministic scoring graph — the same basis used elsewhere in this report — and support, but do not confirm, interpretation. Standards shown as "screening reference" are used to gauge screening adequacy and are not health or compliance limits.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
    buildTable(
      [
        { text: 'Screening finding', width: 30 },
        { text: 'Supporting evidence', width: 22 },
        { text: 'Conflicting evidence', width: 14 },
        { text: 'Standard referenced', width: 22 },
        { text: 'Confidence', width: 12 },
      ],
      rows.map((r) => [
        {
          text: r.severity && SEV_LABEL[r.severity] ? `[${SEV_LABEL[r.severity]}] ${r.finding}` : r.finding,
          size: 18,
          color: r.severity && SEV_COLORS[r.severity] ? SEV_COLORS[r.severity] : COLORS.body,
        },
        { text: r.supporting, size: 18, color: COLORS.sub },
        { text: r.conflicting, size: 18, color: r.conflicting === '—' ? COLORS.sub : COLORS.body },
        { text: r.standards, size: 18, color: COLORS.sub },
        { text: r.confidence, size: 18, bold: true },
      ]),
    ),
    p(
      'Every finding above requires industrial-hygienist review before remedial action. This matrix records the screening basis; it is not a determination of cause or compliance.',
      { size: 18, color: COLORS.sub, italics: true, after: 80 },
    ),
  ]
  return { title: 'Evidence Traceability Matrix', children: out }
}
