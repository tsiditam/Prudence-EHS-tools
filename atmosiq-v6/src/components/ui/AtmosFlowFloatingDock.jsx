/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlowFloatingDock — the app's bottom tab bar, rebuilt to match
 * Instagram's bottom navigation exactly:
 *
 *   • A flat, full-bleed bar pinned to the very bottom edge (NOT a floating
 *     capsule). Same solid color as the page (var(--bg)) with a single
 *     hairline separator along its top — Instagram's "the bar is the
 *     background, divided by one line" look.
 *   • Evenly-spread, icon-only destinations. No text labels, no active pill,
 *     no underline, no brand-accent tint, no glass/blur, no magnification.
 *   • Monochrome: inactive icons are muted (var(--sub), lighter stroke); the
 *     active icon is full-contrast (var(--text), heavier stroke). That weight/
 *     contrast shift is the only active cue — exactly Instagram's outline-vs-
 *     filled model, expressed with the app's stroke icon set.
 *   • The account destination renders a circular avatar (via renderIcon) —
 *     Instagram's profile tab; its ring goes solid foreground when active.
 *   • The only motion is a quick press-dim on tap (Instagram's tap feedback),
 *     disabled under reduced-motion.
 *
 *   <AtmosFlowFloatingDock
 *     maxWidth={contentMax}
 *     tabs={[{ id, label, icon, active, onClick, badge, renderIcon? }]}
 *   />
 *
 * The bar is built from CSS vars throughout, so it flips with the light/dark
 * theme automatically (white bar + dark glyphs in light mode, near-black bar +
 * light glyphs in dark mode), matching Instagram in both appearances.
 */
import { I } from '../Icons'

const BAR_H = 50 // Instagram's tab-bar row height (excludes safe-area inset)
const ICON = 25  // glyph size — Instagram tab icons sit around 24–26px

// Injected once: the press-dim tap feedback + focus ring. Kept tiny; the bar
// itself is plain inline styles driven by theme-aware CSS vars.
if (typeof document !== 'undefined' && !document.getElementById('affd-style')) {
  const s = document.createElement('style')
  s.id = 'affd-style'
  s.textContent =
    '.affd-tab{transition:opacity 120ms ease, transform 120ms ease;}' +
    // Quick press-dim, exactly Instagram's tap feedback (no ripple/glow).
    '.affd-tab:active{opacity:0.55;transform:scale(0.90);}' +
    '.affd-tab:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent);border-radius:12px;}' +
    '@media (prefers-reduced-motion: reduce){.affd-tab{transition:none!important;}.affd-tab:active{transform:none;}}'
  document.head.appendChild(s)
}

// One icon-only destination in the bar. The active cue is purely the glyph's
// color + stroke weight (Instagram's outline→filled distinction).
function DockTab({ t }) {
  const on = !!t.active
  return (
    <button
      className="affd-tab"
      role="tab"
      aria-selected={on}
      aria-current={on ? 'page' : undefined}
      aria-label={t.label}
      title={t.label}
      onClick={t.onClick}
      style={{
        flex: 1,
        minWidth: 0,
        height: BAR_H,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {t.renderIcon
          ? t.renderIcon(on)
          : <I n={t.icon} s={ICON} c={on ? 'var(--text)' : 'var(--sub)'} w={on ? 2.4 : 1.9} />}
        {t.badge > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -3, right: -7,
              minWidth: 15, height: 15, borderRadius: 999,
              background: 'var(--danger)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              padding: '0 4px',
              // Punch the badge out of the bar with a bg-colored ring, like
              // Instagram's notification dots.
              border: '1.5px solid var(--bg)',
            }}
          >
            {t.badge}
          </span>
        )}
      </span>
    </button>
  )
}

export default function AtmosFlowFloatingDock({ tabs, aux, maxWidth, ariaLabel = 'Primary' }) {
  // `aux` (an optional extra destination) is folded inline — Instagram keeps
  // every destination in the one bar, never a detached side pill.
  const items = [...(tabs || []), ...(aux ? [aux] : [])]
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        // Flat, full-bleed bar in the page color with a single hairline along
        // its top edge — Instagram's "bar is the background, split by a line".
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        // Keep the icon row off the home indicator on installed PWAs / notched
        // phones by padding the safe area below it.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'center',
          // Full-bleed bar, but the icon row is capped + centered on wide
          // screens so the destinations stay grouped (Instagram on tablet/web).
          width: '100%',
          maxWidth: maxWidth || 460,
          margin: '0 auto',
          padding: '0 8px',
        }}
      >
        {items.map((t) => <DockTab key={t.id} t={t} />)}
      </div>
    </nav>
  )
}
