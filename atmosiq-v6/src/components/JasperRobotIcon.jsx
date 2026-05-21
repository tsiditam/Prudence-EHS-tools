/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper's brand mark — a friendly robot silhouette painted in a
 * cyan → orange → red horizontal gradient. Replaces JasperMonitorIcon
 * which used a "computer monitor" metaphor that read as a
 * desktop-software artifact in a field-app context. Robot is the
 * intuitive metaphor for an in-app AI assistant.
 *
 * The inner features (eyes, mouth, body screen) are cut out with
 * `var(--card)` so they read as a window through the silhouette on
 * whatever surface the icon sits on. A unique gradient id is
 * generated per render (useId) so multiple instances on the same
 * page don't collide on the same <defs> id.
 *
 * Used in: BottomNav Jasper tab, Jasper chat sheet header, Jasper
 * first-run intro panel.
 */

import { useId } from 'react'

export default function JasperRobotIcon({ size = 32, title }) {
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
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EF4444" />
        </linearGradient>
      </defs>
      {/* Antenna ball */}
      <circle cx="12" cy="2" r="1" fill={`url(#${gid})`} />
      {/* Antenna stem */}
      <rect x="11.5" y="3" width="1" height="2" fill={`url(#${gid})`} />
      {/* Head */}
      <rect x="5.5" y="5" width="13" height="9" rx="1.6" fill={`url(#${gid})`} />
      {/* Left ear */}
      <rect x="3.5" y="7.5" width="2.2" height="4.2" rx="1.1" fill={`url(#${gid})`} />
      {/* Right ear */}
      <rect x="18.3" y="7.5" width="2.2" height="4.2" rx="1.1" fill={`url(#${gid})`} />
      {/* Left eye — cut to surface */}
      <rect x="7.6" y="7.4" width="2.8" height="3.6" rx="0.7" fill="var(--card)" />
      {/* Right eye — cut to surface */}
      <rect x="13.6" y="7.4" width="2.8" height="3.6" rx="0.7" fill="var(--card)" />
      {/* Mouth — cut to surface */}
      <rect x="10" y="12" width="4" height="1.1" rx="0.4" fill="var(--card)" />
      {/* Neck */}
      <rect x="9.2" y="14.4" width="5.6" height="1.5" fill={`url(#${gid})`} />
      {/* Body */}
      <rect x="3.5" y="16" width="17" height="6.4" rx="1.6" fill={`url(#${gid})`} />
      {/* Body screen — cut to surface */}
      <rect x="5.6" y="17.4" width="12.8" height="3.6" rx="0.5" fill="var(--card)" />
    </svg>
  )
}
