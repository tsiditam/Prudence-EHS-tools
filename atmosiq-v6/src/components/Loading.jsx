/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * Loading — minimal premium splash with Atmosflow wind mark
 */

import { useEffect } from 'react'

export default function Loading({ onDone, fast }) {
  useEffect(() => {
    const timer = setTimeout(onDone, fast ? 400 : 1800)
    return () => clearTimeout(timer)
  }, [onDone, fast])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <svg
        width="56" height="56" viewBox="0 0 24 24"
        fill="none" stroke="#22D3EE" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ opacity: 0, animation: 'loadFadeIn 0.8s ease-out 0.2s forwards' }}
      >
        <path d="M17.7 7.7A2.5 2.5 0 1119 10H2" />
        <path d="M9.6 4.6A2 2 0 1111 7H2" />
        <path d="M12.6 19.4A2 2 0 1014 17H2" />
      </svg>
      <style>{`
        @keyframes loadFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
