/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsList — shared list primitives used by SettingsScreen and
 * AccountScreen, so the two screens render identical rows and groups.
 *
 *   <Group title="…" right={…}>
 *     <Row first label="…" sub="…" value="…" action={fn} tone="danger" />
 *   </Group>
 *   <ExceptionPill tone="warn|danger" text="…" />
 *
 * Restraint pass (2026-09): a group is a heading and its rows on the
 * page — no card container. Rows part with a hairline; hierarchy is the
 * label's weight against the sub-line's colour. Tokens are CSS-variable
 * references (index.html :root / [data-theme]), so the rows re-theme via
 * the cascade with no JS recolor.
 */
import * as V3 from '../../styles/tokens'

const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`

// A section: heading (with an optional right-hand exception) and rows.
export const Group = ({ title, right, children }) => (
  <div style={{ marginTop: 28 }}>
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6, borderBottom: HAIRLINE }}>
        {title && <div style={V3.T.micro}>{title}</div>}
        {right}
      </div>
    )}
    <div>{children}</div>
  </div>
)

// Plain list row. `value` right-aligned (mono for technical values).
// `tone='danger'` paints the label red. `first` drops the top hairline
// (the group heading's rule already parts it from the heading).
export const Row = ({ label, sub, value, action, tone, first }) => (
  <button
    onClick={action}
    disabled={!action}
    style={{
      width: '100%', padding: '13px 0', background: 'transparent', border: 'none',
      borderTop: first ? 'none' : HAIRLINE,
      cursor: action ? 'pointer' : 'default', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', minHeight: 48,
      WebkitTapHighlightColor: 'transparent',
    }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...V3.T.bodyStrong, fontSize: 15, color: tone === 'danger' ? DANGER : TEXT }}>{label}</div>
      {sub && <div style={{ ...V3.T.caption, fontWeight: 400, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
    {value && <span style={{ fontSize: 12, color: SUB, fontFamily: 'var(--font-mono)', marginRight: action ? 6 : 0, flexShrink: 0 }}>{value}</span>}
    {action && <span style={{ color: V3.TEXT_TERTIARY, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>}
  </button>
)

// Exception: a word in its status colour, only when state is NOT fine.
export const ExceptionPill = ({ tone = 'warn', text }) => (
  <span style={{ ...V3.T.caption, color: tone === 'warn' ? WARN : DANGER }}>{text}</span>
)
