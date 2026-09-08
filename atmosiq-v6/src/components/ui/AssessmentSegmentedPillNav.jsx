/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AssessmentSegmentedPillNav — floating pill segmented control for the
 * assessment result tabs. Speaks the same design language as the bottom
 * navigation dock (AtmosFlowFloatingDock):
 *
 *   • Each tab is a flat control — card tone + hairline edge, the same
 *     material as the dock and the header controls, in both themes.
 *   • Active tab → accent-tinted pill with an accent ring, showing icon +
 *     label, both in var(--accent). Inactive tabs → icon-only circles
 *     with a var(--sub) glyph, matching the dock.
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
import { useScrollEdges } from '../../hooks/useScrollEdges'

// Injected once. Hides the WebKit scrollbar + carries the theme-aware glass
// for the tabs (so the same markup reads in dark + light, like the dock).
if (typeof document !== 'undefined' && !document.getElementById('aspn-style')) {
  const s = document.createElement('style')
  s.id = 'aspn-style'
  s.textContent =
    '.aspn-scroll::-webkit-scrollbar{display:none}' +
    // Flat material, shared with the dock and header controls: card tone +
    // hairline edge at rest; the active tab is the same accent tint + ring
    // the side menu uses for its selected row. Theme tokens carry the
    // light-mode flip, so there is no per-theme override.
    '.aspn-tab{background:var(--card);border:1px solid var(--border);box-shadow:0 1px 2px rgba(0,0,0,0.20);}' +
    '.aspn-tab-on{background:color-mix(in srgb, var(--accent) 12%, var(--card));border-color:color-mix(in srgb, var(--accent) 30%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent);}' +
    '[data-theme="light"] .aspn-tab{box-shadow:0 1px 2px rgba(15,23,42,0.06);}' +
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
  // When true, every tab shows its label (not just the active one) so the
  // destinations are identifiable. Used by the project workspace, where the
  // nine sections need names; the assessment result tabs leave it off and
  // stay icon-only-when-inactive.
  showLabels = false,
}) {
  // Nine project sections do not fit a phone frame, and the scrollbar is
  // hidden, so the strip fades on whichever side still has tabs instead of
  // slicing one down the middle ("Assessm"). A cut word reads as breakage,
  // not as an invitation to scroll.
  const scroll = useScrollEdges()

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      className="aspn-scroll"
      ref={scroll.ref}
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
        ...scroll.maskStyle,
        ...style,
      }}
    >
      {(tabs || []).map((t) => {
        const on = active === t.id
        const labelled = on || showLabels
        // Active in the restrained accent (the fill cyan is for filled CTAs);
        // inactive on the theme's --sub so it reads in light mode too — the
        // old literal #A1A1AA was a dark-mode grey on a white pill.
        const fg = on ? 'var(--accent)' : 'var(--sub)'
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
              gap: labelled ? 7 : 0,
              height: PILL_H,
              minWidth: labelled ? undefined : 49,
              padding: labelled ? '0 17px' : 0,
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
            {labelled && (
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
