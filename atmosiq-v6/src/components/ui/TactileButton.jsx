/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * TactileButton — soft-glass button with a scale-down active state.
 *
 *   <TactileButton variant="primary" onClick={...}>Continue</TactileButton>
 *   <TactileButton variant="secondary" icon={<I n="notes" />}>Word</TactileButton>
 *   <TactileButton variant="ghost" onClick={...}>Cancel</TactileButton>
 *
 * Variants:
 *   primary    — accent-fill, dark foreground, used for the single
 *                hero action per screen
 *   secondary  — translucent accent-tinted background, accent text,
 *                used for the rest of the action bar (Word, Share)
 *   ghost      — transparent, sub-text foreground, used for cancel
 *                / dismiss
 *   danger     — danger-tinted, for destructive confirmations
 *
 * Press feedback: scales the button to 0.97 on pointerdown and back
 * on pointerup/leave. The transform is the only thing that animates
 * for tap (no color flash) so the interaction reads as physical
 * mass rather than a state change.
 */

import { SPRING, tapResetStyle, tapTransition } from '../../styles/soft-glass'
import { R, TEXT_PRIMARY, TEXT_SECONDARY } from '../../styles/tokens'

const VARIANT = {
  primary: {
    background: 'var(--accent-fill)',
    color: 'var(--on-accent-fill)',
    border: 'none',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.22), ' +
      '0 1px 2px rgba(0,0,0,0.20), ' +
      '0 8px 18px color-mix(in srgb, var(--accent) 30%, transparent)',
  },
  secondary: {
    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.04), ' +
      '0 1px 2px rgba(0,0,0,0.20)',
  },
  ghost: {
    background: 'transparent',
    color: TEXT_SECONDARY,
    border: '1px solid var(--border)',
    boxShadow: 'none',
  },
  danger: {
    background: 'color-mix(in srgb, var(--danger) 14%, transparent)',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 32%, transparent)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.05), ' +
      '0 1px 2px rgba(0,0,0,0.20)',
  },
}

export default function TactileButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  onClick,
  disabled = false,
  type = 'button',
  style,
  children,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.secondary
  const padY = size === 'lg' ? 16 : size === 'sm' ? 10 : 14
  const padX = size === 'lg' ? 22 : size === 'sm' ? 14 : 18
  const fontSize = size === 'lg' ? 15 : size === 'sm' ? 13 : 14
  const minH = size === 'lg' ? 52 : size === 'sm' ? 38 : 48

  const composed = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: `${padY}px ${padX}px`,
    borderRadius: R.md,
    fontSize,
    fontWeight: 700,
    letterSpacing: '-0.1px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    minHeight: minH,
    opacity: disabled ? 0.5 : 1,
    transition: tapTransition,
    width: fullWidth ? '100%' : undefined,
    color: TEXT_PRIMARY,
    ...v,
    ...tapResetStyle,
    ...style,
  }

  const handlers = disabled
    ? {}
    : {
        onClick,
        onPointerDown: (e) => {
          e.currentTarget.style.transform = 'scale(0.97)'
          e.currentTarget.style.transition = `transform ${SPRING.durFast} ${SPRING.gentle}`
        },
        onPointerUp:    (e) => { e.currentTarget.style.transform = 'scale(1)' },
        onPointerLeave: (e) => { e.currentTarget.style.transform = 'scale(1)' },
        onPointerCancel:(e) => { e.currentTarget.style.transform = 'scale(1)' },
      }

  return (
    <button type={type} disabled={disabled} style={composed} {...handlers} {...rest}>
      {icon}
      <span>{children}</span>
      {iconRight}
    </button>
  )
}
