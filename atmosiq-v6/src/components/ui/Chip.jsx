/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Chip — small rounded pill label. Three shapes, one component:
 *   - static label   → no `onClick` (renders a <span>)
 *   - action chip    → `onClick`, no `selected` (e.g. "+ Business hours")
 *   - toggle chip     → `onClick` + `selected` (accent treatment, aria-pressed,
 *                       optional leading ✓ via `checkmark`)
 * Plain V3 token surface, not soft-glass.
 */
import * as V3 from '../../styles/tokens'

const BORDER = 'var(--border)', SUB = 'var(--sub)', ACCENT = 'var(--accent)'
const BASE = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: V3.R.pill, background: 'var(--surface)' }

export default function Chip({ selected, onClick, checkmark = false, title, children, style, ...rest }) {
  if (!onClick) {
    return <span style={{ ...BASE, color: SUB, border: `1px solid ${BORDER}`, ...style }} {...rest}>{children}</span>
  }
  const on = selected === true
  return (
    <button type="button" onClick={onClick} title={title}
      aria-pressed={selected === undefined ? undefined : on}
      style={{ ...BASE, cursor: 'pointer', color: on ? ACCENT : SUB, border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)', ...style }}
      {...rest}>
      {on && checkmark ? '✓ ' : ''}{children}
    </button>
  )
}
