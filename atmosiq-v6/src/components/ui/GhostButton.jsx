/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * GhostButton — low-emphasis bordered button (transparent fill, neutral
 * border) for secondary actions: Replace, Remove, Export, "Adjust mapping".
 * Pass `style` to tweak spacing / compact padding / a danger color override.
 * Plain V3 token surface, not soft-glass.
 */
import { pressInTransition, pressOutTransition, PRESS_SCALE, prefersReducedMotion } from '../../styles/soft-glass'

const BORDER = 'var(--border)', SUB = 'var(--sub)'

export const ghostButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: SUB, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }

export default function GhostButton({ onClick, disabled, style, children, ...rest }) {
  // Same fluid press as TactileButton: near-instant press-in, springy release.
  const reduced = prefersReducedMotion()
  const down = (e) => { if (disabled) return; e.currentTarget.style.transition = reduced ? 'none' : pressInTransition; e.currentTarget.style.transform = `scale(${PRESS_SCALE})` }
  const up = (e) => { e.currentTarget.style.transition = reduced ? 'none' : pressOutTransition; e.currentTarget.style.transform = 'scale(1)' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      style={{ ...ghostButtonStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  )
}
