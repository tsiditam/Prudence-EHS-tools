/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Floating action button that opens the Field Assistant chat sheet.
 * Positioned bottom-right, above the bottom tab bar (which lives at
 * zIndex 100 and is 52px tall). The FAB sits at zIndex 110 so it
 * floats above the nav but stays below any full-screen modals or the
 * milestone overlay (zIndex 300).
 */

import { I } from './Icons'

export default function FieldAssistantFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open field assistant"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
        zIndex: 110,
        width: 52,
        height: 52,
        borderRadius: 26,
        background: 'var(--accent-fill)',
        border: 'none',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04) inset',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
      }}>
      <I n="sparkle" s={24} c="var(--on-accent-fill)" w={1.8} />
    </button>
  )
}
