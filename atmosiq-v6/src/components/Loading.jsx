/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * Loading — premium branded splash with animated AtmosFlow wind mark
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
      <svg
        width="64" height="64" viewBox="0 0 24 24"
        fill="none" stroke="#22D3EE" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: 0, animation: 'loadMarkIn 1s ease-out 0.3s forwards' }}
      >
        <path d="M17.7 7.7A2.5 2.5 0 1119 10H2" style={{ animation: 'waveFloat1 3s ease-in-out 1.2s infinite' }} />
        <path d="M9.6 4.6A2 2 0 1111 7H2" style={{ animation: 'waveFloat2 3s ease-in-out 1.5s infinite' }} />
        <path d="M12.6 19.4A2 2 0 1014 17H2" style={{ animation: 'waveFloat3 3s ease-in-out 1.8s infinite' }} />
      </svg>

      {/* Brand name — fades in after mark */}
      <div style={{
        marginTop: 20,
        fontSize: 18,
        fontWeight: 700,
        fontFamily: "'Outfit', system-ui, sans-serif",
        letterSpacing: '-0.3px',
        opacity: 0,
        animation: 'loadTextIn 0.8s ease-out 1s forwards',
      }}>
        <span style={{ color: '#ECEEF2' }}>Atmos</span>
        <span style={{ color: '#22D3EE' }}>Flow</span>
      </div>

      <style>{`
        @keyframes loadMarkIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes loadTextIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 0.9; transform: translateY(0); }
        }
        @keyframes waveFloat1 {
          0%, 100% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(2px); opacity: 0.7; }
        }
        @keyframes waveFloat2 {
          0%, 100% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(3px); opacity: 0.65; }
        }
        @keyframes waveFloat3 {
          0%, 100% { transform: translateX(0); opacity: 1; }
          50% { transform: translateX(1.5px); opacity: 0.75; }
        }
      `}</style>
    </div>
  )
}
