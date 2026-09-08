/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ToolsHub — the home of the working tools, a dock destination. Five
 * rows on the open page: the tool's name and one line on what it does.
 * No card, no icon tiles, no subtitle — the rows are the explanation.
 *
 * A tool opened from a project attaches to that project and returns to
 * it; opened from here, a calculator just runs, and Logger Studio asks
 * which assessment to attach to before it ingests a file (the shell
 * owns that chooser — see openTool in MobileApp).
 */
import * as V3 from '../styles/tokens'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

export const TOOLS = [
  { id: 'sensor-data', title: 'Logger Studio', body: 'Chart a logger export and send session averages to an assessment.' },
  { id: 'ventilation', title: 'Ventilation', body: 'ASHRAE 62.1 required outdoor air beside a CO₂-based delivery estimate.' },
  { id: 'sampling-forms', title: 'Sampling forms', body: 'Chain-of-custody forms with your identity and calibration pre-filled.' },
  { id: 'incident-log', title: 'Incidents', body: 'Document indoor air events for the record, with a Word export.' },
  { id: 'search', title: 'Search', body: 'Reports, incidents, settings and help.' },
]

export default function ToolsHub({ onOpen }) {
  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ ...V3.T.h1, marginBottom: 12 }}>Tools</div>
      <div>
        {TOOLS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
              padding: '16px 0', background: 'transparent', border: 'none',
              borderTop: i === 0 ? 'none' : HAIRLINE,
              cursor: 'pointer', fontFamily: 'inherit', color: V3.TEXT_PRIMARY, WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...V3.T.h3, display: 'block' }}>{t.title}</span>
              <span style={{ ...V3.T.caption, display: 'block', marginTop: 2, fontWeight: 400 }}>{t.body}</span>
            </span>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, color: V3.TEXT_TERTIARY, flexShrink: 0 }}>›</span>
          </button>
        ))}
        <div style={{ borderTop: HAIRLINE }} />
      </div>
    </div>
  )
}
