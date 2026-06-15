/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlowFloatingDock — a premium Instagram/visionOS-style floating
 * glass capsule dock that replaces the edge-attached bottom tab bar.
 *
 *   • Sits at the bottom-bar position, just above the safe area.
 *   • Responsive width: full-bleed with side margins, capped at the
 *     content width; tabs spread evenly across the bar.
 *   • One large rounded-999 capsule with dark translucent glass + blur,
 *     a hairline border, and a soft lifted shadow.
 *   • Active tab carries its own inner rounded pill (white 12% fill +
 *     a cyan accent ring) and shows icon + label; inactive tabs are
 *     icon-only. The active pill expands/collapses with a spring so
 *     switching tabs reads as the selection gliding between lanes.
 *   • No underline, no bottom indicator.
 *   • Fluid "magnetic" magnification (macOS/Fiverr-style): tabs scale by
 *     pointer proximity as you glide across. Works for a hovering mouse AND
 *     a finger dragged across the dock on touch; a tap still navigates, a
 *     glide never selects. Disabled only under reduced-motion.
 *
 *   <AtmosFlowFloatingDock
 *     maxWidth={contentMax}
 *     tabs={[
 *       { id, label, icon, active, onClick, badge, renderIcon? },
 *     ]}
 *   />
 *
 * The dock chrome is dark glass in DARK mode and flips to a white capsule
 * in LIGHT mode (via the [data-theme="light"] .affd-dock overrides in the
 * injected stylesheet below) so it stays consistent with the light theme.
 * Active icon + label are cyan (var(--accent-fill)) in both modes; the
 * active pill is a frosted-white fill on dark glass and a faint cyan tint
 * on the white light-mode capsule.
 */
import { useEffect, useRef } from 'react'
import { I } from '../Icons'

// Hide the (rare) horizontal scrollbar should the dock ever overflow on a
// very narrow device. Injected once so the rule exists wherever it mounts.
if (typeof document !== 'undefined' && !document.getElementById('affd-style')) {
  const s = document.createElement('style')
  s.id = 'affd-style'
  s.textContent =
    '.affd-dock::-webkit-scrollbar{display:none}' +
    '@media (prefers-reduced-motion: reduce){.affd-dock button{transition:none !important}}' +
    // Tactile tap-glow: a cyan ripple that blooms from the centre of a dock
    // tab (and the circular Jasper pill) on press, plus a cyan focus ring.
    // Layered behind the icon (z-index:-1) so it never washes out the glyph.
    '.affd-tab{isolation:isolate;}' +
    '.affd-tab::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;background:radial-gradient(circle at 50% 50%, rgba(57,192,217,0.32), transparent 60%);opacity:0;transform:scale(.8);pointer-events:none;}' +
    '.affd-tab:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)!important;}' +
    // Tap feedback for coarse-pointer (touch) devices, where the magnetic
    // hover magnification is disabled. (On fine pointers the JS sets an
    // inline transform that takes precedence over this.)
    '.affd-tab:active{transform:scale(0.96);}' +
    '@media (prefers-reduced-motion: no-preference){.affd-tab::after{transition:opacity 220ms ease, transform 220ms ease;}.affd-tab:active::after{opacity:1;transform:scale(1.12);}}' +
    // Light mode: flip the dock from dark glass to a white capsule so it
    // matches the light theme; the active pill becomes a faint cyan tint
    // with a cyan ring. Labels/icons are already cyan (--accent-fill), so
    // they read on white. !important beats the inline dark-glass styles.
    '[data-theme="light"] .affd-dock{background:rgba(255,255,255,0.92)!important;border-color:rgba(15,23,42,0.10)!important;box-shadow:0 0 0 1px rgba(15,23,42,0.09),0 2px 8px rgba(15,23,42,0.18),0 10px 24px rgba(15,23,42,0.24),inset 0 1px 0 rgba(255,255,255,0.7)!important;}' +
    '[data-theme="light"] .affd-tab-on{background:color-mix(in srgb, var(--accent) 12%, #ffffff)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent)!important;}'
  document.head.appendChild(s)
}

// "Width" here = the dock's thickness (its vertical dimension); "length"
// = the horizontal span. Tuned thinner (shorter pills) + longer (wider
// gaps/padding) so the capsule reads as a slim, elongated glass bar.
const PILL_H = 39 // active pill height (+15%)
const DOT_H = 33 // inactive icon-only circle

// Shared capsule glass — used by both the main oval dock and the
// standalone circular aux pill so they read as one material. iOS-26-style
// "Liquid Glass": near-transparent, heavily blurred, with a bright
// specular top edge so the content behind reads THROUGH the dock instead
// of being masked by a dark slab. Deliberately not themed (see header).
const SURFACE_STYLE = {
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'center',
  borderRadius: 999,
  // Dark mode: clear "liquid glass" (Claude-iOS style). Glassy, not
  // frosty — so a LIGHT blur (heavy blur = frost), a barely-there tint,
  // boosted saturation (refracts the colour behind it), and a crisp bright
  // specular rim so it reads as a reflective glass edge rather than a milky
  // diffuse panel. Light mode is the white-capsule override below.
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(14px) saturate(220%)',
  WebkitBackdropFilter: 'blur(14px) saturate(220%)',
  border: '1px solid rgba(255,255,255,0.24)',
  boxShadow:
    '0 8px 28px rgba(0,0,0,0.34), ' +
    'inset 0 1px 0 rgba(255,255,255,0.48), ' +   // crisp specular top rim
    'inset 0 0 0 1px rgba(255,255,255,0.05), ' +  // faint full-edge glass line
    'inset 0 -1px 1px rgba(0,0,0,0.10)',          // faint lower contact shade
}

// One tab/button — used for the destination tabs inside the oval dock
// and for the aux (AtmosFlow AI) button inside its own circular pill.
// `solo` keeps the button a fixed-diameter circle even when "active"
// (the aux button never grows a label).
function DockButton({ t, solo }) {
  const on = !!t.active
  const showLabel = on && !solo
  return (
    <button
      key={t.id}
      className={on ? 'affd-tab affd-tab-on' : 'affd-tab'}
      role="tab"
      aria-selected={on}
      aria-current={on ? 'page' : undefined}
      aria-label={t.label}
      title={t.label}
      onClick={t.onClick}
      style={{
        position: 'relative',
        flexShrink: 0,
        transformOrigin: 'center bottom',
        willChange: 'transform',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: showLabel ? 8 : 0,
        height: on ? PILL_H : DOT_H,
        minWidth: solo ? PILL_H : (on ? undefined : DOT_H),
        padding: showLabel ? '0 24px' : 0,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        // Active inner pill: clear glass — a light translucent gradient,
        // a LIGHT blur (not frosty), and a crisp bright top rim + cyan ring.
        background: on
          ? 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))'
          : 'transparent',
        backdropFilter: on ? 'blur(7px) saturate(210%)' : 'none',
        WebkitBackdropFilter: on ? 'blur(7px) saturate(210%)' : 'none',
        boxShadow: on
          ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 1px rgba(0,0,0,0.10)'
          : 'none',
        WebkitTapHighlightColor: 'transparent',
        // 'none' so a finger dragged across the dock drives the magnetic
        // glide (continuous pointermove) instead of being claimed for a
        // scroll gesture. Taps still navigate.
        touchAction: 'none',
        // Selection glide: the active pill expands/collapses smoothly and
        // slowly (450ms on a soft decelerate curve, not the prior bouncy
        // overshoot) so switching tabs reads as a calm slide between lanes.
        // The press scale stays quick (130ms) so taps still feel responsive.
        transition:
          'background 450ms cubic-bezier(0.32,0.72,0,1), ' +
          'box-shadow 450ms cubic-bezier(0.32,0.72,0,1), padding 450ms cubic-bezier(0.32,0.72,0,1), ' +
          'gap 450ms cubic-bezier(0.32,0.72,0,1), ' +
          'height 450ms cubic-bezier(0.32,0.72,0,1), ' +
          'transform 130ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        {t.renderIcon
          ? t.renderIcon(on)
          : <I n={t.icon} s={18} c={on ? 'var(--accent-fill)' : '#A1A1AA'} w={on ? 2 : 1.7} />}
        {t.badge > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -4, right: -8,
              minWidth: 15, height: 15, borderRadius: 999,
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
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--accent-fill)', whiteSpace: 'nowrap' }}>
          {t.label}
        </span>
      )}
    </button>
  )
}

// Pure proximity -> { scale, lift } mapping for the magnetic dock, exported
// for unit tests. `distance` is (pointerX - tabCenterX) in CSS px (sign
// irrelevant). Piecewise falloff: 0px -> 1.28, 40px -> 1.15, 80px -> 1.05,
// >=120px -> 1.0; the tab also lifts from 0 to -6px as the pointer nears.
export function dockMagnet(distance) {
  const d = Math.abs(distance)
  let scale
  if (d >= 120) scale = 1
  else if (d >= 80) scale = 1.05 + (1.0 - 1.05) * ((d - 80) / 40)
  else if (d >= 40) scale = 1.15 + (1.05 - 1.15) * ((d - 40) / 40)
  else scale = 1.28 + (1.15 - 1.28) * (d / 40)
  const lift = d >= 120 ? 0 : -6 * (1 - d / 120)
  return { scale, lift }
}

export default function AtmosFlowFloatingDock({ tabs, aux, maxWidth, ariaLabel = 'Primary' }) {
  // Fluid "magnetic" magnification (macOS/Fiverr-style). Each tab scales by
  // its distance to the pointer as it glides across the bar — pure pointer
  // math (not :hover), rAF-throttled, so it works for BOTH a hovering mouse
  // and a finger dragged across the dock on touch. It never changes the
  // selected route: a tap navigates, but a glide (a drag past a small
  // threshold) is swallowed so sliding across icons never selects one.
  // Disabled only under prefers-reduced-motion.
  const tablistRef = useRef(null)
  useEffect(() => {
    const el = tablistRef.current
    if (!el || typeof window === 'undefined' || !window.matchMedia) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let px = null       // pointer X while gliding (hover or drag); null = away
    let downX = null    // pointer X at press, for tap-vs-drag discrimination
    let dragged = false // moved far enough to count as a glide, not a tap
    const compute = () => {
      raf = 0
      el.querySelectorAll('.affd-tab').forEach((btn) => {
        if (px == null) { btn.style.transform = ''; return }
        const r = btn.getBoundingClientRect()
        const { scale, lift } = dockMagnet(px - (r.left + r.width / 2))
        btn.style.transform = `translateY(${lift.toFixed(2)}px) scale(${scale.toFixed(3)})`
      })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute) }
    const onDown = (e) => { if (reduce.matches) return; downX = e.clientX; dragged = false; px = e.clientX; schedule() }
    const onMove = (e) => {
      if (reduce.matches) return
      // Touch fires pointermove only while pressed; mouse fires it on hover.
      if (downX != null && Math.abs(e.clientX - downX) > 10) dragged = true
      px = e.clientX
      schedule()
    }
    const release = () => { downX = null; px = null; schedule() } // touch lift / cancel
    const onLeave = () => { if (downX == null) { px = null; schedule() } } // mouse left the bar
    // A glide (drag) must never select a tab: swallow the click it would emit,
    // in the CAPTURE phase so React's delegated onClick never runs.
    const onClickCapture = (e) => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false } }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', release)
    el.addEventListener('pointercancel', release)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('click', onClickCapture, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', release)
      el.removeEventListener('pointercancel', release)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('click', onClickCapture, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [tabs])

  return (
    <nav
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Sit low at the very bottom (Fiverr-style). Cap the safe-area
        // inset at 12px so a large bottom inset (e.g. Safari's bottom
        // toolbar region) can't push the dock up the screen, while still
        // keeping it off the home indicator on installed PWAs.
        bottom: 'min(env(safe-area-inset-bottom, 0px), 12px)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        // Responsive full-bleed with side margins, capped at the content width.
        padding: '0 16px',
        pointerEvents: 'none', // wrapper is transparent; capsules re-enable
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: maxWidth || 460 }}>
        <div
          ref={tablistRef}
          className="affd-dock"
          role="tablist"
          style={{
            ...SURFACE_STYLE,
            // Stretch to fill the available width and spread the tabs evenly
            // so it reads as a full-width bottom bar.
            flex: 1,
            minWidth: 0,
            justifyContent: 'space-around',
            gap: 14,
            padding: '5px 12px',
            // Visible so magnetically magnified icons can rise above the
            // capsule edge (macOS-dock style) without being clipped.
            overflow: 'visible',
            // Capture finger drags for the touch glide rather than scrolling.
            touchAction: 'none',
          }}
        >
          {(tabs || []).map((t) => <DockButton key={t.id} t={t} />)}
        </div>
        {/* Standalone circular AtmosFlow AI pill — its own glass capsule
            beside the oval dock so the assistant reads as a distinct,
            always-reachable action rather than just another tab. */}
        {aux && (
          <div className="affd-dock" style={{ ...SURFACE_STYLE, padding: 5, flexShrink: 0 }}>
            <DockButton t={aux} solo />
          </div>
        )}
      </div>
    </nav>
  )
}
