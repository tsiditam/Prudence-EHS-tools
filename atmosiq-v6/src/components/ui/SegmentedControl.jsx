/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SegmentedControl — V3-surface segmented tab switcher (tablist of pill
 * buttons inside a tracked container). Used for the Logger Studio
 * Overview / Analysis / Report view switch; each option may carry a numeric
 * `badge`. Plain V3 token surface, not soft-glass.
 */
const BORDER = 'var(--border)', CARD = 'var(--card)', SUB = 'var(--sub)', ACCENT = 'var(--accent)'

export default function SegmentedControl({ options, value, onChange, ariaLabel, style }) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 12, ...style }}>
      {options.map((opt) => {
        const on = value === opt.value
        return (
          <button key={opt.value} role="tab" aria-selected={on} onClick={() => onChange(opt.value)}
            style={{ flex: 1, padding: '9px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 600, color: on ? ACCENT : SUB, background: on ? CARD : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'color .15s, background .15s' }}>
            {opt.label}
            {opt.badge ? (
              <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: ACCENT, color: 'var(--on-accent-fill)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{opt.badge}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
