/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Floating action button that opens Jasper — the in-app Indoor Air
 * Quality AI assistant chat sheet. Positioned bottom-right, above the
 * bottom tab bar (which lives at zIndex 100 and is 52px tall). The FAB
 * sits at zIndex 110 so it floats above the nav but stays below any
 * full-screen modals or the milestone overlay (zIndex 300).
 *
 * Iconography lives in JasperMonitorIcon — a filled computer-monitor
 * mark in an Apple-Intelligence-style gradient, with the screen cut
 * out to the surrounding surface color so it reads as a window
 * through the bezel. "Jasper" is the user-facing product name; the
 * internal component / hook / API / table names keep "FieldAssistant"
 * to avoid breaking shipped data and RLS.
 */

import JasperMonitorIcon from './JasperMonitorIcon'

export default function FieldAssistantFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open Jasper — Indoor Air Quality AI assistant"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        zIndex: 110,
        width: 52,
        height: 52,
        borderRadius: 26,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow:
          '0 8px 24px rgba(0,0,0,0.28), 0 1px 2px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.04) inset',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <JasperMonitorIcon size={32} />
    </button>
  )
}
