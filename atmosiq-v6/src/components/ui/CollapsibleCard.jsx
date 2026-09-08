/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * CollapsibleCard — a GlassCard whose header toggles its body. The header is
 * a micro-label title plus an optional dim summary shown while collapsed.
 *
 *   <CollapsibleCard title="Occupancy periods" summary="2 periods" defaultOpen>
 *     …
 *   </CollapsibleCard>
 *
 * `flat` renders the same header + body without its own card, so a host can
 * stack several inside ONE card as hairline-divided rows (Logger Studio's
 * chart settings) instead of three stacked cards that push the chart off
 * the first screen.
 */
import { useState } from 'react'
import * as V3 from '../../styles/tokens'
import GlassCard from './GlassCard'

const SUB = 'var(--sub)'

export default function CollapsibleCard({ title, summary, defaultOpen = false, flat = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const body = (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: flat ? 44 : undefined, background: 'none', border: 'none', padding: flat ? '10px 16px' : 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          {/* nowrap: a two-word title used to wrap to two lines beside its
              summary on a phone ("COMPARE / DATASETS"), doubling the row. */}
          <span style={{ ...V3.T.micro, whiteSpace: 'nowrap', flexShrink: 0 }}>{title}</span>
          {summary ? <span style={{ ...V3.T.captionDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span> : null}
        </span>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, color: SUB, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>›</span>
      </button>
      {open ? <div style={{ margin: flat ? '0 16px 14px' : '12px 0 0' }}>{children}</div> : null}
    </>
  )
  if (flat) return <div>{body}</div>
  return <GlassCard style={{ marginTop: 14 }}>{body}</GlassCard>
}
