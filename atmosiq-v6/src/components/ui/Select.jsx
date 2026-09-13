/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Select — a native <select> in the app's own chrome.
 *
 *   <Select value={v} onChange={…} aria-label="Sort reports">…</Select>
 *   <Select size="lg" style={{ width: '100%' }}>…</Select>
 *
 * The control stays native (the platform's picker on a phone, full keyboard
 * and screen-reader behavior for free); only its chrome is ours: the
 * platform chevron, height and corners are replaced with the glass fill
 * and edge every other control uses, a chevron drawn in the secondary ink,
 * and a focus ring in the accent. `style` reaches the <select> itself;
 * `width` given there is mirrored onto the wrapper so a full-width select
 * lays out as one. `size` — 'sm' (32px, dense tables), 'md' (36px,
 * default), 'lg' (40px, the height of the header controls; use it beside
 * a search field). Text stays 16px at 'lg' so iOS does not zoom on focus.
 */
const CHEVRON = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238B8B94' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")"

const SIZES = {
  sm: { height: 32, fontSize: 13, padding: '0 30px 0 10px', borderRadius: 8 },
  md: { height: 36, fontSize: 14, padding: '0 32px 0 12px', borderRadius: 10 },
  lg: { height: 40, fontSize: 16, padding: '0 36px 0 14px', borderRadius: 20 },
}

if (typeof document !== 'undefined' && !document.getElementById('afsel-style')) {
  const s = document.createElement('style')
  s.id = 'afsel-style'
  s.textContent = `
    .af-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) { .af-select:hover:not(:disabled) { background-color: var(--glass-fill-hover) !important; } }
    .af-select:disabled { opacity: 0.55; cursor: not-allowed; }
  `
  document.head.appendChild(s)
}

export const selectStyle = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  background: `${CHEVRON} no-repeat right 10px center / 16px 16px, var(--glass-fill)`,
  border: '1px solid var(--glass-edge)',
  color: 'var(--text)', fontFamily: 'inherit', fontWeight: 500, lineHeight: 1.2,
  cursor: 'pointer', boxSizing: 'border-box', maxWidth: '100%',
  transition: 'background-color var(--dur-fast) ease, border-color var(--dur-fast) ease',
  ...SIZES.md,
}

export default function Select({ size = 'md', style, className, children, ...rest }) {
  const dims = SIZES[size] || SIZES.md
  return (
    <select
      className={className ? `af-select ${className}` : 'af-select'}
      style={{ ...selectStyle, ...dims, ...style }}
      {...rest}>
      {children}
    </select>
  )
}
