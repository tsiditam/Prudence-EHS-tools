/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperFloatingButton — the AtmosFlow AI launcher, detached from the
 * bottom dock and free to sit anywhere on screen.
 *
 *   • Flat circular control in the dock's material (card tone, hairline
 *     edge, lifted shadow) — theme tokens carry the light-mode flip.
 *   • Instagram-style scroll response: full size at the top / when
 *     scrolling up, shrinks while scrolling down so it stays out of the
 *     way while reading, then grows back. The app scrolls inside
 *     `.af-content-surface` (a fixed, overflow-y:auto element), not the
 *     window, so the listener watches every scroll target — a
 *     window-only listener never fired and the launcher sat full-size
 *     over the text it was meant to clear. Calms under reduced-motion.
 *   • The measured glass (see --glass-* in index.html): a 48px disc, the
 *     translucent fill, a 1px edge, no shadow, the cyan brain mark as the
 *     one identity color. The breathing two-tone aura it used to carry was
 *     retired in the 2026-09 chrome pass so the launcher, the dock and the
 *     header controls are one material — the AI is marked by its glyph.
 *   • Draggable anywhere in the viewport. It rests at the bottom-right
 *     until the user moves it; from then on the chosen spot is remembered
 *     (localStorage) and re-clamped on resize so a rotation or a smaller
 *     window can never strand it off-screen.
 */
import { useEffect, useRef, useState } from 'react'
import JasperBrainIcon from './JasperBrainIcon'
import { KEYS } from '../utils/storageKeys'

// Keep-on-screen inset used when clamping a dragged position.
const EDGE_MARGIN = 8
// Pointer travel (px) that turns a tap into a drag, so moving the button
// never also opens the assistant.
const DRAG_THRESHOLD = 4

// Position is read/written synchronously: STO is async, and awaiting it
// would paint the button at the default corner first and jump afterwards.
function readStoredPos() {
  try {
    const raw = window.localStorage.getItem(KEYS.jasperButtonPos)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y }
  } catch { /* private mode / quota / malformed — fall back to the anchor */ }
  return null
}

function writeStoredPos(pos) {
  try { window.localStorage.setItem(KEYS.jasperButtonPos, JSON.stringify(pos)) } catch { /* no-op */ }
}

/** Hold a position inside the viewport, whatever the button's current size. */
export function clampToViewport(pos, size, vw, vh) {
  // On a viewport narrower than the button plus both margins the max bound
  // falls below the min; Math.max wins that tie and keeps it visible.
  const maxX = Math.max(EDGE_MARGIN, vw - size - EDGE_MARGIN)
  const maxY = Math.max(EDGE_MARGIN, vh - size - EDGE_MARGIN)
  return {
    x: Math.min(Math.max(EDGE_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, pos.y), maxY),
  }
}

if (typeof document !== 'undefined' && !document.getElementById('jfb-style')) {
  const s = document.createElement('style')
  s.id = 'jfb-style'
  s.textContent =
    '.jfb-btn:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent)!important;}' +
    '@media (hover: hover) and (pointer: fine){.jfb-btn:hover{background:var(--glass-fill-hover)!important;}}' +
    '@media (prefers-reduced-motion: reduce){.jfb-btn{transition:none!important}}'
  document.head.appendChild(s)
}

// The vertical offset of whatever just scrolled: an element's scrollTop,
// or the window's scrollY when the document itself scrolls.
//
// Held to the scroller's real range. An iOS rubber-band bounce reports
// offsets past either end while the content springs back — on a page
// that does not scroll at all, pulling it up read as "scrolling down"
// and then "scrolling up" within one gesture, so the launcher shrank and
// grew mid-bounce and its aura tore. A bounce is not a scroll. A document
// that has not been laid out (scrollHeight 0) reports no range and is
// left alone.
export function scrollOffsetOf(target) {
  const isElement = target && typeof target.scrollTop === 'number' && target !== document
  const el = isElement ? target : document.documentElement
  const y = isElement ? target.scrollTop : (window.scrollY || el.scrollTop || 0)
  if (!(el.scrollHeight > 0)) return Math.max(0, y)
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  return Math.min(Math.max(0, y), max)
}

export default function JasperFloatingButton({ onClick, active, label = 'AtmosFlow AI', bottomOffset = 78 }) {
  // Instagram-style scroll response: shrink while scrolling down, grow back
  // when scrolling up or near the top.
  const [shrunk, setShrunk] = useState(false)
  const lastY = useRef(0)
  const rafRef = useRef(0)
  const pendingY = useRef(0)
  useEffect(() => {
    const apply = () => {
      rafRef.current = 0
      const y = pendingY.current
      if (y < 56) setShrunk(false)
      else if (y > lastY.current + 4) setShrunk(true)   // scrolling down
      else if (y < lastY.current - 4) setShrunk(false)  // scrolling up
      lastY.current = y
    }
    const onScroll = (e) => {
      pendingY.current = scrollOffsetOf(e.target)
      if (!rafRef.current) rafRef.current = requestAnimationFrame(apply)
    }
    // Scroll events do not bubble, so a listener on the window only hears
    // the document scrolling. The app's content scrolls inside a fixed
    // element; the capture-phase listener on the document hears that one
    // (and any other scroll container), and the window listener keeps the
    // document-scroll case. The two never fire for the same event.
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('scroll', onScroll, { capture: true })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const size = shrunk ? 40 : 48
  const glyph = shrunk ? 17 : 22

  // Free placement. `pos` is null until the user drags: that keeps the
  // original bottom-right anchor (and its safe-area math) as the resting
  // state, and only switches to absolute left/top once a spot is chosen.
  const [pos, setPos] = useState(readStoredPos)
  // `size` is read inside pointer/resize handlers that are registered once,
  // so mirror it in a ref rather than resubscribing on every shrink/grow.
  const sizeRef = useRef(size)
  sizeRef.current = size

  // A stored spot can be off-screen after a rotation or a window resize —
  // re-clamp rather than leaving the launcher unreachable.
  useEffect(() => {
    const onResize = () => {
      setPos((cur) => (cur ? clampToViewport(cur, sizeRef.current, window.innerWidth, window.innerHeight) : cur))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  // Grab offset keeps the button under the exact point that was pressed,
  // instead of snapping its corner to the pointer on the first move.
  const drag = useRef({ active: false, grabX: 0, grabY: 0, startX: 0, startY: 0, moved: false })
  const onPointerDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = {
      active: true,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d.active) return
    if (!d.moved) {
      const travel = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      if (travel <= DRAG_THRESHOLD) return   // still a tap — don't detach from the anchor
      d.moved = true
    }
    setPos(clampToViewport(
      { x: e.clientX - d.grabX, y: e.clientY - d.grabY },
      sizeRef.current, window.innerWidth, window.innerHeight,
    ))
  }
  const endDrag = (e) => {
    const wasDragging = drag.current.active && drag.current.moved
    drag.current.active = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
    // Persist only a deliberate move, so a stray tap never rewrites the spot.
    if (wasDragging) setPos((cur) => { if (cur) writeStoredPos(cur); return cur })
  }
  const handleClick = (e) => {
    // Suppress the tap action if the pointer was dragged.
    if (drag.current.moved) { e.preventDefault(); return }
    onClick?.(e)
  }

  // Placed: absolute viewport coordinates. Unplaced: the original anchor,
  // floating above the bottom dock (mobile) or near the bottom-right edge
  // (desktop), clearing the safe-area inset.
  const placement = pos
    ? { left: pos.x, top: pos.y }
    : { right: 16, bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)` }

  return (
    <button
      type="button"
      className="jfb-btn"
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      style={{
        position: 'fixed',
        ...placement,
        zIndex: 101,
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        cursor: 'pointer',
        // The same glass as the dock and the header controls.
        border: '1px solid var(--glass-edge)',
        background: 'var(--glass-fill)',
        backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: 'none',
        // Only size animates. left/top are deliberately untransitioned so the
        // button tracks the pointer exactly instead of easing behind it.
        transition: 'width var(--dur-enter) var(--ease-out), height var(--dur-enter) var(--ease-out), background var(--dur-fast) ease',
        WebkitTapHighlightColor: 'transparent',
        // Dragging needs the browser to NOT claim the gesture for scroll/pan.
        touchAction: 'none',
      }}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <JasperBrainIcon size={glyph} />
      </span>
    </button>
  )
}
