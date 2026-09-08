/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sparkline — a tiny inline trend. 1.6px line in the series colour, an
 * optional ~10% wash beneath it (`area`), and an end-dot marking the latest
 * reading so the trace has a direction.
 */
export default function Sparkline({ values, color = 'var(--sub)', width = 76, height = 22, strokeWidth = 1.6, area = false, endDot = false }) {
  const vals = (values || []).filter((v) => v != null && Number.isFinite(v))
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = width / (vals.length - 1)
  const pad = 2.5
  const y = (v) => pad + (height - pad * 2) * (1 - (v - min) / span)
  const pts = vals.map((v, i) => [(i * step).toFixed(1), y(v).toFixed(1)])
  const d = pts.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x},${yy}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      {area && <path d={`${d} L${last[0]},${height} L0,${height} Z`} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
      {endDot && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
    </svg>
  )
}
