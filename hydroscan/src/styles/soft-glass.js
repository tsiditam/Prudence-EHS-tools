/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Soft-glass design system — token surface for the v3.3 mobile pass.
 *
 * Sits alongside src/styles/tokens.js (the established V3 namespace).
 * Does not replace it; the existing panel(), pill(), tabRow, btnPrimary
 * helpers stay in place. This module adds the "tactile soft-glass card"
 * surface for the new mobile-first treatment:
 *
 *   - Layered cards: low-opacity surface + subtle backdrop blur + a
 *     1px top-edge highlight (the "glass meniscus") + an outer drop
 *     shadow that grounds the card on the page
 *   - Spring easings: cubic-bezier ease-out that overshoots slightly,
 *     so cards and sheets settle into place instead of snapping
 *   - Calm spacing: a vertical rhythm (12/16/20/28) tuned for a one-
 *     handed phone read
 *   - Tap feedback: a scale-down active state that gives the screen
 *     a physical "press" feel without depending on hover (which is a
 *     desktop construct that doesn't translate to PWAs)
 *   - Floating action shadow: heavier-than-card shadow for the bottom-
 *     pinned action bar, so it lifts visually off the content scroll
 *
 * The product positioning is a field co-pilot for industrial
 * hygienists, not a compliance form. The visual language follows:
 * confident hierarchy, restrained color (cyan stays brand, severity
 * stays semantic), and physical feedback so the tool feels reliable
 * the way a calibrated instrument feels reliable.
 */

import { BORDER_DEFAULT, BORDER_SUBTLE, CARD, R, SURFACE, TEXT_PRIMARY } from './tokens'

// ── Glass surface ────────────────────────────────────────────────────
// Three tiers of glass: subtle (in-content), standard (cards), elevated
// (floating sheets + bottom action bars). Each composes a low-opacity
// background, a tasteful blur, a thin top-edge highlight, and a drop
// shadow that increases with elevation. The blur stays modest (8/14/22
// px) so legibility doesn't degrade in low-light field conditions.

export const GLASS = {
  // In-content glass — used for inline pills, micro-cards, banners
  // inside a parent card. Lightest blur, lightest shadow.
  // v3.3.1: opacity bumped 78→88% so chips read clearly against any
  // background; the prior value washed out over photo thumbnails and
  // photo-backed body panels.
  subtle: {
    background: 'color-mix(in srgb, var(--card) 88%, transparent)',
    backdropFilter: 'blur(8px) saturate(140%)',
    WebkitBackdropFilter: 'blur(8px) saturate(140%)',
    border: `1px solid ${BORDER_SUBTLE}`,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.04), ' +
      '0 1px 2px rgba(0,0,0,0.18)',
  },
  // Standard glass — the workhorse soft-glass card. Used for the
  // result hero, next-steps panel, recommendation groups. Has the
  // meniscus highlight + a layered outer shadow.
  // v3.3.1: opacity bumped 82→93% — the previous level read as a
  // ghosted overlay rather than a confident card surface, and the
  // page text behind it bled through enough to hurt legibility.
  card: {
    background: 'color-mix(in srgb, var(--card) 93%, transparent)',
    backdropFilter: 'blur(14px) saturate(150%)',
    WebkitBackdropFilter: 'blur(14px) saturate(150%)',
    border: `1px solid ${BORDER_DEFAULT}`,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.05), ' +
      '0 1px 2px rgba(0,0,0,0.22), ' +
      '0 8px 24px rgba(0,0,0,0.32)',
  },
  // Elevated glass — floating bottom sheets, modal panels, the docx
  // picker. Heavier blur, heavier shadow so it sits visually above
  // the page content.
  // v3.3.1: opacity bumped 88→96% — modals over a busy page (assessment
  // form / dash content) were transmitting too much background colour
  // and reading as hazy. 96% still picks up enough through-color to
  // feel like a layer, not a flat block.
  elevated: {
    background: 'color-mix(in srgb, var(--card) 96%, transparent)',
    backdropFilter: 'blur(22px) saturate(160%)',
    WebkitBackdropFilter: 'blur(22px) saturate(160%)',
    border: `1px solid ${BORDER_DEFAULT}`,
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.06), ' +
      '0 2px 6px rgba(0,0,0,0.25), ' +
      '0 24px 48px rgba(0,0,0,0.45)',
  },
}

// ── Spring easings ───────────────────────────────────────────────────
// Material's standard ease curves snap. These overshoot just enough to
// feel like the UI has a little physical mass. `gentle` for taps and
// 1-property transitions; `bounce` for sheet enter; `settle` for sheet
// exit (no overshoot on the way out — feels weird).

export const SPRING = {
  gentle: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  bounce: 'cubic-bezier(0.16, 1.2, 0.3, 1)',
  settle: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // Duration aliases keep transitions consistent across primitives.
  durFast: '140ms',
  durMed:  '220ms',
  durSlow: '320ms',
}

// ── Radii ────────────────────────────────────────────────────────────
// Extension of the V3 radii scale for the larger, softer surfaces this
// system introduces. V3 tops out at xl=18; soft-glass adds card=20 and
// sheet=24 for the larger touch targets and bottom-sheet corners.

export const RADII = {
  ...R,
  card:  20,
  sheet: 24,
}

// ── Spacing rhythm ───────────────────────────────────────────────────
// A consistent vertical rhythm so a stack of cards on a phone reads as
// a single composition instead of disconnected boxes. 12/16/20/28 maps
// to the touch-friendly density most field-tool apps land on.

export const RHYTHM = {
  tight:    12,
  base:     16,
  loose:    20,
  section:  28,
}

// ── Floating action bar shadow ───────────────────────────────────────
// The bottom-pinned action bar (Word, Share, etc.) needs a heavier
// shadow than a card so it lifts off the page when the content scrolls
// behind it. The upward-pointing shadow gives it the "floating above
// the page" cue.

export const FLOATING_BAR_SHADOW =
  '0 -10px 32px rgba(0,0,0,0.45), ' +
  '0 -2px 6px rgba(0,0,0,0.22), ' +
  'inset 0 1px 0 rgba(255,255,255,0.05)'

// ── Tap feedback ─────────────────────────────────────────────────────
// Returned as inline-style props so consumers can spread them onto
// buttons. The scale-down active state replaces hover (PWA-native).
// `WebkitTapHighlightColor: transparent` kills the iOS gray flash on
// tap so the scale animation reads cleanly.

export const tapTransition = `transform ${SPRING.durFast} ${SPRING.gentle}, opacity ${SPRING.durFast} ${SPRING.gentle}, background ${SPRING.durMed} ${SPRING.settle}, border-color ${SPRING.durMed} ${SPRING.settle}, box-shadow ${SPRING.durMed} ${SPRING.settle}`

export const tapResetStyle = {
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
}

// ── Helpers ──────────────────────────────────────────────────────────
// A soft-glass card style object — composable with V3.panel().padding.
// Pass `accent: hex` to paint a 2-px rail at the top edge (used on the
// result-hero card to encode severity at-a-glance).

export const softCard = (opts = {}) => {
  const base = {
    ...GLASS.card,
    borderRadius: RADII.card,
    padding: opts.dense ? '14px 16px' : '20px 22px',
    color: TEXT_PRIMARY,
    position: 'relative',
    overflow: 'hidden',
  }
  if (opts.accent) {
    return {
      ...base,
      borderTop: `2px solid ${opts.accent}`,
    }
  }
  return base
}

// Inline status pill for soft-glass surfaces. Same color contract as
// V3.pill but uses the glass-subtle background so it reads as a chip
// inside a card rather than a flat solid block.
// `dim` softens the neon glow for low-stakes contexts (e.g. the Home
// dashboard) without changing the hue: the fill + border alphas drop,
// the text is mixed ~28% toward the muted text color so it reads as the
// tone but stops glowing, and the inner highlight is removed.
export const softPill = (tone, opts = {}) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: opts.lg ? '6px 12px' : '4px 10px',
  borderRadius: RADII.pill,
  background: opts.dim ? `${tone}14` : `${tone}1F`,
  border: `1px solid ${opts.dim ? `${tone}33` : `${tone}55`}`,
  color: opts.dim ? `color-mix(in srgb, ${tone} 72%, var(--sub))` : tone,
  fontSize: opts.lg ? 12 : 11,
  fontWeight: 700,
  letterSpacing: '0.35px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  boxShadow: opts.dim ? 'none' : `inset 0 1px 0 ${tone}28`,
})

// Stack of cards — wraps a column of soft-glass cards in a consistent
// rhythm. Consumers do:
//   <div style={stack('base')}>
//     <GlassCard>...</GlassCard>
//     <GlassCard>...</GlassCard>
//   </div>
export const stack = (size = 'base') => ({
  display: 'flex',
  flexDirection: 'column',
  gap: RHYTHM[size] || RHYTHM.base,
})

// Quick alias for the inline floating-action-bar container.
export const floatingActionBar = {
  ...GLASS.elevated,
  position: 'sticky',
  bottom: 0,
  padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  gap: 10,
  borderTopLeftRadius: RADII.sheet,
  borderTopRightRadius: RADII.sheet,
  borderBottom: 'none',
  background: `color-mix(in srgb, ${SURFACE} 92%, transparent)`,
  boxShadow: FLOATING_BAR_SHADOW,
  zIndex: 10,
}
