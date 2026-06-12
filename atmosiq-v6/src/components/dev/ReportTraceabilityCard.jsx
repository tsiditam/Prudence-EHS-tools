/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ReportTraceabilityCard — on-screen render of the §17 Evidence Traceability
 * Matrix. Uses the SAME traceabilityRows projection the DOCX section renders,
 * so what you see here is exactly what the report carries. Read-only.
 */
import { useMemo } from 'react'
import { buildGraphContext } from '../../../lib/context/graphContext'
import { traceabilityRows } from '../../services/reportTraceability'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const BORDER_SUBTLE = 'var(--border-subtle, rgba(255,255,255,0.06))'

const TH = { textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: DIM, padding: '8px 10px', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'bottom' }
const TD = { fontSize: 12, color: SUB, lineHeight: 1.45, padding: '10px', borderBottom: `1px solid ${BORDER_SUBTLE}`, verticalAlign: 'top' }

export default function ReportTraceabilityCard({ zones, zoneScores, causalChains, recs, assessmentId }) {
  const rows = useMemo(() => {
    const ctx = buildGraphContext({ zones, zoneScores, causalChains, recs, id: assessmentId })
    return traceabilityRows(ctx)
  }, [zones, zoneScores, causalChains, recs, assessmentId])

  if (rows.length === 0) {
    return (
      <div style={{ padding: 28, textAlign: 'center', background: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, color: DIM, fontSize: 12 }}>
        No traceable findings yet — the matrix appears once the assessment has scored findings.
      </div>
    )
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: '28%' }}>Screening finding</th>
              <th style={{ ...TH, width: '24%' }}>Supporting evidence</th>
              <th style={{ ...TH, width: '14%' }}>Conflicting evidence</th>
              <th style={{ ...TH, width: '24%' }}>Standard referenced</th>
              <th style={{ ...TH, width: '10%' }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...TD, color: TEXT, fontWeight: 600 }}>{r.severity ? `[${r.severity}] ` : ''}{r.finding}</td>
                <td style={TD}>{r.supporting}</td>
                <td style={{ ...TD, color: r.conflicting === '—' ? DIM : TEXT }}>{r.conflicting}</td>
                <td style={TD}>{r.standards}</td>
                <td style={{ ...TD, color: TEXT, fontWeight: 700 }}>{r.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 12px', fontSize: 11, color: DIM, fontStyle: 'italic', borderTop: `1px solid ${BORDER_SUBTLE}` }}>
        Every finding above requires industrial-hygienist review before remedial action. This matrix records the screening basis; it is not a determination of cause or compliance.
      </div>
    </div>
  )
}
