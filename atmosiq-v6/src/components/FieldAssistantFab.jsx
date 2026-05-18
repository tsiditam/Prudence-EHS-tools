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
 *
 * Iconography: a computer-monitor mark stroked in an Apple-Intelligence-
 * style warm-to-cool gradient (pink → purple → blue → cyan) on a neutral
 * card background. The gradient is what reads as "AI here" — the brand-
 * cyan invariant lives in the chat sheet itself, not on the launcher.
 * Icons.jsx can't carry a gradient (its single `c` prop maps to
 * currentColor), so the SVG is inlined here with its own <defs>.
 */

const AI_GRAD_ID = 'fa-ai-gradient'

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
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        <defs>
          <linearGradient id={AI_GRAD_ID} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5F7A" />
            <stop offset="33%" stopColor="#A26BFF" />
            <stop offset="66%" stopColor="#3D8BFF" />
            <stop offset="100%" stopColor="#27D2FF" />
          </linearGradient>
        </defs>
        <rect
          x="2.5"
          y="3.5"
          width="19"
          height="13"
          rx="2"
          ry="2"
          stroke={`url(#${AI_GRAD_ID})`}
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <line
          x1="12"
          y1="16.5"
          x2="12"
          y2="20.5"
          stroke={`url(#${AI_GRAD_ID})`}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <line
          x1="8"
          y1="20.5"
          x2="16"
          y2="20.5"
          stroke={`url(#${AI_GRAD_ID})`}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M12 6.4 L12.85 8.95 L15.4 9.8 L12.85 10.65 L12 13.2 L11.15 10.65 L8.6 9.8 L11.15 8.95 Z"
          fill={`url(#${AI_GRAD_ID})`}
        />
      </svg>
    </button>
  )
}
