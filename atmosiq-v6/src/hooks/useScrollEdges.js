/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useScrollEdges — tells a horizontal strip whether it has content off
 * either edge, so it can fade there instead of guillotining a label.
 *
 * Why: the project filter chips and the segmented pill nav both scroll
 * sideways with the scrollbar hidden, and on a 393px phone the last item
 * lands half-cut at the frame edge — "Clo", "Assessm". A hard vertical
 * cut through a word reads as a layout bug rather than as "there is more
 * over here", so nobody scrolls, and the destinations past the fold go
 * unfound. A soft edge is how every shipping tab strip signals the same
 * thing.
 *
 * The fade is applied ONLY on a side that actually has overflow, which is
 * why this measures rather than masking unconditionally: a permanent
 * fade would dim the first chip on a strip that fits, and dim the last
 * one once you have scrolled to it — both of which say "more" when there
 * is none.
 *
 *   const { ref, maskStyle } = useScrollEdges()
 *   <div ref={ref} style={{ overflowX: 'auto', ...maskStyle }}>…</div>
 *
 * Re-measures on scroll, on resize, and when the strip's own size or
 * contents change (ResizeObserver on the element and its children), so
 * adding a filter or renaming a tab does not leave a stale fade.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** How far the fade reaches in from an overflowing edge. */
const FADE_PX = 32

/** Ignore sub-pixel scroll offsets; a 0.5px residue is not "scrolled". */
const EPS = 1

function maskFor(start, end) {
  if (!start && !end) return undefined
  const from = start ? `transparent 0, #000 ${FADE_PX}px` : '#000 0'
  const to = end ? `#000 calc(100% - ${FADE_PX}px), transparent 100%` : '#000 100%'
  return `linear-gradient(to right, ${from}, ${to})`
}

export function useScrollEdges() {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const x = el.scrollLeft
    setEdges((prev) => {
      const next = { start: x > EPS, end: max > EPS && x < max - EPS }
      return prev.start === next.start && prev.end === next.end ? prev : next
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      // Children too: a chip whose label changes width moves the edge
      // without resizing the scroller itself.
      for (const child of el.children) ro.observe(child)
    }
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const mask = maskFor(edges.start, edges.end)
  const maskStyle = mask
    ? { maskImage: mask, WebkitMaskImage: mask }
    : {}

  return { ref, maskStyle, edges, remeasure: measure }
}

export default useScrollEdges
