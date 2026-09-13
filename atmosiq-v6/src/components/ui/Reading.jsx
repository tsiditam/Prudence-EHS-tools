/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Reading — a number the way an instrument shows it.
 *
 *   <Reading value={742} unit="ppm" label="CO₂" state={{ label: 'Within criteria', tone }} />
 *   <Reading value={3} label="Zones assessed" size="lg" />
 *
 * The value is set in the numeric scale with tabular figures so a column of
 * readings aligns on the digit; the unit sits beside it a step smaller and a
 * step quieter, the way a meter prints "ppm" after the count rather than as
 * part of it; the label runs above in the eyebrow; and the criterion state,
 * where one applies, runs below in its semantic color — the only color on
 * the tile. A reading with no state (a count, a TVOC value the engine does
 * not judge) simply has none. Nothing here decides anything: the state is
 * handed in from the engine's own outcome.
 *
 * `size` — 'md' (24px value, the zone grid), 'lg' (28px, a hero stat).
 * `value` may be a number or a preformatted string; null / undefined / ''
 * renders an em dash in the tertiary ink. `animate` ticks a numeric value
 * up from its last settled value (0 on first mount) — for a COUNT that has
 * just been produced (zones assessed, findings), never for a measurement,
 * which is a fact the instrument read and should not appear to change.
 */
import * as V3 from '../../styles/tokens'
import { useCountUp } from './CountUp'

const SIZES = {
  md: { value: { ...V3.N.lg }, unit: 12 },
  lg: { value: { ...V3.N.lg, fontSize: 28, lineHeight: '32px' }, unit: 13 },
}

export default function Reading({ value, unit, label, state, size = 'md', animate = false, style }) {
  const s = SIZES[size] || SIZES.md
  const empty = value === null || value === undefined || value === ''
  const shown = useCountUp(animate && typeof value === 'number' ? value : null)
  const display = animate && typeof value === 'number' ? Math.round(shown ?? value) : value
  return (
    <div style={{ minWidth: 0, ...style }}>
      {label && <div style={{ ...V3.T.micro, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
        <span style={{ ...s.value, color: empty ? V3.TEXT_TERTIARY : V3.TEXT_PRIMARY }}>{empty ? '—' : display}</span>
        {!empty && unit && <span style={{ fontSize: s.unit, fontWeight: 500, color: V3.TEXT_TERTIARY, whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
      {state && state.label && (
        <div style={{ ...V3.T.caption, marginTop: 4, color: state.tone || V3.TEXT_TERTIARY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.label}</div>
      )}
    </div>
  )
}
