/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * CountUp — animate a number to its value with an ease-out curve, the
 * "instrument settling" microinteraction. Pairs with the app's global
 * tabular-numeral setting so digits don't reflow mid-count, and honors
 * prefers-reduced-motion (snaps straight to the final value).
 *
 *   <CountUp value={82} />            → counts 0 → 82
 *   <CountUp value={1.4} decimals={1} />
 *   <CountUp value={1180} format={n => n.toLocaleString()} />
 */

import { useEffect, useRef, useState } from 'react'

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

// Animate from the previous settled value (0 on first mount) to `value`.
// Non-numeric values pass through untouched. Returns the live display
// number (or the raw value when non-numeric).
export function useCountUp(value, { duration = 800 } = {}) {
  const [display, setDisplay] = useState(() => (isNum(value) ? (prefersReducedMotion() ? value : 0) : value))
  const fromRef = useRef(isNum(value) ? 0 : value)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!isNum(value)) { setDisplay(value); return undefined }
    if (duration <= 0 || prefersReducedMotion()) { setDisplay(value); fromRef.current = value; return undefined }
    const from = isNum(fromRef.current) ? fromRef.current : 0
    let start = null
    const tick = (ts) => {
      if (start == null) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (value - from) * eased)
      if (p < 1) { rafRef.current = requestAnimationFrame(tick) }
      else { fromRef.current = value }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return display
}

export default function CountUp({ value, duration, decimals = 0, format }) {
  const n = useCountUp(value, { duration })
  if (!isNum(n)) return <>{value}</>
  const out = decimals > 0 ? Number(n).toFixed(decimals) : Math.round(n)
  return <>{format ? format(out) : out}</>
}
