/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AssessmentSegmentedPillNav — floating pill segmented control for the
 * assessment result tabs. Speaks the same design language as the bottom
 * navigation dock (AtmosFlowFloatingDock):
 *
 *   • Each tab is a glass control — near-clear translucent fill + light
 *     blur + a bright specular rim in dark mode, flipping to a white
 *     capsule in light mode.
 *   • Active tab → glass pill with a cyan accent ring, showing icon +
 *     label, both in cyan (var(--accent-fill)). Inactive tabs → icon-only
 *     glass circles with a grey glyph (#A1A1AA), matching the dock.
 *   • Capsule shapes (border-radius 999px); no underline / boxy selected
 *     state / bottom indicator. Horizontally scrollable on mobile.
 *
 *   <AssessmentSegmentedPillNav
 *     tabs={[{ id, icon, label }]}
 *     active={rTab}
 *     onChange={(id) => setRTab(id)}
 *   />
 *
 * Glass surface lives in the injected stylesheet (below) so it flips with
 * [data-theme]; layout (size / shape) stays inline.
 */
import { I } from '../Icons'

// Injected once. Hides the WebKit scrollbar + carries the theme-aware glass
// for the tabs (so the same markup reads in dark + light, like the dock).
if (typeof document !== 'undefined' && !document.getElementById('aspn-style')) {
  const s = document.createElement('style')
  s.id = 'aspn-style'
  s.textContent =
    '.aspn-scroll::-webkit-scrollbar{display:none}' +
    '.aspn-tab{background:rgba(255,255,255,0.05);-webkit-backdrop-filter:blur(14px) saturate(200%);backdrop-filter:blur(14px) saturate(200%);border:1px solid rgba(255,255,255,0.18);box-shadow:inset 0 1px 0 rgba(255,255,255,0.38);}' +
    '.aspn-tab-on{background:linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05));box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.42);}' +
    '[data-theme="light"] .aspn-tab{background:rgba(255,255,255,0.9);border-color:rgba(15,23,42,0.10);box-shadow:0 2px 8px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.7);}' +
    '[data-theme="light"] .aspn-tab-on{background:color-mix(in srgb, var(--accent) 12%, #ffffff);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);}' +
    '@media (prefers-reduced-motion: reduce){.aspn-tab{transition:none !important;}}'
  document.head.appendChild(s)
}

const PILL_H = 41

export default function AssessmentSegmentedPillNav({
  tabs,
  active,
  onChange,
  id,
  style,
  ariaLabel = 'Assessment sections',
}) {
  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      className="aspn-scroll"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '7px 2px',
        margin: '0 0 16px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      {(tabs || []).map((t) => {
        const on = active === t.id
        const fg = on ? 'var(--accent-fill)' : '#A1A1AA'
        const press = (e) => { e.currentTarget.style.transform = 'scale(0.95)' }
        const release = (e) => { e.currentTarget.style.transform = 'scale(1)' }
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            aria-label={t.label}
            title={t.label}
            className={on ? 'aspn-tab aspn-tab-on' : 'aspn-tab'}
            onClick={() => onChange(t.id)}
            onPointerDown={press}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: on ? 7 : 0,
              height: PILL_H,
              minWidth: on ? undefined : 49,
              padding: on ? '0 17px' : 0,
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: fg,
              WebkitTapHighlightColor: 'transparent',
              transition:
                'background 220ms ease, color 220ms ease, box-shadow 220ms ease, padding 220ms ease, transform 130ms cubic-bezier(.22,1,.36,1)',
            }}
          >
            <I n={t.icon} s={16} c={fg} w={on ? 2 : 1.8} />
            {on && (
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {t.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
