/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * EmptyState — a first screen that shows the product, not a folder icon.
 *
 *   <EmptyState
 *     title="Start with a project"
 *     body="A project groups a site's assessments, documents and photos."
 *     action={<TactileButton …>New project</TactileButton>}
 *     secondary={{ label: 'Try a sample building', onClick }}
 *   />
 *
 * The space a list will fill is the first demonstration of the list. So
 * above the copy sits a ghost of the rows that are about to exist, in the
 * list's own layout — the dot, the title, the caption, the trailing pill —
 * fading out toward the bottom so it reads as a preview and never as data.
 * The title names the outcome, the body says how it happens, and there is
 * one action (the same control the populated screen shows) plus, where the
 * app has a sample, one quiet link to it. The guidance is Nielsen Norman
 * Group's on empty states: use the space to teach the layout the user is
 * about to fill, and give them the one thing to do next.
 *
 * `preview` — 'rows' (default) draws the ghost list; null draws none (for a
 * filter with no matches, where the layout is already on screen).
 */
import * as V3 from '../../styles/tokens'

const GHOST = 'color-mix(in srgb, var(--text) 9%, transparent)'
const GHOST_HAIR = 'color-mix(in srgb, var(--text) 7%, transparent)'

function GhostRows({ rows = 3 }) {
  const widths = [58, 44, 52]
  const bar = (w, h, extra) => <span style={{ display: 'block', width: w, height: h, borderRadius: h / 2, background: GHOST, ...extra }} />
  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%', maxWidth: 420, margin: '0 auto 26px',
        // Fade the ghost toward its foot so it reads as a preview of the
        // list, not as three real rows.
        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)',
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)',
      }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 4px', borderTop: i === 0 ? 'none' : `1px solid ${GHOST_HAIR}` }}>
          {bar(8, 8, { flexShrink: 0 })}
          <div style={{ flex: 1, minWidth: 0 }}>
            {bar(`${widths[i % widths.length]}%`, 12)}
            {bar(`${widths[i % widths.length] - 22}%`, 8, { marginTop: 8 })}
          </div>
          {bar(56, 18, { flexShrink: 0 })}
        </div>
      ))}
    </div>
  )
}

export default function EmptyState({ title, body, action, secondary, preview = 'rows', minHeight, style }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '28px 20px 32px', minHeight,
        ...style,
      }}>
      {preview === 'rows' && <GhostRows />}
      <div style={{ ...V3.T.h2, fontSize: 17, lineHeight: '24px' }}>{title}</div>
      {body && <div style={{ ...V3.T.bodyDim, fontSize: 14.5, lineHeight: '21px', maxWidth: 340, marginTop: 6 }}>{body}</div>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          style={{ marginTop: 14, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', ...V3.T.caption, fontSize: 13, fontWeight: 500, color: V3.TEXT_SECONDARY, WebkitTapHighlightColor: 'transparent' }}>
          {secondary.label} <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}
