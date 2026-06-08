/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AssessmentSegmentedPillNav — iOS-Mail-style floating pill segmented
 * control for the assessment result tabs.
 *
 *   • Active tab  → a large filled cyan capsule showing icon + label.
 *   • Inactive tabs → neutral dark rounded capsules, icon-only.
 *   • Capsule shapes (border-radius 999px); no underline, no boxy
 *     selected state, no bottom indicator.
 *   • Horizontally scrollable on mobile; floating + soft (Apple-like).
 *
 *   <AssessmentSegmentedPillNav
 *     tabs={[{ id, icon, label }]}
 *     active={rTab}
 *     onChange={(id) => setRTab(id)}
 *   />
 *
 * Colours are theme CSS variables so the control reads correctly in both
 * dark and light: the active pill is the AtmosFlow cyan (--accent-fill)
 * with the on-accent foreground (white on dark, near-black on light); the
 * inactive pill is a subtle neutral fill that adapts to the theme
 * (≈ #242426 in dark), with --sub for the icon.
 */
import { I } from '../Icons'

// Hide the horizontal scrollbar on WebKit (Firefox uses scrollbarWidth
// inline). Injected once so the rule exists wherever the nav mounts.
if (typeof document !== 'undefined' && !document.getElementById('aspn-style')) {
  const s = document.createElement('style')
  s.id = 'aspn-style'
  s.textContent = '.aspn-scroll::-webkit-scrollbar{display:none}'
  document.head.appendChild(s)
}

const PILL_H = 48

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
        gap: 12,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '8px 2px',
        margin: '0 0 16px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      {(tabs || []).map((t) => {
        const on = active === t.id
        const press = (e) => { e.currentTarget.style.transform = 'scale(0.95)' }
        const release = (e) => { e.currentTarget.style.transform = 'scale(1)' }
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            aria-label={t.label}
            title={t.label}
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
              gap: on ? 8 : 0,
              height: PILL_H,
              minWidth: on ? undefined : 58,
              padding: on ? '0 20px' : 0,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: on
                ? 'var(--accent-fill)'
                : 'color-mix(in srgb, var(--text) 9%, transparent)',
              color: on ? 'var(--on-accent-fill)' : 'var(--sub)',
              boxShadow: on
                ? '0 6px 16px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.18)'
                : 'inset 0 1px 0 rgba(255,255,255,0.04)',
              WebkitTapHighlightColor: 'transparent',
              transition:
                'background 220ms ease, color 220ms ease, box-shadow 220ms ease, padding 220ms ease, transform 130ms cubic-bezier(.22,1,.36,1)',
            }}
          >
            <I n={t.icon} s={19} c={on ? 'var(--on-accent-fill)' : 'var(--sub)'} w={on ? 2 : 1.8} />
            {on && (
              <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                {t.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
