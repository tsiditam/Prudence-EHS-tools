/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ToolsHub — the home of the working tools, a dock destination. Seven
 * rows on the open page: a glyph, the tool's name, one line on what it
 * does, a chevron. Sites and Report templates moved here from Settings
 * (2026-09): both are working surfaces, not preferences.
 *
 * The glyph is what says "tool". A restraint pass removed it along with
 * the tinted tile it sat in, and the screen read as a settings list —
 * "Ventilation" could have been a toggle. The tile was the tell, not
 * the glyph: it comes back the way a launcher list draws it — a
 * single-weight line icon in the subtitle's ink, no box, no tint, in a
 * fixed column so the titles align (Wiedenbeck 1999: icon + label is
 * found fastest; the label alone is read, the pair is glanced). The
 * subtitle is one line and truncates, so every row is the same height
 * and the glyphs read as a column.
 *
 * A tool opened from a project attaches to that project and returns to
 * it; opened from here, a calculator just runs, and Logger Studio asks
 * which assessment to attach to before it ingests a file (the shell
 * owns that chooser — see openTool in MobileApp).
 */
import * as V3 from '../styles/tokens'
import { I } from './Icons'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

// One line each at phone width (about 42 characters), so the row never
// truncates mid-thought.
export const TOOLS = [
  { id: 'sensor-data', icon: 'chartLine', title: 'Logger Studio', body: 'Chart logger exports, attach the averages.' },
  { id: 'ventilation', icon: 'wind', title: 'Ventilation', body: 'ASHRAE 62.1 outdoor air and CO₂ delivery.' },
  { id: 'sampling-forms', icon: 'findings', title: 'Sampling forms', body: 'Chain-of-custody forms, pre-filled.' },
  { id: 'incident-log', icon: 'flag', title: 'Incidents', body: 'Document air events, export to Word.' },
  { id: 'sites', icon: 'location', title: 'Sites', body: 'Saved buildings and re-assessment reminders.' },
  { id: 'report-templates', icon: 'template', title: 'Report templates', body: 'Word templates the AI fills from an assessment.' },
  { id: 'search', icon: 'search', title: 'Search', body: 'Reports, incidents, settings and help.' },
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
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
              padding: '15px 0', background: 'transparent', border: 'none',
              borderTop: i === 0 ? 'none' : HAIRLINE,
              cursor: 'pointer', fontFamily: 'inherit', color: V3.TEXT_PRIMARY, WebkitTapHighlightColor: 'transparent',
            }}>
            {/* The glyph column: 28px wide, the icon in the subtitle's ink. */}
            <span aria-hidden="true" style={{ width: 28, flexShrink: 0, display: 'inline-flex', justifyContent: 'center', color: V3.TEXT_SECONDARY }}>
              <I n={t.icon} s={22} w={1.7} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...V3.T.h3, display: 'block' }}>{t.title}</span>
              <span style={{ ...V3.T.caption, display: 'block', marginTop: 2, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</span>
            </span>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1, color: V3.TEXT_TERTIARY, flexShrink: 0 }}>›</span>
          </button>
        ))}
        <div style={{ borderTop: HAIRLINE }} />
      </div>
    </div>
  )
}
