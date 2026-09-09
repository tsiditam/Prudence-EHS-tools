/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * LaunchFrame — what the app shows while the cached session resolves:
 * a static frame of the first screen. Theme background, the header's
 * height left clear, the home heading where it will be, and the shape
 * of the rows that will fill in beneath it. No motion, no brand mark,
 * nothing to wait for — when the session resolves the real screen
 * draws in the same place.
 *
 * It replaced two things (2026-09). A black cover, which flashed dark
 * inside a light-theme app. And the 7-second brand intro that followed
 * a first sign-in: the brain mark dissolving into particles and
 * reforming, once per browser cache. A launch screen should look like
 * the app's first screen, not a branding moment (Apple HIG, "Launch
 * screen"); one second is the limit for keeping a user's flow and ten
 * for keeping their attention (Nielsen 1993, after Miller 1968), and
 * the intro sat near the second limit on the one occasion the user was
 * most eager to see the app.
 *
 * LazyPlaceholder is the Suspense fallback for the lazily loaded
 * screens and tabs. It used to be the brand splash in a 400 ms "fast"
 * mode — a full-screen black canvas that sampled the logo SVG on every
 * first open of Logger Studio, Settings or a results tab. It is now a
 * quiet caption in place, in the theme's ink.
 */
import * as V3 from '../styles/tokens'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
const BAR = { background: V3.RAISED, borderRadius: 4, height: 12 }

// Three rows, the widths varied so the frame reads as content rather
// than a pattern. Static: a shimmer is motion, and the point of this
// frame is that there is nothing to watch.
const ROWS = [
  { title: '58%', meta: '38%' },
  { title: '44%', meta: '30%' },
  { title: '64%', meta: '36%' },
]

export default function LaunchFrame({ heading = 'Projects', padX = 20, contentMax = 620 }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--text)', zIndex: 9999 }}>
      <div style={{ height: 'calc(48px + env(safe-area-inset-top, 0px))' }} />
      <div style={{ padding: `16px ${padX}px 0`, maxWidth: contentMax, margin: '0 auto' }}>
        {heading && <div style={{ ...V3.T.h1, marginBottom: 20 }}>{heading}</div>}
        <div aria-hidden="true">
          {ROWS.map((r, i) => (
            <div key={i} style={{ padding: '18px 0', borderTop: i === 0 ? 'none' : HAIRLINE }}>
              <div style={{ ...BAR, height: 14, width: r.title }} />
              <div style={{ ...BAR, width: r.meta, marginTop: 10, opacity: 0.7 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LazyPlaceholder({ label = 'Loading…' }) {
  return (
    <div role="status" aria-busy="true" style={{ ...V3.T.captionDim, textAlign: 'center', padding: '48px 20px' }}>
      {label}
    </div>
  )
}
