/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 */

export const CSS = {
  bg: '#080A0E',
  card: '#0C1017',
  border: '#1A2030',
  accent: '#22D3EE',
  accentDim: '#22D3EE20',
  text: '#F0F4F8',
  muted: '#5E6578',
  danger: '#EF4444',
  warn: '#FBBF24',
  success: '#22C55E',
  cardGlass: 'rgba(12, 16, 23, 0.7)',
  cardGlassBorder: 'rgba(34, 211, 238, 0.08)',
  surfaceHover: '#0F1520',
  glowAccent: '0 0 20px rgba(34,211,238,0.15)',
  shadow1: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
  shadow2: '0 4px 14px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)',
  shadow3: '0 10px 30px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.25)',
}

export const SP = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

export const mono = { fontFamily: 'DM Mono, monospace' }

export const btn = (primary, dk) => ({
  padding: dk ? '14px 32px' : '14px 28px',
  background: primary ? CSS.accent : 'transparent',
  color: primary ? '#080A0E' : CSS.text,
  border: primary ? 'none' : `1px solid ${CSS.border}`,
  borderRadius: dk ? 14 : 12,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all .2s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: primary && dk ? CSS.glowAccent : 'none',
})

export const cardStyle = (dk) => ({
  background: dk ? CSS.cardGlass : CSS.card,
  backdropFilter: dk ? 'blur(16px)' : 'none',
  WebkitBackdropFilter: dk ? 'blur(16px)' : 'none',
  border: `1px solid ${dk ? CSS.cardGlassBorder : CSS.border}`,
  borderRadius: dk ? 16 : 14,
  padding: dk ? 24 : 20,
  marginBottom: dk ? 20 : 16,
  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: dk ? CSS.shadow1 : 'none',
})

export const cardHoverHandlers = (dk) => dk ? {
  onMouseEnter: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = CSS.shadow2; e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)' },
  onMouseLeave: (e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = CSS.shadow1; e.currentTarget.style.borderColor = CSS.cardGlassBorder },
} : {}

export const inputStyle = {
  width: '100%', padding: '12px 14px', background: CSS.bg,
  border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text,
  fontSize: 15, outline: 'none', boxSizing: 'border-box',
  transition: 'all 0.2s ease',
}

export const inputFocusHandlers = {
  onFocus: (e) => { e.target.style.borderColor = CSS.accent; e.target.style.boxShadow = CSS.glowAccent },
  onBlur: (e) => { e.target.style.borderColor = CSS.border; e.target.style.boxShadow = 'none' },
}

export const btnPressHandlers = {
  onMouseDown: (e) => { e.currentTarget.style.transform = 'scale(0.97)' },
  onMouseUp: (e) => { e.currentTarget.style.transform = 'scale(1)' },
}

export const sevBadge = (sev) => {
  const colors = { critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#22D3EE', pass: '#22C55E', info: '#8B5CF6' }
  return { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (colors[sev] || '#5E6578') + '20', color: colors[sev] || '#5E6578', ...mono }
}

export const sectionHeaderStyle = (dk) => ({
  fontSize: dk ? 14 : 13, fontWeight: 600, color: CSS.accent,
  marginBottom: 8, marginTop: dk ? 24 : 16,
  textTransform: 'uppercase', letterSpacing: 1,
  borderLeft: dk ? `3px solid ${CSS.accent}` : 'none',
  paddingLeft: dk ? 12 : 0,
})
