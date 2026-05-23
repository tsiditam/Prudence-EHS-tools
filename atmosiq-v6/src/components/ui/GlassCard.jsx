/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * GlassCard — the workhorse soft-glass card primitive.
 *
 *   <GlassCard>
 *     <h2>Title</h2>
 *     <p>Body...</p>
 *   </GlassCard>
 *
 *   <GlassCard accent="#EF4444" elevated>
 *     ...severity-railed hero card
 *   </GlassCard>
 *
 * Props:
 *   accent?   hex — paints a 2-px rail at the top edge
 *   dense?    boolean — halves the inner padding for inline tables
 *   elevated? boolean — uses GLASS.elevated for sheets / modals
 *   onClick?  function — adds tactile press feedback when interactive
 *   style?    object — overrides; merged last
 *   className? string — passthrough
 *   children
 */

import { GLASS, RADII, SPRING, tapResetStyle, tapTransition } from '../../styles/soft-glass'
import { TEXT_PRIMARY } from '../../styles/tokens'

export default function GlassCard({
  accent,
  dense = false,
  elevated = false,
  onClick,
  style,
  children,
  ...rest
}) {
  const base = elevated ? GLASS.elevated : GLASS.card
  const composed = {
    ...base,
    borderRadius: RADII.card,
    padding: dense ? '14px 16px' : '20px 22px',
    color: TEXT_PRIMARY,
    position: 'relative',
    overflow: 'hidden',
    ...(accent ? { borderTop: `2px solid ${accent}` } : null),
    ...(onClick
      ? {
          cursor: 'pointer',
          transition: tapTransition,
          ...tapResetStyle,
        }
      : null),
    ...style,
  }

  // Tactile press: scale down on active. Implemented via inline event
  // handlers rather than a CSS :active pseudo-class so the behavior
  // works on iOS Safari without an extra global stylesheet.
  const handlers = onClick
    ? {
        onClick,
        onPointerDown: (e) => {
          e.currentTarget.style.transform = 'scale(0.985)'
          e.currentTarget.style.transition = `transform ${SPRING.durFast} ${SPRING.gentle}`
        },
        onPointerUp: (e) => { e.currentTarget.style.transform = 'scale(1)' },
        onPointerLeave: (e) => { e.currentTarget.style.transform = 'scale(1)' },
        onPointerCancel: (e) => { e.currentTarget.style.transform = 'scale(1)' },
      }
    : null

  return (
    <div style={composed} {...handlers} {...rest}>
      {children}
    </div>
  )
}
