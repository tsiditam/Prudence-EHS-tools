/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SettingsList — shared inset-grouped list primitives (Apple HIG style)
 * used by both SettingsScreen and AccountScreen. Extracted so the two
 * screens render identical rows/groups without duplicating the markup.
 *
 *   <Group title="…" right={…}>
 *     <Row first label="…" sub="…" value="…" action={fn} tone="danger" />
 *   </Group>
 *   <ExceptionPill tone="warn|danger" text="…" />
 *
 * Tokens are CSS-variable references (index.html :root / [data-theme]),
 * so the rows re-theme via the cascade with no JS recolor.
 */
import * as V3 from '../../styles/tokens'
import { mix } from '../../utils/theme'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'

// Inset-grouped section. No per-row card chrome; the group container
// owns the border + radius, rows divide with hairlines.
export const Group = ({ title, right, children }) => (
  <div style={{ marginTop: 24 }}>
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 4px 10px' }}>
        {title && <div style={V3.T.micro}>{title}</div>}
        {right}
      </div>
    )}
    <div style={{ background: CARD, border: `1px solid ${V3.BORDER_DEFAULT}`, borderRadius: V3.R.lg, overflow: 'hidden' }}>
      {children}
    </div>
  </div>
)

// Plain list row. `value` right-aligned (mono for technical values).
// `tone='danger'` paints the label red. `first` drops the top hairline.
export const Row = ({ label, sub, value, action, tone, first }) => (
  <button
    onClick={action}
    disabled={!action}
    style={{
      width: '100%', padding: '14px 16px', background: 'transparent', border: 'none',
      borderTop: first ? 'none' : `1px solid ${BORDER}`,
      cursor: action ? 'pointer' : 'default', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', minHeight: 52,
    }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: tone === 'danger' ? DANGER : TEXT }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: DIM, marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
    {value && <span style={{ fontSize: 12, color: SUB, fontFamily: 'var(--font-mono)', marginRight: action ? 6 : 0, flexShrink: 0 }}>{value}</span>}
    {action && <span style={{ color: DIM, fontSize: 13, flexShrink: 0 }}>›</span>}
  </button>
)

// Subtle exception pill. Used only when state is NOT fine.
export const ExceptionPill = ({ tone = 'warn', text }) => (
  <span style={{
    fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
    color: tone === 'warn' ? WARN : DANGER,
    padding: '3px 8px', borderRadius: 6,
    background: tone === 'warn' ? mix('warn', 6) : mix('danger', 6),
    border: `1px solid ${tone === 'warn' ? mix('warn', 14) : mix('danger', 14)}`,
  }}>{text}</span>
)
