/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperFloatingButton — the AtmosFlow AI launcher, detached from the
 * bottom dock and floated against the right edge of the page.
 *
 *   • Liquid-glass circular pill (matches AtmosFlowFloatingDock material),
 *     dark glass in dark mode, white capsule in light mode.
 *   • Instagram-style scroll response: full size at the top / when
 *     scrolling up, shrinks while scrolling down so it stays out of the
 *     way while reading, then grows back. Calms under reduced-motion.
 *   • Breathing accent glow so the assistant reads as "alive".
 */
import { useEffect, useRef, useState } from 'react'
import JasperBrainIcon from './JasperBrainIcon'

// How far the button can be dragged up/down from its resting spot (~1cm).
const DRAG_RANGE = 38

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

export default function JasperFloatingButton({ onClick, active, label = 'AtmosFlow AI' }) {
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

  // Vertical drag: let the user nudge the button up/down by ~1cm (≈38px) each
  // way. We track a translateY offset and clamp it. A small move threshold
  // distinguishes a drag from a tap so dragging doesn't fire onClick.
  const [dragY, setDragY] = useState(0)
  const drag = useRef({ active: false, startY: 0, startOffset: 0, moved: false })
  const onPointerDown = (e) => {
    drag.current = { active: true, startY: e.clientY, startOffset: dragY, moved: false }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d.active) return
    const dy = e.clientY - d.startY
    if (Math.abs(dy) > 4) d.moved = true
    const next = Math.max(-DRAG_RANGE, Math.min(DRAG_RANGE, d.startOffset + dy))
    setDragY(next)
  }
  const endDrag = (e) => {
    drag.current.active = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
  }
  const handleClick = (e) => {
    // Suppress the tap action if the pointer was dragged.
    if (drag.current.moved) { e.preventDefault(); return }
    onClick?.(e)
  }

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
        right: 16,
        // Float above the bottom dock, clearing the safe-area inset.
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
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
        // Drag offset (clamped ±~1cm). Size still animates; the drag follows
        // the pointer instantly.
        transform: `translateY(${dragY}px)`,
        transition: 'width 280ms cubic-bezier(.22,1,.36,1), height 280ms cubic-bezier(.22,1,.36,1)',
        WebkitTapHighlightColor: 'transparent',
        // Vertical drag needs the browser to NOT claim the gesture for scroll.
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
