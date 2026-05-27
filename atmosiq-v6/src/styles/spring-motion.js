/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * spring-motion — single source of truth for the Claude/Vercel tap feel.
 *
 * ── FEEL NOTES ───────────────────────────────────────────────────────
 * The values below are tuned for the Claude/Vercel feel: subtle scale,
 * snappy return, barely-there overshoot. Felt, not seen.
 *
 *   stiffness 500  → fast settle (the button snaps back quickly)
 *   damping 30     → near-critically-damped: minimal overshoot, no
 *                    cartoony bounce
 *   mass 0.5       → light, so the spring resolves fast
 *   scale 0.97     → the smallest press that still reads as tactile
 *   scale 1.02     → a barely-there hover grow (Vercel does both)
 *
 * Want to experiment?
 *   • Bouncier  → lower `damping` toward 20 (more overshoot).
 *   • Snappier  → raise `stiffness` toward 700 (faster, tighter).
 *   • More obvious press → drop TAP_SCALE toward 0.95.
 * Change them HERE and every button that uses this module updates.
 * ─────────────────────────────────────────────────────────────────────
 */

export const TAP_SPRING = { type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }
export const TAP_SCALE = 0.97
export const HOVER_SCALE = 1.02

/**
 * Motion props for the tap/hover spring feel. Honors reduced motion:
 * when `reduced` is true, returns {} so the element renders with no
 * animation (clicks + haptics still work).
 *
 * @param {boolean} reduced   from useReducedMotion()
 * @param {{ hover?: boolean }} [opts]  hover defaults to true; pass
 *                                      hover:false for touch-only controls
 * @returns motion props ({ whileTap, whileHover?, transition }) or {}
 */
export function tapFeelProps(reduced, { hover = true } = {}) {
  if (reduced) return {}
  return {
    whileTap: { scale: TAP_SCALE },
    ...(hover ? { whileHover: { scale: HOVER_SCALE } } : {}),
    transition: TAP_SPRING,
  }
}

/** Best-effort 5ms haptic tick for mobile browsers (no-op elsewhere). */
export function tapHaptic() {
  try { navigator.vibrate?.(5) } catch { /* vibrate is best-effort on web */ }
}
