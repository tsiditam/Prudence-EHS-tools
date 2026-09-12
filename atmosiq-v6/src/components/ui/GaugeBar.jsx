/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * GaugeBar — a one-line range meter for a session average. The track spans
 * the observed range (widened to include the reference), an optional
 * comfort band is a wash of the series color, the mean is a dot with a
 * surface ring, and the reference limit is a neutral tick. Reads as a
 * quiet meter, not a filled progress bar.
 */
const clamp = (n) => Math.max(0, Math.min(100, n))

export default function GaugeBar({ min, max, value, limit, band, color = 'var(--accent)' }) {
  if (value == null) return null
  const candidatesLo = [min, value, band && band.min].filter((n) => n != null)
  const candidatesHi = [max, value, limit, band && band.max].filter((n) => n != null)
  let lo = Math.min(...candidatesLo)
  let hi = Math.max(...candidatesHi)
  if (hi === lo) hi = lo + 1
  const pad = (hi - lo) * 0.06
  lo -= pad; hi += pad
  const pct = (x) => clamp(((x - lo) / (hi - lo)) * 100)
  const valPct = pct(value)
  const spanLo = min != null ? pct(min) : valPct
  const spanHi = max != null ? pct(max) : valPct

  return (
    <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 4 }}>
      {/* comfort band — a wash of the series hue */}
      {band && band.min != null && band.max != null && (
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${pct(band.min)}%`, width: `${Math.max(0, pct(band.max) - pct(band.min))}%`, background: color, opacity: 0.16, borderRadius: 3 }} />
      )}
      {/* observed min–max span, in the series hue */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${spanLo}%`, width: `${Math.max(0, spanHi - spanLo)}%`, background: color, opacity: 0.55, borderRadius: 2 }} />
      {/* reference tick — neutral, never the series color */}
      {limit != null && (
        <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${pct(limit)}%`, width: 2, marginLeft: -1, background: 'var(--sub)', borderRadius: 1 }} />
      )}
      {/* mean dot with a surface ring */}
      <div style={{ position: 'absolute', top: '50%', left: `${valPct}%`, width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: '50%', background: color, boxShadow: '0 0 0 2px var(--card)' }} />
    </div>
  )
}
