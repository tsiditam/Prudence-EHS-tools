/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Skeleton — the shape of content that has not arrived yet.
 *
 *   <Skeleton w={160} h={14} />              one bar
 *   <SkeletonRows rows={3} />                a list, in the list's own layout
 *
 * A screen that mounts empty and then pops its rows in reads as slow and
 * unfinished, whatever the real latency. A skeleton in the shape of the
 * incoming content promises the layout first, and the perceived wait drops
 * even when the measured one does not (the effect is consistent across the
 * perceived-performance literature, and it is why every mature product
 * draws one). Two rules keep it honest: the skeleton matches the layout it
 * stands in for — a list row here has the row's dot, title, caption and
 * trailing pill — and it never lingers as decoration: a consumer renders it
 * only while its data is null, never as a placeholder for "nothing".
 *
 * The bars are a low-alpha tint of the text color over whatever surface
 * they sit on, so they read correctly in both themes without a token each.
 * The shimmer is one keyframe, injected once; reduced-motion users get the
 * static bars.
 */

const BAR = 'color-mix(in srgb, var(--text) 7%, transparent)'
const SHEEN = 'color-mix(in srgb, var(--text) 5%, transparent)'

if (typeof document !== 'undefined' && !document.getElementById('afsk-style')) {
  const s = document.createElement('style')
  s.id = 'afsk-style'
  s.textContent = `
    @keyframes afskShimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
    .af-skeleton {
      background-image: linear-gradient(90deg, transparent 0%, ${SHEEN} 50%, transparent 100%);
      background-size: 200% 100%;
      animation: afskShimmer 1.6s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) { .af-skeleton { animation: none; background-image: none; } }
  `
  document.head.appendChild(s)
}

export function Skeleton({ w = '100%', h = 12, r = 6, style }) {
  return (
    <span
      aria-hidden="true"
      className="af-skeleton"
      style={{ display: 'block', width: w, height: h, borderRadius: r, backgroundColor: BAR, ...style }}
    />
  )
}

/**
 * A list of skeleton rows in the app's list-row layout: an 8px dot, a title
 * bar and a caption bar, a trailing pill, hairlines between rows. `label`
 * is read to assistive tech once for the whole group.
 */
export function SkeletonRows({ rows = 3, label = 'Loading', hairline = 'color-mix(in srgb, var(--text) 8%, transparent)', style }) {
  const widths = [64, 48, 56, 40, 60]
  return (
    <div role="status" aria-label={label} aria-busy="true" style={style}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: i === 0 ? 'none' : `1px solid ${hairline}` }}>
          <Skeleton w={8} h={8} r={4} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton w={`${widths[i % widths.length]}%`} h={14} />
            <Skeleton w={`${Math.max(28, widths[(i + 2) % widths.length] - 20)}%`} h={10} style={{ marginTop: 8 }} />
          </div>
          <Skeleton w={62} h={20} r={10} style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  )
}

export default Skeleton
