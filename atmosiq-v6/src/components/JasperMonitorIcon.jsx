/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper's brand mark — a filled computer-monitor SVG painted in an
 * Apple-Intelligence-style warm-to-cool gradient (pink → purple →
 * blue → cyan), with the screen cut out using `var(--card)` so the
 * monitor reads as a "window" through the bezel on whatever surface
 * it's drawn over.
 *
 * Shared across the FAB launcher, the chat-sheet header, and the
 * first-run intro panel. A unique gradient id is generated per
 * render (useId) so multiple instances on the same page don't
 * collide on the same <defs> id.
 */

import { useId } from 'react'

export default function JasperMonitorIcon({ size = 32, title }) {
  const gid = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF5F7A" />
          <stop offset="33%" stopColor="#A26BFF" />
          <stop offset="66%" stopColor="#3D8BFF" />
          <stop offset="100%" stopColor="#27D2FF" />
        </linearGradient>
      </defs>
      <rect x="2" y="3" width="20" height="13" rx="1.8" ry="1.8" fill={`url(#${gid})`} />
      <rect x="3.6" y="4.6" width="16.8" height="9.8" rx="0.6" ry="0.6" fill="var(--card)" />
      <path d="M10.6 16 h2.8 l0.6 2.5 h-4 z" fill={`url(#${gid})`} />
      <path d="M6.5 18.5 h11 l1.5 2.2 h-14 z" fill={`url(#${gid})`} />
    </svg>
  )
}
