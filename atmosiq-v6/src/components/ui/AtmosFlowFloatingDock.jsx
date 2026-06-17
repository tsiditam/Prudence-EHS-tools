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
import { useEffect, useLayoutEffect, useRef } from 'react'
import { I } from '../Icons'

const ICON = 25   // glyph size — Instagram tab icons sit around 24–26px
const TILE_H = 44 // active highlight tile / tap-target height

// Injected once: the light-mode capsule + highlight flip, the press-scale tap
// feedback, and a focus ring. The dark-mode look lives in the inline styles.
if (typeof document !== 'undefined' && !document.getElementById('affd-style')) {
  const s = document.createElement('style')
  s.id = 'affd-style'
  s.textContent =
    // Dark mode: the selected glyph is bright cyan (--accent-fill). Exposed as
    // a CSS var on the capsule so the active <I> can read it; light mode flips
    // it back to the monochrome foreground in the override below.
    '.affd-dock{--affd-active-icon: var(--accent-fill);}' +
    // Icons/text sit ABOVE the selector bubble (which is z-index:1 on the
    // glass). Press feedback unchanged.
    '.affd-tab{position:relative;z-index:2;transition:transform 130ms cubic-bezier(0.22,1,0.36,1), background 200ms ease;}' +
    '.affd-tab:active{transform:scale(0.92);}' +
    // The single sliding "selector bubble": a floating frosted-glass pill that
    // glides behind the active destination. Width + X are driven by CSS vars
    // the component measures from the active tab (see the layout effect below),
    // so it tracks equal- OR unequal-width items. It sits ABOVE the capsule
    // background (z-index:1) and BELOW the glyphs (.affd-tab is z-index:2).
    // Soft iOS-style easing: quick acceleration, gentle settle. (dark-mode
    // values here; the light-mode flip is in the override block below.)
    '.affd-selector{position:absolute;top:50%;left:0;height:' + TILE_H + 'px;' +
      'width:var(--bubble-width,64px);border-radius:999px;' +
      'transform:translate3d(var(--bubble-x,0px),-50%,0);' +
      'background:rgba(255,255,255,0.14);' +
      'box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),inset 0 0 0 1px rgba(255,255,255,0.10),0 8px 22px rgba(0,0,0,0.22);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
      'pointer-events:none;z-index:1;opacity:0;' +
      'transition:transform 420ms cubic-bezier(0.22,1,0.36,1), width 320ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease;}' +
    '.affd-tab:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)!important;}' +
    // Scroll contract/expand: while the page is scrolling the dock gets
    // `is-contracted`, which subtly scales the capsule down, tightens the gap +
    // padding, and scales the icons down. Removing the class eases it back to
    // its DEFAULT size. CSS transitions cover only transform / gap / padding /
    // icon-scale; base width, height, layout, colors, and position are
    // untouched. (gap/padding are set inline, so the override needs !important.)
    '.affd-ico{transition:transform 280ms cubic-bezier(.22,1,.36,1);}' +
    '.affd-dock.is-contracted{transform:scale(0.94);gap:2px!important;padding:4px!important;}' +
    '.affd-dock.is-contracted .affd-ico{transform:scale(0.86);}' +
    '@media (prefers-reduced-motion: reduce){.affd-tab{transition:none!important;}.affd-tab:active{transform:none;}.affd-dock,.affd-ico,.affd-selector{transition:none!important;}}' +
    // Light mode: flip the dark frosted capsule to a white frosted one, the
    // active tile to a bright frosted tile, and the selected glyph back to the
    // monochrome foreground (cyan-on-white would clash). !important beats the
    // inline dark-mode styles.
    '[data-theme="light"] .affd-dock{--affd-active-icon: var(--text);background:rgba(255,255,255,0.62)!important;border-color:rgba(15,23,42,0.07)!important;box-shadow:0 1px 0 rgba(255,255,255,0.6) inset,0 10px 30px rgba(15,23,42,0.20),0 2px 8px rgba(15,23,42,0.10)!important;}' +
    '[data-theme="light"] .affd-selector{background:rgba(255,255,255,0.92);box-shadow:0 1px 3px rgba(15,23,42,0.14),inset 0 0 0 1px rgba(15,23,42,0.04);}'
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
        // No per-tab tile: the active cue is now the single sliding selector
        // bubble that glides behind the active glyph (rendered once on the
        // capsule, positioned by the component). Buttons stay transparent.
        background: 'transparent',
      }}
    >
      <span className="affd-ico" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {t.renderIcon
          ? t.renderIcon(on)
          : <I n={t.icon} s={ICON} c={on ? 'var(--affd-active-icon)' : 'var(--sub)'} w={on ? 2.2 : 1.85} />}
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

  // Contract while scrolling, expand when it stops. We only toggle the
  // `is-contracted` class on the capsule (all sizing lives in CSS); add it on
  // any scroll, then remove it ~180ms after the last scroll event so the dock
  // smoothly returns to its default size. Capture-phase so it catches the
  // app's inner scroll container as well as window. Skipped under
  // reduced-motion (the dock just stays at its default size).
  const dockRef = useRef(null)
  useEffect(() => {
    const el = dockRef.current
    if (!el || typeof window === 'undefined') return
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let idle = 0
    const onScroll = () => {
      if (!el.classList.contains('is-contracted')) el.classList.add('is-contracted')
      clearTimeout(idle)
      idle = setTimeout(() => el.classList.remove('is-contracted'), 180)
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => { window.removeEventListener('scroll', onScroll, { capture: true }); clearTimeout(idle) }
  }, [])

  // Drive the sliding selector bubble. We measure the active tab with
  // offsetLeft / offsetWidth (layout-box metrics, immune to the capsule's
  // contract `scale()` transform — getBoundingClientRect would be double-scaled
  // during scroll) and publish them as the `--bubble-x` / `--bubble-width` CSS
  // vars the `.affd-selector` rule reads. The first placement snaps without a
  // transition (no glide-from-zero flash on load); every later move animates.
  // A ResizeObserver on the capsule recomputes on window resize AND across the
  // whole scroll contract/expand tween (padding changes the content box each
  // frame), so the bubble always tracks the active tab.
  const activeId = items.find((t) => t.active)?.id
  const placedRef = useRef(false)
  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock || typeof window === 'undefined') return
    const place = () => {
      const bubble = dock.querySelector('.affd-selector')
      if (!bubble) return
      const active = dock.querySelector('[role="tab"][aria-selected="true"]')
      if (!active) { bubble.style.opacity = '0'; return }
      const snap = !placedRef.current
      if (snap) bubble.style.transition = 'none'
      dock.style.setProperty('--bubble-x', active.offsetLeft + 'px')
      dock.style.setProperty('--bubble-width', active.offsetWidth + 'px')
      bubble.style.opacity = '1'
      if (snap) { void bubble.offsetWidth; bubble.style.transition = ''; placedRef.current = true }
    }
    place()
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(place); ro.observe(dock) }
    window.addEventListener('resize', place)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', place) }
  }, [activeId, items.length])

  return (
    <nav
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Sit low, ~1cm nearer the bottom edge than the previous float. We
        // drop most of the safe-area lift (keeping a small floor so it still
        // clears the home indicator) so the capsule rides near the very bottom.
        bottom: 'max(env(safe-area-inset-bottom, 0px) - 28px, 6px)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 16px',
        pointerEvents: 'none', // wrapper is transparent; the capsule re-enables
      }}
    >
      <div
        ref={dockRef}
        className="affd-dock"
        role="tablist"
        style={{
          pointerEvents: 'auto',
          // Positioning context for the absolutely-positioned selector bubble.
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          maxWidth: maxWidth || 460,
          padding: 6,
          // Transition ONLY the contract/expand properties so the dock eases
          // between its default and contracted sizes (class toggled on scroll).
          transition: 'transform 280ms cubic-bezier(.22,1,.36,1), gap 280ms cubic-bezier(.22,1,.36,1), padding 280ms cubic-bezier(.22,1,.36,1)',
          transformOrigin: 'center bottom',
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
        {/* Single sliding selector bubble — sits behind the glyphs, glides to
            the active tab. Positioned via CSS vars set in the layout effect. */}
        <div className="affd-selector" aria-hidden="true" />
        {items.map((t) => <DockTab key={t.id} t={t} />)}
      </div>
    </nav>
  )
}
