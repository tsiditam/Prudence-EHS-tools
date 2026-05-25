/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * RoleBadge — tiny uppercase outlined tag identifying a dataset's role
 * (indoor / outdoor / zone) by tone. Plain V3 token surface, not soft-glass.
 */
const BORDER = 'var(--border)', SUB = 'var(--sub)'

export const ROLE_TONE = { indoor: 'var(--accent)', outdoor: '#EA7A2B', zone: '#7C3AED' }

export default function RoleBadge({ role, children }) {
  const tone = ROLE_TONE[role] || SUB
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: tone, border: `1px solid ${ROLE_TONE[role] || BORDER}`, borderRadius: 6, padding: '2px 6px', flexShrink: 0, background: 'transparent', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
