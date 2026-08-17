/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperFloatingButton — the AtmosFlow AI launcher, detached from the
 * bottom dock and free to sit anywhere on screen.
 *
 *   • Liquid-glass circular pill (matches AtmosFlowFloatingDock material),
 *     dark glass in dark mode, white capsule in light mode.
 *   • Instagram-style scroll response: full size at the top / when
 *     scrolling up, shrinks while scrolling down so it stays out of the
 *     way while reading, then grows back. Calms under reduced-motion.
 *   • Breathing accent glow so the assistant reads as "alive".
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
    '@keyframes jfbBreathe{0%,100%{opacity:.4;transform:translate(-50%,-50%) scale(.84) rotate(0deg)}50%{opacity:.9;transform:translate(-50%,-50%) scale(1.26) rotate(180deg)}}' +
    '.jfb-btn:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent), 0 8px 28px rgba(0,0,0,0.34)!important;}' +
    // Light mode: flip the dark glass to a white capsule, matching the dock.
    '[data-theme="light"] .jfb-btn{background:rgba(255,255,255,0.92)!important;border-color:rgba(15,23,42,0.10)!important;box-shadow:0 0 0 1px rgba(15,23,42,0.09),0 2px 8px rgba(15,23,42,0.18),0 10px 24px rgba(15,23,42,0.24),inset 0 1px 0 rgba(255,255,255,0.7)!important;}' +
    '@media (prefers-reduced-motion: reduce){.jfb-glow{animation:none!important}.jfb-btn{transition:none!important}}'
  document.head.appendChild(s)
}

export default function JasperFloatingButton({ onClick, active, label = 'AtmosFlow AI', bottomOffset = 78 }) {
  // Instagram-style scroll response: shrink while scrolling down, grow back
  // when scrolling up or near the top.
  const [shrunk, setShrunk] = useState(false)
  const lastY = useRef(0)
  const rafRef = useRef(0)
  useEffect(() => {
    const apply = () => {
      rafRef.current = 0
      const y = window.scrollY || document.documentElement.scrollTop || 0
      if (y < 56) setShrunk(false)
      else if (y > lastY.current + 4) setShrunk(true)   // scrolling down
      else if (y < lastY.current - 4) setShrunk(false)  // scrolling up
      lastY.current = y
    }
    const onScroll = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(apply) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const size = shrunk ? 46 : 60
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
        // No visible ring: transparent border keeps the 1px geometry (so the
        // light-mode hairline override still applies) without the white outline.
        border: '1px solid transparent',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(14px) saturate(200%)',
        WebkitBackdropFilter: 'blur(14px) saturate(200%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.10)',
        // Only size animates. left/top are deliberately untransitioned so the
        // button tracks the pointer exactly instead of easing behind it.
        transition: 'width 280ms cubic-bezier(.22,1,.36,1), height 280ms cubic-bezier(.22,1,.36,1)',
        WebkitTapHighlightColor: 'transparent',
        // Dragging needs the browser to NOT claim the gesture for scroll/pan.
        touchAction: 'none',
      }}
    >
      <span
        aria-hidden="true"
        className="jfb-glow"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: size,
          height: size,
          borderRadius: '50%',
          pointerEvents: 'none',
          // Base centering transform so the glow stays put even when the
          // breathe animation is disabled under reduced-motion (the keyframe
          // otherwise owns the translate).
          transform: 'translate(-50%, -50%)',
          // Two-tone aura — cyan ↔ purple swept around the disc (conic), then
          // faded to nothing at the edge with a radial mask so it still reads as
          // a soft glow, not a hard ring. Cyan at both ends of the sweep so the
          // 0°/360° wrap is seamless. The brain glyph itself stays neon cyan.
          background: 'conic-gradient(from 0deg, #22E0F2, #A855F7, #22E0F2)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 36%, transparent 72%)',
          maskImage: 'radial-gradient(circle, #000 0%, #000 36%, transparent 72%)',
          // Slower, calmer breathe — cool but not distracting.
          animation: 'jfbBreathe 5.4s ease-in-out infinite',
        }}
      />
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <JasperBrainIcon size={glyph} />
      </span>
    </button>
  )
}
