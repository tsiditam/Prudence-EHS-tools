/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 */

// Color keys reference the CSS variables declared in index.html so
// the palette swaps when the theme toggle flips. Glass / shadow /
// hover values stay as-is — they're desktop-only polish (unreachable
// in the mobile-PWA path) and don't trivially translate to light.
export const CSS = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  card: 'var(--card)',
  border: 'var(--border)',
  accent: 'var(--accent)',
  accentDim: 'color-mix(in srgb, var(--accent) 13%, transparent)',
  text: 'var(--text)',
  sub: 'var(--sub)',
  muted: 'var(--dim)',
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  success: 'var(--success)',
  cardGlass: 'rgba(12, 16, 23, 0.7)',
  cardGlassBorder: 'rgba(34, 211, 238, 0.08)',
  surfaceHover: '#0F1520',
  glowAccent: '0 0 20px rgba(34,211,238,0.15)',
  shadow1: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
  shadow2: '0 4px 14px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)',
  shadow3: '0 10px 30px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.25)',
}

export const SP = { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 }

// ── Font families ──
//
// v2.8 UI pass — single Inter-anchored Notion-style stack across the
// app. The body element sets this in index.html so most components
// just inherit; these tokens are kept for the few call sites that
// composed style objects from FONT_DESKTOP / FONT_MOBILE / mono before
// the inline-style rewrite. Both desktop and mobile now use the same
// stack (the previous Outfit/Inter split was producing two different
// looks on phone vs. browser-window since Outfit was never loaded).
export const FONT_SYSTEM = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI Variable','Segoe UI',system-ui,ui-sans-serif,'Helvetica Neue',Arial,sans-serif"
// System monospace stack — SF Mono on Apple, Cascadia Code on Windows,
// Roboto Mono on Android. Drops the DM Mono web-font load and lets
// each platform render in its native mono so technical values feel
// at home (the way Notion's inline code does).
export const FONT_MONO   = "ui-monospace,'SF Mono',Menlo,Monaco,'Cascadia Code','Roboto Mono',Consolas,monospace"

export const mono = { fontFamily: FONT_MONO }
export const FONT_DESKTOP = FONT_SYSTEM
export const FONT_MOBILE = FONT_SYSTEM

// ── v3 design system additions ─────────────────────────────────────
// Token surface for the premium dark-mode redesign. Additive — does
// not displace the legacy helpers above, which remain in use by
// pre-v3 screens.

// Surface ladder. The page background sits on BG; container panels
// sit on SURFACE; cards sit on CARD; hovered/pressed/selected items
// lift to RAISED. Three steps of contrast at ≤6% lightness apart so
// hierarchy reads without needing borders to carry the weight.
export const BG_BASE = 'var(--bg)'
export const SURFACE = 'var(--surface)'
export const CARD = 'var(--card)'
export const RAISED = '#161922'

// Border ladder. Neutral, not cyan-tinted — cyan is reserved for
// semantic emphasis (active states, key links). Subtle is for
// dividers within a panel; default is for panel edges; strong is
// for top-of-card emphasis or selected tab underline tracks.
export const BORDER_SUBTLE  = 'rgba(255,255,255,0.04)'
export const BORDER_DEFAULT = 'rgba(255,255,255,0.07)'
export const BORDER_STRONG  = 'rgba(255,255,255,0.12)'
export const BORDER_ACCENT  = 'rgba(34,211,238,0.35)'

// Text ladder. Primary for body and titles; secondary for supporting
// labels; tertiary for metadata; muted for legal-fine-print and
// the "not the focus" tone used in field cards.
export const TEXT_PRIMARY   = 'var(--text)'
export const TEXT_SECONDARY = '#A8B0BD'
export const TEXT_TERTIARY  = 'var(--sub)'
export const TEXT_MUTED     = 'var(--dim)'

// Severity (engine-side, scoring-derived). Already established in
// MobileApp.jsx as sv(); duplicated here so v3 primitives can use
// the same hexes without circular imports. Do not edit values without
// touching sv() in MobileApp.jsx in lockstep.
export const SEVERITY = {
  critical: '#EF4444',
  high:     '#FB923C',
  medium:   '#FBBF24',
  low:      '#22D3EE',
  pass:     '#22C55E',
  info:     '#94A3B8',
}

// Confidence. Distinct semantic axis from severity — a Critical
// finding can be either High or Low confidence depending on the
// evidence chain behind it. Rendered as a separate pill so the
// reader doesn't conflate the two.
export const CONFIDENCE = {
  high:   '#22C55E',
  medium: '#FBBF24',
  low:    '#FB923C',
}

// Status (workflow state, not assessment outcome).
export const STATUS = {
  inProgress: '#22D3EE',
  draft:      '#8B93A5',
  ready:      '#22C55E',
  blocked:    '#EF4444',
  archived:   '#6B7380',
}

// Type scale. Named entries return style objects so call sites read
// like `<div style={T.h2}>...` instead of carrying inline fontSize/
// fontWeight tuples. Letter-spacing follows the optical hierarchy:
// display tightens, micro opens up. v3.1 refinement: h1 bumped 24→28
// so facility headers carry the same weight as the reference target;
// hSub added for the address line that sits under h1.
export const T = {
  display:    { fontSize: 32, lineHeight: '40px', fontWeight: 700, letterSpacing: '-0.5px', color: TEXT_PRIMARY },
  h1:         { fontSize: 28, lineHeight: '34px', fontWeight: 700, letterSpacing: '-0.6px', color: TEXT_PRIMARY },
  h1Sub:      { fontSize: 13, lineHeight: '18px', fontWeight: 400, color: TEXT_SECONDARY },
  h2:         { fontSize: 18, lineHeight: '26px', fontWeight: 600, letterSpacing: '-0.2px', color: TEXT_PRIMARY },
  h3:         { fontSize: 15, lineHeight: '22px', fontWeight: 600, color: TEXT_PRIMARY },
  body:       { fontSize: 14, lineHeight: '20px', fontWeight: 400, color: TEXT_PRIMARY },
  bodyDim:    { fontSize: 14, lineHeight: '20px', fontWeight: 400, color: TEXT_SECONDARY },
  bodyStrong: { fontSize: 14, lineHeight: '20px', fontWeight: 600, color: TEXT_PRIMARY },
  caption:    { fontSize: 12, lineHeight: '16px', fontWeight: 500, color: TEXT_SECONDARY },
  captionDim: { fontSize: 12, lineHeight: '16px', fontWeight: 500, color: TEXT_TERTIARY },
  micro:      { fontSize: 11, lineHeight: '14px', fontWeight: 600, color: TEXT_TERTIARY, textTransform: 'uppercase', letterSpacing: '0.8px' },
  microAccent:{ fontSize: 11, lineHeight: '14px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.8px' },
}

// Numeric scale. Mono-spaced so columns of measurements align and
// digits don't shift on update — the same convention as a real
// instrument readout. v3.1 adds `display` for the dominant stat
// numerals in the hero (Zone Average / Lowest Zone / Zones Assessed
// in the reference target run ~38–40 px); `lg` stays for the second-
// tier numerals (Key Indicator score), `md` for inline values.
export const N = {
  display: { fontFamily: FONT_MONO, fontSize: 38, lineHeight: '42px', fontWeight: 600, letterSpacing: '-0.6px', color: TEXT_PRIMARY },
  xl:      { fontFamily: FONT_MONO, fontSize: 36, lineHeight: '40px', fontWeight: 600, letterSpacing: '-0.5px', color: TEXT_PRIMARY },
  lg:      { fontFamily: FONT_MONO, fontSize: 24, lineHeight: '28px', fontWeight: 600, color: TEXT_PRIMARY },
  md:      { fontFamily: FONT_MONO, fontSize: 16, lineHeight: '20px', fontWeight: 600, color: TEXT_PRIMARY },
  sm:      { fontFamily: FONT_MONO, fontSize: 12, lineHeight: '16px', fontWeight: 500, color: TEXT_TERTIARY },
}

// Radii.
export const R = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 }

// ── v3 primitives ─────────────────────────────────────────────────

// Panel — the workhorse card. Solid surfaces, neutral borders, no
// glassmorphism. Optional `accent` color paints a 2-px rail at the
// top edge (used for the active-assessment hero card to make the
// severity readable at a glance without recoloring the whole panel).
// Optional `dense` halves the inner padding for inline tables.
export const panel = (opts = {}) => {
  const base = {
    background: CARD,
    border: `1px solid ${BORDER_DEFAULT}`,
    borderRadius: R.lg,
    padding: opts.dense ? '14px 16px' : '20px 22px',
    position: 'relative',
    overflow: 'hidden',
  }
  if (opts.accent) {
    return { ...base, borderTop: `2px solid ${opts.accent}` }
  }
  if (opts.raised) {
    return { ...base, background: RAISED }
  }
  return base
}

// Section header — small uppercase label + optional right slot. Used
// inside panels to introduce groups of fields. Lives in this module
// so its weight/letter-spacing tracks the rest of the scale.
export const sectionLabel = T.micro

// Pill — small, low-saturation status / severity / confidence chip.
// Pass `tone` as hex; we derive a low-alpha background and a 22%-alpha
// border, which renders as a calm "tagged" feel rather than the
// saturated brand pills you'd see on a consumer app.
export const pill = (tone, opts = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: opts.lg ? '6px 12px' : '3px 9px',
  borderRadius: R.sm,
  background: `${tone}14`,
  border: `1px solid ${tone}38`,
  color: tone,
  fontSize: opts.lg ? 12 : 11,
  fontWeight: 700,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
})

// StatBlock — the three-column number row used in the hero card
// (e.g. "23 / ZONE AVERAGE", "19 / LOWEST ZONE", "2 / ZONES
// ASSESSED"). Lays out as flex; consumer composes children.
export const statBlock = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  padding: '12px 0',
}
export const statDivider = {
  width: 1,
  alignSelf: 'stretch',
  background: BORDER_DEFAULT,
  margin: '8px 0',
}

// GaugeBar — the horizontal severity gauge used on the Key Indicator
// card. `value` 0–100, `tone` is the dot color. AtmosFlow's scoring
// convention is lower-is-worse (the composite indicator note reads
// "lower scores indicate greater concern"), so the gradient runs
// red → amber → green from left to right — a score of 19 lands in
// the red zone, a score of 85 lands in the green.
export const gaugeTrack = {
  position: 'relative',
  height: 6,
  borderRadius: R.pill,
  background: 'linear-gradient(90deg, #EF4444 0%, #FBBF24 50%, #22C55E 100%)',
  opacity: 0.85,
}
export const gaugeDot = (value, tone) => ({
  position: 'absolute',
  top: -4,
  left: `calc(${Math.max(0, Math.min(100, value))}% - 7px)`,
  width: 14,
  height: 14,
  borderRadius: R.pill,
  background: BG_BASE,
  border: `2px solid ${tone}`,
  boxShadow: `0 0 0 2px ${BG_BASE}, 0 0 12px ${tone}55`,
})

// IconBox — a square swatch behind an icon, low-alpha. Used in the
// "primary driver / complaint pattern" inline cards on the hero
// detail panel so the icons read as labeled rather than free-floating.
export const iconBox = (tone) => ({
  width: 32,
  height: 32,
  flexShrink: 0,
  borderRadius: R.md,
  background: `${tone}14`,
  border: `1px solid ${tone}25`,
  color: tone,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
})

// Divider — 1-px horizontal line at the default border tone. Default
// 16-px vertical margin; pass `tight` for inline section breaks.
export const divider = (tight = false) => ({
  height: 1,
  background: BORDER_DEFAULT,
  margin: tight ? '10px 0' : '16px 0',
  border: 'none',
})

// Primary button (v3). Solid accent fill, dark foreground, modest
// height for field use. The shadow is intentionally restrained —
// cyan glow only on press / focus, not at rest.
export const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 18px',
  background: 'var(--accent-fill)',
  color: 'var(--on-accent-fill)',
  border: 'none',
  borderRadius: R.md,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '-0.1px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 40,
  transition: 'opacity 0.15s ease, transform 0.15s ease',
}
export const btnSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 18px',
  background: 'transparent',
  color: TEXT_PRIMARY,
  border: `1px solid ${BORDER_STRONG}`,
  borderRadius: R.md,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 40,
  transition: 'background 0.15s ease, border-color 0.15s ease',
}
export const btnGhost = {
  ...btnSecondary,
  border: `1px solid ${BORDER_DEFAULT}`,
  color: TEXT_SECONDARY,
}

// Workflow-tab row — horizontal scroller of workflow stages. Each
// tab is an inline-flex item with an icon stack. Active tab gets a
// 2-px cyan underline (BORDER_ACCENT), inactive tabs are TEXT_MUTED.
// Consumer renders the tabs; this exports the row + item base styles.
export const tabRow = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  padding: '6px 6px 0',
  background: CARD,
  border: `1px solid ${BORDER_DEFAULT}`,
  borderRadius: R.lg,
  overflowX: 'auto',
  scrollbarWidth: 'none',
}
export const tabItem = (active) => ({
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '10px 14px 12px',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? `2px solid var(--accent)` : '2px solid transparent',
  color: active ? 'var(--accent)' : TEXT_TERTIARY,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  transition: 'color 0.15s ease, border-color 0.15s ease',
})

// ── Legacy helpers (v2.x and earlier — retained for unmigrated screens) ──

export const btn = (primary, dk) => dk ? ({
  padding: '14px 32px',
  background: primary ? CSS.accent : 'transparent',
  color: primary ? 'var(--on-accent)' : CSS.text,
  border: primary ? 'none' : `1px solid ${CSS.border}`,
  borderRadius: 14,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all .2s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: primary ? CSS.glowAccent : 'none',
}) : ({
  padding: '14px 28px',
  background: primary ? CSS.accent : 'transparent',
  color: primary ? 'var(--on-accent)' : CSS.text,
  border: primary ? 'none' : `1px solid ${CSS.border}`,
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all .2s',
})

export const cardStyle = (dk) => dk ? ({
  background: CSS.cardGlass,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${CSS.cardGlassBorder}`,
  borderRadius: 16,
  padding: 24,
  marginBottom: 20,
  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
  boxShadow: CSS.shadow1,
}) : ({
  background: CSS.card,
  border: `1px solid ${CSS.border}`,
  borderRadius: 14,
  padding: 20,
  marginBottom: 16,
})

export const cardHoverHandlers = (dk) => dk ? {
  onMouseEnter: (e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = CSS.shadow2; e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)' },
  onMouseLeave: (e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = CSS.shadow1; e.currentTarget.style.borderColor = CSS.cardGlassBorder },
} : {}

export const inputStyle = {
  width: '100%', padding: '12px 14px', background: CSS.bg,
  border: `1px solid ${CSS.border}`, borderRadius: 8, color: CSS.text,
  fontSize: 15, outline: 'none', boxSizing: 'border-box',
}

export const inputFocusHandlers = {}

export const btnPressHandlers = {}

export const sevBadge = (sev) => {
  const colors = { critical: '#EF4444', high: '#FB923C', medium: '#FBBF24', low: '#22D3EE', pass: '#22C55E', info: '#8B5CF6' }
  return { padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: (colors[sev] || '#5E6578') + '20', color: colors[sev] || '#5E6578' }
}

export const sectionHeaderStyle = (dk) => ({
  fontSize: dk ? 14 : 13, fontWeight: 600, color: CSS.accent,
  marginBottom: 8, marginTop: dk ? 24 : 16,
  textTransform: 'uppercase', letterSpacing: 1,
  borderLeft: dk ? `3px solid ${CSS.accent}` : 'none',
  paddingLeft: dk ? 12 : 0,
})
