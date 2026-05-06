/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * Loading — AtmosFlow wordmark splash
 */

import { useEffect, useState } from 'react'

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
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        fontFamily: "'inherit', system-ui, sans-serif",
        letterSpacing: '-0.3px',
        color: '#ECEEF2',
        opacity: 0,
        animation: 'loadTextIn 0.8s ease-out 0.3s forwards',
      }}>
        AtmosFlow
      </div>

      <style>{`
        @keyframes loadTextIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 0.9; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
