/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper's brand mark — a Copilot-style friendly robot. Single
 * rounded squircle "head/body" with two oval eyes and small paddle
 * ears on the sides. No antenna, no separate neck/torso, no body
 * screen — the v1 robot was too busy at the 20-22px sizes where it
 * actually renders in the bottom nav and FieldAssistant header. A
 * minimalist silhouette reads as a friendly AI companion at any
 * size and matches the visual register of the rest of the nav.
 *
 * Painted in a cyan → orange → red horizontal gradient. The eyes
 * are cut to `var(--card)` so they read as a window through the
 * silhouette on whatever surface it sits on. A unique gradient id
 * per render (useId) prevents <defs> id collisions when multiple
 * instances appear on the same page.
 *
 * Used in: BottomNav Jasper tab, FieldAssistant chat sheet header,
 * FieldAssistant first-run intro panel.
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
      {/* Side paddle ears — small rounded extensions */}
      <rect x="2.4" y="9.4" width="2.6" height="5.2" rx="1.3" fill={`url(#${gid})`} />
      <rect x="19" y="9.4" width="2.6" height="5.2" rx="1.3" fill={`url(#${gid})`} />
      {/* Head/body squircle — single unified silhouette, very
          rounded corners so it reads as soft-organic rather than
          industrial. */}
      <rect x="4.5" y="4" width="15" height="16" rx="5" fill={`url(#${gid})`} />
      {/* Left eye — oval cut to surface */}
      <ellipse cx="9.4" cy="11" rx="1.45" ry="1.85" fill="var(--card)" />
      {/* Right eye — oval cut to surface */}
      <ellipse cx="14.6" cy="11" rx="1.45" ry="1.85" fill="var(--card)" />
    </svg>
  )
}
