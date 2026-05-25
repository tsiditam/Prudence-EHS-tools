/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * CollapsibleCard — a GlassCard with a micro-label header that toggles its
 * body open/closed, plus an optional dim summary shown while collapsed. Keeps
 * secondary tools (reference lines, dataset comparison, occupancy) from
 * competing with primary content at full weight; each opens on demand. Open
 * state is ephemeral (per mount).
 */
import { useState } from 'react'
import * as V3 from '../../styles/tokens'
import GlassCard from './GlassCard'

const SUB = 'var(--sub)'

export default function CollapsibleCard({ title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <GlassCard style={{ marginTop: 14 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={V3.T.micro}>{title}</span>
          {summary ? <span style={{ ...V3.T.captionDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span> : null}
        </span>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, color: SUB, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </GlassCard>
  )
}
