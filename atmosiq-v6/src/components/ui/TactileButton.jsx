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

import { tapResetStyle, tapTransition, pressInTransition, pressOutTransition, PRESS_SCALE, prefersReducedMotion } from '../../styles/soft-glass'
import { R, TEXT_PRIMARY, TEXT_SECONDARY } from '../../styles/tokens'

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

export default function TactileButton({
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
  // iOS-26 "liquid glass" surface. When set, the button adopts the global
  // .bubble-btn class (token-driven glass + radial sheen + cyan tap-glow +
  // CSS press/hover/focus), tinted per-variant via --bubble-* custom
  // properties. The JS transform press is dropped so CSS :active owns it.
  bubble = false,
  className,
  style,
  children,
  ...rest
}) {
  const v = VARIANT[variant] || VARIANT.secondary
  const padY = size === 'lg' ? 16 : size === 'sm' ? 10 : 14
  const padX = size === 'lg' ? 22 : size === 'sm' ? 14 : 18
  const fontSize = size === 'lg' ? 15 : size === 'sm' ? 13 : 14
  const minH = size === 'lg' ? 52 : size === 'sm' ? 38 : 48

  // Per-variant bubble tint — only the fill colour + glow change; the glass
  // structure (border, shadow, sheen, press) is shared. ghost falls through
  // to the neutral --bubble-* token defaults.
  const bubbleVars = bubble ? { ...(BUBBLE_TINT[variant] || {}), '--bubble-radius': `${pill ? 999 : R.md}px` } : null

  const composed = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: `${padY}px ${padX}px`,
    fontSize,
    fontWeight: 700,
    letterSpacing: '-0.1px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    minHeight: minH,
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : undefined,
    // Bubble mode: the .bubble-btn class owns radius/surface/transition; keep
    // only the variant TEXT colour. Classic mode: inline radius + variant
    // surface + tap transition as before.
    ...(bubble
      ? { color: v.color || TEXT_PRIMARY, ...bubbleVars }
      : { borderRadius: pill ? R.pill : R.md, transition: tapTransition, color: TEXT_PRIMARY, ...v }),
    ...tapResetStyle,
    ...style,
  }

  // Haptic default by variant: real-intent buttons buzz lightly,
  // ghost/cancel stays silent. `haptic={false}` overrides; an explicit
  // string overrides too.
  const hapticKind = haptic === false
    ? null
    : (haptic || (variant === 'ghost' ? null : 'light'))

  // Fluid press (iOS-26 "liquid" tap): the surface tracks the finger down
  // near-instantly, then springs back with a slight overshoot on release.
  // Reduced-motion users get an instant scale (feedback without the spring).
  const reduced = prefersReducedMotion()
  const pressDown = (e) => {
    e.currentTarget.style.transition = reduced ? 'none' : pressInTransition
    e.currentTarget.style.transform = `scale(${PRESS_SCALE})`
  }
  const pressUp = (e) => {
    e.currentTarget.style.transition = reduced ? 'none' : pressOutTransition
    e.currentTarget.style.transform = 'scale(1)'
  }

  const handlers = disabled
    ? {}
    : bubble
    ? { onClick, onPointerDown: () => fireHaptic(hapticKind) }
    : {
        onClick,
        onPointerDown: (e) => { pressDown(e); fireHaptic(hapticKind) },
        onPointerUp:    pressUp,
        onPointerLeave: pressUp,
        onPointerCancel:pressUp,
      }

  const cls = [bubble ? 'bubble-btn' : '', className].filter(Boolean).join(' ') || undefined

  return (
    <button type={type} disabled={disabled} className={cls} style={composed} {...handlers} {...rest}>
      {icon}
      <span>{children}</span>
      {iconRight}
    </button>
  )
}

// Per-variant bubble tint (custom properties consumed by .bubble-btn).
const BUBBLE_TINT = {
  primary: {
    '--bubble-bg': 'linear-gradient(180deg, var(--accent-fill), color-mix(in srgb, var(--accent-fill) 82%, #001417))',
    '--bubble-glow': 'rgba(57,192,217,0.42)',
    '--bubble-border': 'color-mix(in srgb, var(--accent-fill) 55%, transparent)',
  },
  secondary: {
    '--bubble-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--accent) 7%, transparent))',
    '--bubble-glow': 'rgba(57,192,217,0.34)',
    '--bubble-border': 'color-mix(in srgb, var(--accent) 34%, transparent)',
  },
  danger: {
    '--bubble-bg': 'linear-gradient(180deg, color-mix(in srgb, var(--danger) 22%, transparent), color-mix(in srgb, var(--danger) 8%, transparent))',
    '--bubble-glow': 'rgba(239,68,68,0.34)',
    '--bubble-border': 'color-mix(in srgb, var(--danger) 34%, transparent)',
  },
  ghost: {},
}
