/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlowFloatingDock — a premium Instagram/visionOS-style floating
 * glass capsule dock that replaces the edge-attached bottom tab bar.
 *
 *   • Floats above the bottom safe area (never hugs the screen edge).
 *   • One large rounded-999 capsule with dark translucent glass + blur,
 *     a hairline border, and a soft lifted shadow.
 *   • Active tab carries its own inner rounded pill (white 12% fill +
 *     a cyan accent ring) and shows icon + label; inactive tabs are
 *     icon-only. The active pill expands/collapses with a spring so
 *     switching tabs reads as the selection gliding between lanes.
 *   • No underline, no bottom indicator, not full-bleed.
 *
 *   <AtmosFlowFloatingDock
 *     maxWidth={contentMax}
 *     tabs={[
 *       { id, label, icon, active, onClick, badge, renderIcon? },
 *     ]}
 *   />
 *
 * The dock chrome is INTENTIONALLY dark glass in both themes — like the
 * iOS/Instagram dock it's brand chrome that floats over content, so it
 * stays a single dark surface rather than flipping with [data-theme].
 * The white icon/label + cyan accent read on this dark glass in dark and
 * light mode alike, so there's no light-mode contrast regression. The
 * accent (var(--accent)) is the only themed token and cyan reads on dark
 * in both palettes.
 */
import { I } from '../Icons'

// Hide the (rare) horizontal scrollbar should the dock ever overflow on a
// very narrow device. Injected once so the rule exists wherever it mounts.
if (typeof document !== 'undefined' && !document.getElementById('affd-style')) {
  const s = document.createElement('style')
  s.id = 'affd-style'
  s.textContent =
    '.affd-dock::-webkit-scrollbar{display:none}' +
    '@media (prefers-reduced-motion: reduce){.affd-dock button{transition:none !important}}'
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
  // Barely-there tint + a lighter blur so it reads as clear glass, not
  // frost — content stays legible THROUGH it. Glassiness comes from the
  // bright specular edges + high saturation, not from a milky fill.
  background: 'rgba(255,255,255,0.045)',
  backdropFilter: 'blur(18px) saturate(210%)',
  WebkitBackdropFilter: 'blur(18px) saturate(210%)',
  border: '1px solid rgba(255,255,255,0.22)',
  boxShadow:
    '0 8px 26px rgba(0,0,0,0.22), ' +
    'inset 0 1px 0 rgba(255,255,255,0.45), ' +   // bright specular top edge
    'inset 0 -1px 1px rgba(0,0,0,0.08)',          // faint lower contact shade
}

const press = (e) => { e.currentTarget.style.transform = 'scale(0.93)' }
const release = (e) => { e.currentTarget.style.transform = 'scale(1)' }

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
      role="tab"
      aria-selected={on}
      aria-current={on ? 'page' : undefined}
      aria-label={t.label}
      title={t.label}
      onClick={t.onClick}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      style={{
        position: 'relative',
        flexShrink: 0,
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
        // Active inner pill: frosted glass — translucent white fill
        // + its own backdrop blur (blurs the dock glass + content
        // behind it) + a glassy meniscus (bright top edge, faint
        // bottom shade) and a cyan accent ring.
        background: on
          ? 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'
          : 'transparent',
        backdropFilter: on ? 'blur(14px) saturate(180%)' : 'none',
        WebkitBackdropFilter: on ? 'blur(14px) saturate(180%)' : 'none',
        boxShadow: on
          ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 1px rgba(0,0,0,0.12)'
          : 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        transition:
          'background 220ms cubic-bezier(0.34,1.4,0.64,1), ' +
          'box-shadow 220ms ease, padding 220ms cubic-bezier(0.34,1.4,0.64,1), ' +
          'gap 220ms cubic-bezier(0.34,1.4,0.64,1), ' +
          'height 220ms cubic-bezier(0.34,1.4,0.64,1), ' +
          'transform 130ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        {t.renderIcon
          ? t.renderIcon(on)
          : <I n={t.icon} s={18} c={on ? '#FFFFFF' : '#A1A1AA'} w={on ? 2 : 1.7} />}
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
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: '#FFFFFF', whiteSpace: 'nowrap' }}>
          {t.label}
        </span>
      )}
    </button>
  )
}

export default function AtmosFlowFloatingDock({ tabs, aux, maxWidth, ariaLabel = 'Primary' }) {
  return (
    <nav
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Lift off the bottom edge + clear the iPhone home indicator.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12, // space between the oval dock and the circular aux pill
        padding: '0 14px',
        pointerEvents: 'none', // wrapper is transparent; capsules re-enable
      }}
    >
      <div
        className="affd-dock"
        role="tablist"
        style={{
          ...SURFACE_STYLE,
          gap: 14,
          maxWidth: maxWidth || 460,
          // Don't stretch full-width — hug the tabs but cap on tablets.
          // Slim vertical padding (thin) + roomy horizontal padding (long).
          padding: '5px 12px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {(tabs || []).map((t) => <DockButton key={t.id} t={t} />)}
      </div>
      {/* Standalone circular AtmosFlow AI pill — its own glass capsule
          beside the oval dock so the assistant reads as a distinct,
          always-reachable action rather than just another tab. */}
      {aux && (
        <div className="affd-dock" style={{ ...SURFACE_STYLE, padding: 5 }}>
          <DockButton t={aux} solo />
        </div>
      )}
    </nav>
  )
}
