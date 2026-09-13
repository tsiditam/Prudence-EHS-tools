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
 * Desktop (>= 1024px, `desktop` prop): the same seven tools as a toolkit
 * dashboard — three groups (Analysis, Field & documentation, System) of
 * cards, each with a sentence on what the tool does and the criterion or
 * output it works against. Cards are right here because these are
 * distinct tools with distinct jobs; a list of seven links on a 1440px
 * window read as a settings menu. The phone list is unchanged.
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
// truncates mid-thought. `desc` and `meta` are the desktop card's longer
// sentence and its criterion / output line.
export const TOOLS = [
  { id: 'sensor-data', icon: 'chartLine', title: 'Logger Studio', body: 'Chart logger exports, attach the averages.',
    desc: 'Chart continuous logger datasets, mark the occupied period, and attach the time-weighted averages to an assessment.', meta: 'CSV / XLSX exports · time-weighted averages' },
  { id: 'ventilation', icon: 'wind', title: 'Ventilation', body: 'ASHRAE 62.1 outdoor air and CO₂ delivery.',
    desc: 'Evaluate outdoor-air delivery from CO₂ and occupancy, and compare it with the ventilation rate procedure.', meta: 'ASHRAE 62.1 · CO₂ mass balance' },
  { id: 'sampling-forms', icon: 'findings', title: 'Sampling forms', body: 'Chain-of-custody forms, pre-filled.',
    desc: 'Chain-of-custody and field sampling forms pre-filled from the assessment, ready for the laboratory.', meta: 'Chain of custody · field sampling' },
  { id: 'incident-log', icon: 'flag', title: 'Incidents', body: 'Document air events, export to Word.',
    desc: 'Document an air quality event as it is reported, with the response taken, and export it to Word.', meta: 'Incident record · Word export' },
  { id: 'sites', icon: 'location', title: 'Sites', body: 'Saved buildings and re-assessment reminders.',
    desc: 'The buildings you have assessed, their history, and the re-assessment reminders set against them.', meta: 'Site library · reminders' },
  { id: 'report-templates', icon: 'template', title: 'Report templates', body: 'Word templates the AI fills from an assessment.',
    desc: 'Your own Word templates, filled from an assessment by the AI so the report leaves in your house style.', meta: 'DOCX templates · AI fill' },
  { id: 'search', icon: 'search', title: 'Search', body: 'Reports, incidents, settings and help.',
    desc: 'Find a report, an incident, a setting or a help article by name or content.', meta: 'Reports · incidents · help' },
]

const DESKTOP_GROUPS = [
  { label: 'Analysis', ids: ['sensor-data', 'ventilation'] },
  { label: 'Field & documentation', ids: ['sampling-forms', 'incident-log', 'sites'] },
  { label: 'System', ids: ['report-templates', 'search'] },
]

// Injected once: pointer-only hover for the desktop tool cards.
if (typeof document !== 'undefined' && !document.getElementById('aftools-style')) {
  const s = document.createElement('style')
  s.id = 'aftools-style'
  s.textContent = `
    @media (hover: hover) and (pointer: fine) {
      .af-tool-card:hover { background: var(--raised) !important; border-color: var(--border-strong) !important; }
      .af-tool-card:hover .af-tool-open { color: var(--text) !important; }
    }
    .af-tool-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `
  document.head.appendChild(s)
}

function ToolCard({ tool, onOpen }) {
  return (
    <button
      type="button"
      className="af-tool-card"
      onClick={() => onOpen(tool.id)}
      style={{
        ...V3.panel(), padding: '18px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column', gap: 10, minHeight: 156, color: V3.TEXT_PRIMARY,
        transition: 'background 120ms ease, border-color 120ms ease', WebkitTapHighlightColor: 'transparent',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', color: V3.TEXT_SECONDARY }}><I n={tool.icon} s={19} w={1.7} /></span>
        <span style={V3.T.h2}>{tool.title}</span>
      </span>
      <span style={{ ...V3.T.bodyDim, flex: 1 }}>{tool.desc}</span>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ ...V3.T.captionDim, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.meta}</span>
        <span className="af-tool-open" style={{ ...V3.T.caption, fontWeight: 600, color: V3.TEXT_SECONDARY, flexShrink: 0, transition: 'color 120ms ease' }}>Open <span aria-hidden="true">→</span></span>
      </span>
    </button>
  )
}

export default function ToolsHub({ onOpen, desktop = false }) {
  if (desktop) {
    const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]))
    return (
      <div style={{ paddingTop: 28, paddingBottom: 80, maxWidth: 1040 }}>
        <div style={V3.T.h1}>Tools</div>
        <div style={{ ...V3.T.bodyDim, marginTop: 4, marginBottom: 28 }}>Specialized workflows for investigation and analysis.</div>
        {DESKTOP_GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: 28 }}>
            <div style={{ ...V3.T.micro, marginBottom: 12 }}>{g.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {g.ids.map((id) => byId[id] && <ToolCard key={id} tool={byId[id]} onOpen={onOpen} />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

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
