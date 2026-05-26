/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * BottomSheet — mobile-first bottom-sheet modal primitive.
 *
 *   {open && (
 *     <BottomSheet title="Export report" onClose={() => setOpen(false)}>
 *       <button>Consultant Report</button>
 *       <button>Technical Report</button>
 *     </BottomSheet>
 *   )}
 *
 * UX:
 *   - Slides up from the bottom edge with a spring overshoot
 *   - Tap-dim backdrop dismisses; explicit close handle (drag bar)
 *     reinforces dismissibility on small screens
 *   - Respects iOS safe-area-inset at the bottom (home indicator)
 *   - Caps at 90vh; content scrolls inside if it overflows
 *   - Backdrop uses a backdrop-filter blur for the soft-glass system
 *
 * Props:
 *   open       boolean — visibility (consumer controls mount/unmount
 *              for the slide-out animation, or just mounts on demand)
 *   onClose    function
 *   title?     string — optional header label
 *   children   sheet content
 *   maxWidth?  number — caps sheet width on tablet (default 560)
 *   ariaLabel? string
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FLOATING_BAR_SHADOW, GLASS, RADII, SPRING } from '../../styles/soft-glass'
import { BORDER_DEFAULT, TEXT_PRIMARY } from '../../styles/tokens'

export default function BottomSheet({
  open = true,
  onClose,
  title,
  children,
  maxWidth = 560,
  ariaLabel,
}) {
  // Lock body scroll while the sheet is open. Keeps the underlying
  // page from drifting when the user swipes inside the sheet on iOS.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Esc to dismiss — desktop courtesy, no cost on touch.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // Portal to <body> so the sheet escapes any ancestor stacking context
  // (e.g. the app's content wrapper sits at zIndex:1, below the fixed
  // bottom nav at zIndex:100). Without this the sheet's zIndex:230 is
  // trapped inside that context and the nav paints over its footer CTA.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title || 'Sheet'}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 230,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: `sg-fade ${SPRING.durMed} ${SPRING.settle}`,
      }}
    >
      <div
        style={{
          ...GLASS.elevated,
          width: '100%',
          maxWidth,
          borderTopLeftRadius: RADII.sheet,
          borderTopRightRadius: RADII.sheet,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottom: 'none',
          padding: '12px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: FLOATING_BAR_SHADOW,
          animation: `sg-sheet-in ${SPRING.durSlow} ${SPRING.bounce}`,
          color: TEXT_PRIMARY,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: BORDER_DEFAULT,
            margin: '0 auto 14px',
          }}
        />
        {title && (
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            marginBottom: 4,
            letterSpacing: '-0.2px',
          }}>{title}</div>
        )}
        {children}

        <style>{`
          @keyframes sg-fade { from { opacity: 0 } to { opacity: 1 } }
          @keyframes sg-sheet-in {
            from { transform: translateY(24px); opacity: 0 }
            to   { transform: translateY(0);    opacity: 1 }
          }
          @media (prefers-reduced-motion: reduce) {
            [role="dialog"]       { animation: none !important }
            [role="dialog"] > div { animation: none !important }
          }
        `}</style>
      </div>

    </div>,
    document.body,
  )
}
