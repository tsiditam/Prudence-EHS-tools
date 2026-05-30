/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * Loading — AtmosFlow brand splash.
 *
 * Renders the animated GIF at /AtmosFlow.gif (800×800 source) inside a
 * fixed full-screen overlay on the brand bg. Lifecycle preserved from
 * the previous wordmark-only implementation: 5 s hold by default,
 * 400 ms hold for returning users (`fast`), 600 ms fade-out at the
 * end. The GIF autoplays + loops natively in <img>; nothing to wire.
 *
 * Reduced-motion fallback: when the OS / browser is set to reduce
 * motion (prefers-reduced-motion: reduce), the GIF is suppressed and
 * the static "AtmosFlow" wordmark fades in instead. That respects the
 * vestibular-disorder accessibility request without removing the
 * brand moment entirely.
 *
 * Performance note: the GIF is 2.1 MB. On cold-cache cellular this can
 * be slow to first paint. <link rel="preload" as="image"
 * href="/AtmosFlow.gif"> in index.html could be added if first-load
 * delay becomes a complaint; for now we accept the trade-off because
 * (a) most opens are warm-cache after the first visit, and (b) the SW
 * precache primed by sw.js will pull the GIF into the app shell.
 */

import { useEffect, useState } from 'react'

const reducedMotion = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Loading({ onDone, fast }) {
  const [fadeOut, setFadeOut] = useState(false)
  const duration = fast ? 400 : 5000

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), duration - 600)
    const doneTimer = setTimeout(onDone, duration)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onDone, fast, duration])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#07080C',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 0.6s ease-out',
    }}>
      {reducedMotion ? (
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          fontFamily: "'Sora', 'Inter', system-ui, sans-serif",
          letterSpacing: '-0.045em',
          color: '#F5F7FA',
          opacity: 0,
          animation: 'loadTextIn 0.8s ease-out 0.3s forwards',
        }}>
          AtmosFlow
        </div>
      ) : (
        <img
          src="/AtmosFlow.gif"
          alt="AtmosFlow"
          style={{
            width: 'min(64vw, 360px)',
            height: 'auto',
            opacity: 0,
            animation: 'loadGifIn 0.8s ease-out 0.2s forwards',
            display: 'block',
          }}
        />
      )}

      <style>{`
        @keyframes loadTextIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 0.9; transform: translateY(0); }
        }
        @keyframes loadGifIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
