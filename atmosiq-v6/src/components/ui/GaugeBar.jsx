/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * GaugeBar — a thin horizontal scale for a parameter's mean. Shows the
 * mean as a filled dot within the observed range, an optional reference
 * threshold tick, and an optional comfort band (shaded). The scale spans
 * the observed range, widened to include the threshold/band so the tick is
 * always visible. Screening visualization only — no determination implied.
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

  return (
    <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--surface)', border: '1px solid var(--border)', marginTop: 2 }}>
      {/* comfort band */}
      {band && band.min != null && band.max != null && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(band.min)}%`, width: `${Math.max(0, pct(band.max) - pct(band.min))}%`, background: color, opacity: 0.14, borderRadius: 3 }} />
      )}
      {/* fill from left to the mean */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${valPct}%`, background: color, opacity: 0.45, borderRadius: 3 }} />
      {/* threshold tick */}
      {limit != null && (
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${pct(limit)}%`, width: 2, marginLeft: -1, background: 'var(--dim)', borderRadius: 1 }} />
      )}
      {/* mean dot */}
      <div style={{ position: 'absolute', top: '50%', left: `${valPct}%`, width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: '50%', background: color, boxShadow: '0 0 0 2px var(--card)' }} />
    </div>
  )
}
