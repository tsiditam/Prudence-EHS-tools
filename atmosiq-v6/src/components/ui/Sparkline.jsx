/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sparkline — a tiny, axis-less trend line for a parameter's series. Pure
 * SVG (no charting lib) so it's cheap to render in a stat card. Returns
 * null when there isn't enough signal to draw.
 */
export default function Sparkline({ values, color = 'var(--sub)', width = 76, height = 22, strokeWidth = 1.6 }) {
  const vals = (values || []).filter((v) => v != null && Number.isFinite(v))
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = width / (vals.length - 1)
  const pad = 1.5
  const y = (v) => pad + (height - pad * 2) * (1 - (v - min) / span)
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  )
}
