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

export default function AtmosFlowFloatingDock({ tabs, maxWidth, ariaLabel = 'Primary' }) {
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
        padding: '0 14px',
        pointerEvents: 'none', // wrapper is transparent; capsule re-enables
      }}
    >
      <div
        className="affd-dock"
        role="tablist"
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          maxWidth: maxWidth || 460,
          // Don't stretch full-width — hug the tabs but cap on tablets.
          // Slim vertical padding (thin) + roomy horizontal padding (long).
          padding: '5px 12px',
          borderRadius: 999,
          // Dark translucent glass (see header note — deliberately not themed).
          // Tuned toward Instagram's lighter, blurrier dock: more
          // see-through fill + a heavier blur so content reads through it.
          background: 'rgba(16,17,21,0.62)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow:
            '0 8px 30px rgba(0,0,0,0.45), ' +
            '0 2px 8px rgba(0,0,0,0.30), ' +
            'inset 0 1px 0 rgba(255,255,255,0.06)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {(tabs || []).map((t) => {
          const on = !!t.active
          const press = (e) => { e.currentTarget.style.transform = 'scale(0.93)' }
          const release = (e) => { e.currentTarget.style.transform = 'scale(1)' }
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
                gap: on ? 8 : 0,
                height: on ? PILL_H : DOT_H,
                minWidth: on ? undefined : DOT_H,
                padding: on ? '0 24px' : 0,
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
              {on && (
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: '#FFFFFF', whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
