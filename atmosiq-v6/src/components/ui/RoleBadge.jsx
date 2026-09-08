/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * RoleBadge — tiny uppercase outlined tag identifying a dataset's role
 * (indoor / outdoor / zone) by tone. Plain V3 token surface, not soft-glass.
 */
const BORDER = 'var(--border)', SUB = 'var(--sub)'

// Outdoor / zone tones follow the validated chart series steps (temp orange,
// PM2.5 violet) so a dataset tag and the trace it belongs to agree.
export const ROLE_TONE = { indoor: 'var(--accent)', outdoor: '#d95926', zone: '#9085e9' }

export default function RoleBadge({ role, children }) {
  const tone = ROLE_TONE[role] || SUB
  return (
    // Pill, like every other tag in the app (pill pass, 2026-09); a
    // low-alpha tint instead of a bare outline so it sits with StatusPill.
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: tone, border: `1px solid color-mix(in srgb, ${ROLE_TONE[role] || BORDER} 45%, transparent)`, borderRadius: 999, padding: '3px 8px', flexShrink: 0, background: `color-mix(in srgb, ${ROLE_TONE[role] || SUB} 10%, transparent)`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
