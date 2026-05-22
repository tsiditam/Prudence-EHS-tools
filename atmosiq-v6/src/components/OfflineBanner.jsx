/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * OfflineBanner — full-width amber banner that appears at the top of
 * the app when the browser reports offline. Sits ABOVE the existing
 * 48px-tall <header> so the offline state is impossible to miss
 * while still leaving the navigation chrome reachable.
 *
 * Reasoning: the previous offline handling was scattered — Jasper
 * inline error, ghost-text silent no-op, voice mic with no warning.
 * A single banner removes ambiguity: when this strip is visible, AI
 * features are degraded and any new mutations are queued for sync.
 * The PendingSyncIndicator already shows queue depth + last sync,
 * so this banner intentionally doesn't repeat that information.
 *
 * Auto-hides when the browser flips online. When the user has been
 * offline during the session, the banner briefly shows a green
 * "Back online — syncing" version (2.5s) before disappearing, so
 * the user can confirm sync resumed.
 */

import { useEffect, useState } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

const BACK_ONLINE_LINGER_MS = 2500

export default function OfflineBanner() {
  const { online, wasOffline } = useNetworkStatus()
  const [showBackOnline, setShowBackOnline] = useState(false)

  // When the network flips from offline → online, show the green
  // "Back online" confirmation for a short linger window so the
  // user gets feedback that sync resumed.
  useEffect(() => {
    if (online && wasOffline) {
      setShowBackOnline(true)
      const t = setTimeout(() => setShowBackOnline(false), BACK_ONLINE_LINGER_MS)
      return () => clearTimeout(t)
    }
    if (!online) setShowBackOnline(false)
    return undefined
  }, [online, wasOffline])

  if (online && !showBackOnline) return null

  const offline = !online
  const bg = offline ? 'var(--warn, #F59E0B)' : 'var(--success, #22C55E)'
  const fg = offline ? '#000' : '#fff'
  const label = offline ? 'Offline — changes will sync when reconnected.' : 'Back online — syncing.'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        zIndex: 110,
        background: bg,
        color: fg,
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        animation: 'offlineBannerIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {/* Dot indicator — pulses on the offline branch so it reads
          as "live state", not a static notice. */}
      <span
        aria-hidden="true"
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: fg,
          animation: offline ? 'offlinePulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <span>{label}</span>
      <style>{`
        @keyframes offlineBannerIn {
          from { transform: translateY(-100%); }
          to   { transform: translateY(0); }
        }
        @keyframes offlinePulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="offline-banner"] { animation: none !important; }
          [data-testid="offline-banner"] span[aria-hidden] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
