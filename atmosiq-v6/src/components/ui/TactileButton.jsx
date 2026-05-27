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

import { forwardRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { SPRING, tapResetStyle } from '../../styles/soft-glass'
import { R, TEXT_PRIMARY, TEXT_SECONDARY } from '../../styles/tokens'
import { tapFeelProps } from '../../styles/spring-motion'

// Lightweight haptic firing — duration pattern matches MobileApp.jsx's
// local haptic() helper so taps across the app feel consistent. Wrapped
// in try/catch because navigator.vibrate throws on iOS Safari outside
// of a user gesture (it's a no-op on iOS PWAs but still safe to call).
const fireHaptic = (kind) => {
  try {
    if (!kind) return
    if (typeof navigator === 'undefined' || !navigator.vibrate) return
    const pattern =
      kind === 'heavy'   ? [30, 20, 30] :
      kind === 'success' ? [10, 30, 10, 30, 10] :
      12
    navigator.vibrate(pattern)
  } catch { /* swallow — vibrate is best-effort on web */ }
}

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

// Same as soft-glass `tapTransition` but WITHOUT `transform` — Motion now
// owns the scale animation, so a CSS transition on transform would fight it.
const TRANSITION_NO_TRANSFORM = `opacity ${SPRING.durFast} ${SPRING.gentle}, background ${SPRING.durMed} ${SPRING.settle}, border-color ${SPRING.durMed} ${SPRING.settle}, box-shadow ${SPRING.durMed} ${SPRING.settle}`

const TactileButton = forwardRef(function TactileButton({
  variant = 'secondary',
  size = 'md',
  // Pill shape — fully-rounded ends (R.pill) instead of the default
  // R.md corner. Used for compact, badge-like action CTAs.
  pill = false,
  icon,
  iconRight,
  fullWidth = false,
  onClick,
  disabled = false,
  type = 'button',
  // Haptic pattern fired on press. Defaults to 'light' for primary/
  // secondary actions where the button represents real intent;
  // `ghost` variant defaults to no haptic since it's used for
  // cancel/dismiss and a buzz on those reads as overwrought.
  // Pass haptic={false} to silence; pass 'heavy' or 'success' for
  // confirmatory taps (e.g. "Issue report under documented judgment").
  haptic,
  style,
  children,
  ...rest
}, ref) {
  const reduced = useReducedMotion()
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
    borderRadius: pill ? R.pill : R.md,
    fontSize,
    fontWeight: 700,
    letterSpacing: '-0.1px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    minHeight: minH,
    opacity: disabled ? 0.5 : 1,
    transition: TRANSITION_NO_TRANSFORM,
    width: fullWidth ? '100%' : undefined,
    color: TEXT_PRIMARY,
    ...v,
    ...tapResetStyle,
    ...style,
  }

  // Haptic default by variant: real-intent buttons buzz lightly,
  // ghost/cancel stays silent. `haptic={false}` overrides; an explicit
  // string overrides too.
  const hapticKind = haptic === false
    ? null
    : (haptic || (variant === 'ghost' ? null : 'light'))

  // Motion owns the press/hover scale now (whileTap/whileHover + spring).
  // We keep only the click + the existing per-variant haptic on pointerdown.
  const handlers = disabled
    ? {}
    : {
        onClick,
        onPointerDown: () => fireHaptic(hapticKind),
      }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      style={composed}
      {...(disabled ? {} : tapFeelProps(reduced))}
      {...handlers}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {iconRight}
    </motion.button>
  )
})

export default TactileButton
