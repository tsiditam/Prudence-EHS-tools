/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlowFloatingDock — the app's bottom navigation, built to match the
 * Instagram (iOS-26 "Liquid Glass") floating tab bar:
 *
 *   • A floating, rounded, frosted-glass CAPSULE that hovers just above the
 *     bottom edge with side margins — NOT a flat edge-to-edge bar. Heavy blur
 *     + translucent tint so the content behind it reads through; a hairline
 *     edge and a soft lifted shadow.
 *   • Icon-only destinations spread evenly. No text labels.
 *   • The active destination sits inside a soft, neutral rounded-rect
 *     highlight (a lighter frosted tile on the glass) — the only active cue.
 *     Monochrome throughout: active glyph full-contrast (var(--text)),
 *     inactive muted (var(--sub)). No brand-accent tint, no underline.
 *   • The account destination renders a circular avatar (Instagram's profile
 *     tab); the highlight tile behind it marks it active.
 *   • The only motion is a quick press-scale on tap, disabled under
 *     reduced-motion. No magnification / glide.
 *
 *   <AtmosFlowFloatingDock
 *     maxWidth={contentMax}
 *     tabs={[{ id, label, icon, active, onClick, badge, renderIcon? }]}
 *   />
 *
 * The capsule is dark frosted glass in DARK mode and flips to a white frosted
 * capsule in LIGHT mode (via the [data-theme="light"] overrides injected
 * below). Glyphs use theme CSS vars so they read in both appearances.
 */
import { I } from '../Icons'

const ICON = 25   // glyph size — Instagram tab icons sit around 24–26px
const TILE_H = 44 // active highlight tile / tap-target height

// Injected once: the light-mode capsule + highlight flip, the press-scale tap
// feedback, and a focus ring. The dark-mode look lives in the inline styles.
if (typeof document !== 'undefined' && !document.getElementById('affd-style')) {
  const s = document.createElement('style')
  s.id = 'affd-style'
  s.textContent =
    '.affd-tab{transition:transform 130ms cubic-bezier(0.22,1,0.36,1), background 200ms ease;}' +
    '.affd-tab:active{transform:scale(0.92);}' +
    '.affd-tab:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)!important;}' +
    '@media (prefers-reduced-motion: reduce){.affd-tab{transition:none!important;}.affd-tab:active{transform:none;}}' +
    // Light mode: flip the dark frosted capsule to a white frosted one, and
    // the active tile to a bright frosted tile with a soft shadow. !important
    // beats the inline dark-mode styles.
    '[data-theme="light"] .affd-dock{background:rgba(255,255,255,0.62)!important;border-color:rgba(15,23,42,0.07)!important;box-shadow:0 1px 0 rgba(255,255,255,0.6) inset,0 10px 30px rgba(15,23,42,0.20),0 2px 8px rgba(15,23,42,0.10)!important;}' +
    '[data-theme="light"] .affd-tab-on{background:rgba(255,255,255,0.92)!important;box-shadow:0 1px 3px rgba(15,23,42,0.14),inset 0 0 0 1px rgba(15,23,42,0.04)!important;}'
  document.head.appendChild(s)
}

// One icon-only destination. The active cue is the soft highlight tile behind
// the glyph plus a full-contrast, slightly heavier glyph.
function DockTab({ t }) {
  const on = !!t.active
  return (
    <button
      className={on ? 'affd-tab affd-tab-on' : 'affd-tab'}
      role="tab"
      aria-selected={on}
      aria-current={on ? 'page' : undefined}
      aria-label={t.label}
      title={t.label}
      onClick={t.onClick}
      style={{
        flex: 1,
        minWidth: 0,
        height: TILE_H,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
        // Active highlight tile: a lighter frosted rounded-rect on the glass
        // (dark-mode value here; light-mode override above). Inactive is clear.
        background: on
          ? 'rgba(255,255,255,0.14)'
          : 'transparent',
        boxShadow: on
          ? 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.18)'
          : 'none',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {t.renderIcon
          ? t.renderIcon(on)
          : <I n={t.icon} s={ICON} c={on ? 'var(--text)' : 'var(--sub)'} w={on ? 2.2 : 1.85} />}
        {t.badge > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -4, right: -8,
              minWidth: 16, height: 16, borderRadius: 999,
              background: 'var(--danger)', color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
              padding: '0 4px',
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
  // `aux` (an optional extra destination) is folded inline — the Instagram bar
  // keeps every destination in the one capsule, never a detached side pill.
  const items = [...(tabs || []), ...(aux ? [aux] : [])]
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Float just above the bottom edge, clearing the home indicator on
        // installed PWAs / notched phones.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: 'none', // wrapper is transparent; the capsule re-enables
      }}
    >
      <div
        className="affd-dock"
        role="tablist"
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          maxWidth: maxWidth || 460,
          padding: 6,
          // Floating frosted-glass capsule (dark-mode value here; the
          // light-mode flip is in the injected stylesheet above).
          borderRadius: 999,
          background: 'rgba(30,30,34,0.52)',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow:
            '0 10px 34px rgba(0,0,0,0.40), ' +
            'inset 0 1px 0 rgba(255,255,255,0.16)',
        }}
      >
        {items.map((t) => <DockTab key={t.id} t={t} />)}
      </div>
    </nav>
  )
}
