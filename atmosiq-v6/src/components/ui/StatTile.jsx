/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * StatTile — a labelled numeric readout tile (big tabular value over a dim
 * caption) used in the Logger Studio file-summary stat grid. Plain V3 token
 * surface, not soft-glass.
 */
import * as V3 from '../../styles/tokens'

const TEXT = 'var(--text)', BORDER = 'var(--border)'

export default function StatTile({ label, value }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: 'var(--font-mono)', letterSpacing: '-0.3px' }}>{value}</div>
      <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{label}</div>
    </div>
  )
}
