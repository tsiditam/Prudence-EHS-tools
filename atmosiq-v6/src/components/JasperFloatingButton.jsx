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

if (typeof document !== 'undefined' && !document.getElementById('jfb-style')) {
  const s = document.createElement('style')
  s.id = 'jfb-style'
  s.textContent =
    '@keyframes jfbBreathe{0%,100%{opacity:.4;transform:translate(-50%,-50%) scale(.82) rotate(0deg)}50%{opacity:.95;transform:translate(-50%,-50%) scale(1.3) rotate(180deg)}}' +
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

  return (
    <button
      type="button"
      className="jfb-btn"
      onClick={onClick}
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
        border: '1px solid rgba(255,255,255,0.24)',
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(14px) saturate(200%)',
        WebkitBackdropFilter: 'blur(14px) saturate(200%)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.10)',
        transition: 'width 280ms cubic-bezier(.22,1,.36,1), height 280ms cubic-bezier(.22,1,.36,1)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
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
          // Multi-colored aura — cyan → purple → orange swept around the disc
          // (conic), then faded to nothing at the edge with a radial mask so it
          // still reads as a soft glow, not a hard ring. The brain glyph itself
          // stays neon cyan; only this halo is multi-hue.
          background: 'conic-gradient(from 0deg, #22E0F2, #A855F7, #FF8A00, #22E0F2)',
          WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 36%, transparent 72%)',
          maskImage: 'radial-gradient(circle, #000 0%, #000 36%, transparent 72%)',
          animation: 'jfbBreathe 3.4s ease-in-out infinite',
        }}
      />
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <JasperBrainIcon size={glyph} />
      </span>
    </button>
  )
}
