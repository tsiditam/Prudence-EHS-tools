/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Select — compact V3-surface <select> (native control, themed chrome).
 * Pass <option> children and any native props (value, onChange, aria-label).
 * Plain V3 token surface, not soft-glass.
 */
const BORDER = 'var(--border)', TEXT = 'var(--text)'

export const selectStyle = { padding: '6px 8px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: 'inherit', appearance: 'auto' }

export default function Select({ style, children, ...rest }) {
  return <select style={{ ...selectStyle, ...style }} {...rest}>{children}</select>
}
