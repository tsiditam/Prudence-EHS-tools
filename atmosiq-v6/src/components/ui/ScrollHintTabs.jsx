/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ScrollHintTabs — a horizontally-scrollable tab row (V3.tabRow) with a thin
 * scroll-progress bar underneath that appears only when the row overflows.
 * It's a subtle cue that more tabs exist off the right (or left) edge: the
 * thumb width reflects the visible fraction and slides with scroll position.
 * The scrollbar itself is hidden on the tabRow, so without this the overflow
 * is invisible.
 */
import { useRef, useState, useEffect, useCallback } from 'react'
import * as V3 from '../../styles/tokens'

export default function ScrollHintTabs({ children, id, style }) {
  const ref = useRef(null)
  const [hint, setHint] = useState({ overflow: false, frac: 1, pos: 0 })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 4) { setHint({ overflow: false, frac: 1, pos: 0 }); return }
    setHint({ overflow: true, frac: el.clientWidth / el.scrollWidth, pos: el.scrollLeft / max })
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return undefined
    el.addEventListener('scroll', update, { passive: true })
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(update); ro.observe(el) }
    return () => { el.removeEventListener('scroll', update); if (ro) ro.disconnect() }
  }, [update, children])

  // Thumb width = visible fraction (min 14% so it's grabbable-looking);
  // position interpolates between the left and right travel limits.
  const thumbW = Math.max(14, Math.round(hint.frac * 100))
  const thumbLeft = hint.pos * (100 - thumbW)

  return (
    <div style={style}>
      <div id={id} ref={ref} style={{ ...V3.tabRow, marginBottom: 0, scrollMarginTop: 80 }}>
        {children}
      </div>
      {hint.overflow && (
        <div aria-hidden="true" style={{ position: 'relative', height: 2, marginTop: 6, borderRadius: 2, background: 'var(--border)' }}>
          <div style={{ position: 'absolute', top: 0, height: 2, borderRadius: 2, width: `${thumbW}%`, left: `${thumbLeft}%`, background: 'var(--accent)', opacity: 0.55, transition: 'left .12s linear, width .12s linear' }} />
        </div>
      )}
    </div>
  )
}
