/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AssessmentSegmentedPillNav — iOS-Mail-style floating pill segmented
 * control for the assessment result tabs.
 *
 *   • Active tab  → a filled capsule showing icon + label. The fill cycles
 *     through red → amber → green → white by tab position, so switching
 *     tabs alternates the active colour.
 *   • Inactive tabs → neutral dark rounded capsules, icon-only.
 *   • Capsule shapes (border-radius 999px); no underline, no boxy selected
 *     state, no bottom indicator. Horizontally scrollable on mobile;
 *     floating + soft (Apple-like).
 *
 *   <AssessmentSegmentedPillNav
 *     tabs={[{ id, icon, label }]}
 *     active={rTab}
 *     onChange={(id) => setRTab(id)}
 *   />
 *
 * The inactive surface uses theme CSS vars (a subtle neutral fill ≈ #242426
 * in dark / light grey in light, with --sub for the icon). The active
 * fills are the intentional alternating accent tones below.
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

// Active-pill tones, cycled by tab index. Deep enough that the white
// icon+label reads on the colour; the white pill flips to dark ink + a
// hairline border so it stays defined on any background.
const ACTIVE_TONES = [
  { bg: '#DC2626', fg: '#FFFFFF', border: 'none', shadow: 'inset 0 1px 0 rgba(255,255,255,0.20)' }, // red
  { bg: '#D97706', fg: '#FFFFFF', border: 'none', shadow: 'inset 0 1px 0 rgba(255,255,255,0.20)' }, // amber
  { bg: '#16A34A', fg: '#FFFFFF', border: 'none', shadow: 'inset 0 1px 0 rgba(255,255,255,0.20)' }, // green
  { bg: '#FFFFFF', fg: '#1B2A41', border: '1px solid #CBD5E1', shadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' }, // white
]

const PILL_H = 41 // ~15% smaller than the original 48

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
      {(tabs || []).map((t, idx) => {
        const on = active === t.id
        const tone = ACTIVE_TONES[idx % ACTIVE_TONES.length]
        const fg = on ? tone.fg : 'var(--sub)'
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
              gap: on ? 7 : 0,
              height: PILL_H,
              minWidth: on ? undefined : 49,
              padding: on ? '0 17px' : 0,
              borderRadius: 999,
              border: on ? tone.border : 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: on ? tone.bg : 'color-mix(in srgb, var(--text) 9%, transparent)',
              color: fg,
              boxShadow: on ? tone.shadow : 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
