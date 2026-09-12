/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsList — shared list primitives used by SettingsScreen and
 * AccountScreen, so the two screens render identical rows and groups.
 *
 *   <Group title="…" right={…} footer="…">
 *     <Row label="…" sub="…" value="…" action={fn} tone="danger" />
 *   </Group>
 *   <ExceptionPill tone="warn|danger" text="…" />
 *
 * Inset grouped list (2026-09), the way iOS Settings draws it: a small
 * heading above, the rows inside one rounded panel, a hairline between
 * rows that starts where the text starts, and an optional caption under
 * the panel for the one sentence a group needs. A settings screen is the
 * one place a panel earns its keep — it is what a settings screen looks
 * like (prototypicality: Tuch et al. 2012), and the rounded edge is what
 * tells a scanning eye where one group ends and the next begins. Rows
 * carry no border of their own; the group draws the separators, so a
 * custom row (an avatar, a toggle) sits in the panel like any other.
 *
 * Tokens are CSS-variable references (index.html :root / [data-theme]),
 * so the rows re-theme via the cascade with no JS recolor.
 */
import { Children } from 'react'
import * as V3 from '../../styles/tokens'

const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
// The panel's horizontal inset; separators start here so they align with
// the row text, not the panel edge.
export const INSET = 16

// A group: heading (with an optional right-hand exception), the rows in
// one panel, an optional caption beneath.
export const Group = ({ title, right, footer, children }) => {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <div style={{ marginTop: 26 }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: `0 ${INSET}px 8px` }}>
          {title && <div style={V3.T.micro}>{title}</div>}
          {right}
        </div>
      )}
      <div style={{ background: 'var(--group)', borderRadius: 14, overflow: 'hidden' }}>
        {rows.map((child, i) => (
          <div key={child.key ?? i}>
            {i > 0 && <div aria-hidden="true" style={{ height: 1, background: V3.BORDER_SUBTLE, marginLeft: INSET }} />}
            {child}
          </div>
        ))}
      </div>
      {footer && <div style={{ ...V3.T.caption, fontWeight: 400, lineHeight: 1.5, padding: `8px ${INSET}px 0` }}>{footer}</div>}
    </div>
  )
}

// Plain list row. `value` right-aligned in the secondary ink. `tone='danger'`
// paints the label red. `first` is accepted for older call sites and does
// nothing: the group draws the separators.
export const Row = ({ label, sub, value, action, tone }) => (
  <button
    onClick={action}
    disabled={!action}
    style={{
      width: '100%', padding: `12px ${INSET}px`, background: 'transparent', border: 'none',
      cursor: action ? 'pointer' : 'default', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', minHeight: 48,
      WebkitTapHighlightColor: 'transparent',
    }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...V3.T.body, fontSize: 15, color: tone === 'danger' ? DANGER : TEXT }}>{label}</div>
      {sub && <div style={{ ...V3.T.caption, fontWeight: 400, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
    {value && <span style={{ ...V3.T.body, fontSize: 15, color: SUB, flexShrink: 0 }}>{value}</span>}
    {action && <span aria-hidden="true" style={{ color: V3.TEXT_TERTIARY, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>}
  </button>
)

// Exception: a word in its status color, only when state is NOT fine.
export const ExceptionPill = ({ tone = 'warn', text }) => (
  <span style={{ ...V3.T.caption, color: tone === 'warn' ? WARN : DANGER }}>{text}</span>
)
