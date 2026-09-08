/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ToolsHub — the visible home of the working tools. They used to live only
 * in the hamburger menu, where hidden navigation is used by roughly a
 * third fewer people than visible navigation. Now a dock destination.
 *
 * A tool opened from a project attaches to that project and returns to it;
 * opened from here, a stateless calculator just runs, and Logger Studio
 * asks which assessment to attach to before it ingests a file (the shell
 * owns that chooser — see openTool in MobileApp).
 */
import * as V3 from '../styles/tokens'
import GlassCard from './ui/GlassCard'
import { I } from './Icons'

const TEXT = 'var(--text)', SUB = 'var(--sub)', BORDER = 'var(--border)'

export const TOOLS = [
  { id: 'sensor-data', icon: 'chartLine', title: 'Logger Studio', body: 'Upload a logger export, chart it, and send session averages to an assessment.' },
  { id: 'ventilation', icon: 'wind', title: 'Ventilation', body: 'ASHRAE 62.1 required outdoor air beside a CO₂-based delivery estimate.' },
  { id: 'sampling-forms', icon: 'flask', title: 'Sampling forms', body: 'Chain-of-custody forms with your assessor identity and calibration pre-filled.' },
  { id: 'incident-log', icon: 'alert', title: 'Incidents', body: 'Document indoor air events for the record, with a Word export.' },
  { id: 'search', icon: 'search', title: 'Search', body: 'Reports, incidents, settings and help.' },
]

export default function ToolsHub({ onOpen, attachedTo = null }) {
  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...V3.T.h1, marginBottom: 2 }}>Tools</div>
      <div style={V3.T.h1Sub}>
        {attachedTo
          ? <>Working in <span style={{ color: TEXT, fontWeight: 600 }}>{attachedTo}</span> — data tools attach to it.</>
          : 'Field tools. Logger Studio attaches to an assessment.'}
      </div>

      <GlassCard style={{ marginTop: 18, padding: 0, overflow: 'hidden' }}>
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
              padding: '14px 16px', minHeight: 64, background: 'transparent', border: 'none',
              borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
              cursor: 'pointer', fontFamily: 'inherit', color: TEXT, WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
              <I n={t.icon} s={19} c="var(--accent)" w={1.8} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...V3.T.bodyStrong, display: 'block' }}>{t.title}</span>
              <span style={{ ...V3.T.captionDim, display: 'block', marginTop: 2, lineHeight: 1.45 }}>{t.body}</span>
            </span>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, color: SUB, flexShrink: 0 }}>›</span>
          </button>
        ))}
      </GlassCard>
    </div>
  )
}
