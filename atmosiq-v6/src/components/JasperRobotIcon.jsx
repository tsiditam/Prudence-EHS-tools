/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Jasper AI brand mark — a Copilot-style friendly robot. Single
 * rounded squircle "head/body" with two oval eyes and small paddle
 * ears on the sides.
 *
 * Solid-color fill via the `color` prop (defaults to currentColor)
 * so the icon picks up its parent's color treatment exactly like
 * the lucide-style sprites in `<I />`. The eyes are cut to
 * `var(--card)` so they read as a window through the silhouette on
 * whatever surface it sits on.
 *
 * Used in: BottomNav Jasper AI tab, FieldAssistant chat sheet
 * header, FieldAssistant first-run intro panel.
 */

export default function JasperRobotIcon({ size = 32, color = 'currentColor', title }) {
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
      {/* Side paddle ears — small rounded extensions */}
      <rect x="2.4" y="9.4" width="2.6" height="5.2" rx="1.3" fill={color} />
      <rect x="19" y="9.4" width="2.6" height="5.2" rx="1.3" fill={color} />
      {/* Head/body squircle — single unified silhouette, very
          rounded corners so it reads as soft-organic rather than
          industrial. */}
      <rect x="4.5" y="4" width="15" height="16" rx="5" fill={color} />
      {/* Left eye — oval cut to surface */}
      <ellipse cx="9.4" cy="11" rx="1.45" ry="1.85" fill="var(--card)" />
      {/* Right eye — oval cut to surface */}
      <ellipse cx="14.6" cy="11" rx="1.45" ry="1.85" fill="var(--card)" />
    </svg>
  )
}
