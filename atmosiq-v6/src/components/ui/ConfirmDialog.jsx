/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ConfirmDialog — accessible replacement for `window.confirm`.
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   ...
 *   const ok = await confirm({
 *     title: 'Delete this template?',
 *     message: 'This cannot be undone.',
 *     confirmLabel: 'Delete', destructive: true,
 *   })
 *   ...
 *   return (<>{...}{confirmDialog}</>)
 *
 * Or render <ConfirmDialog open … onConfirm onCancel /> directly.
 *
 * Accessibility contract (pinned by tests/components/ConfirmDialog.test.tsx):
 *   • role="alertdialog", aria-modal, labelled by the title and described
 *     by the message;
 *   • focus moves into the dialog on open, Tab cycles inside it, and focus
 *     returns to the opener on close (useFocusTrap);
 *   • Escape and the backdrop cancel; Enter on the focused button acts;
 *   • the safe action (Cancel) takes initial focus when `destructive`.
 *
 * Visual language: the soft-glass elevated card, `TactileButton` for the
 * actions, danger tint for destructive confirms — the same surface as
 * BottomSheet so it reads as part of the app rather than a browser popup.
 */

import { useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FLOATING_BAR_SHADOW, GLASS, RADII, SPRING } from '../../styles/soft-glass'
import { TEXT_PRIMARY, TEXT_SECONDARY } from '../../styles/tokens'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import TactileButton from './TactileButton'

export default function ConfirmDialog({
  open = true,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  maxWidth = 380,
}) {
  const ref = useRef(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const titleId = useId()
  const descId = useId()

  useFocusTrap(ref, open, {
    // Destructive confirms start on the safe button; plain ones on the
    // affirmative so Enter answers the question the way a native confirm
    // does.
    initialFocus: () => (destructive ? cancelRef.current : confirmRef.current),
  })

  if (!open || typeof document === 'undefined') return null

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel?.() }
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: `sg-fade ${SPRING.durMed} ${SPRING.settle}`,
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={message ? descId : undefined}
        aria-label={!title ? 'Confirm' : undefined}
        style={{
          ...GLASS.elevated,
          width: '100%', maxWidth,
          borderRadius: RADII.sheet,
          padding: '20px 20px 16px',
          boxShadow: FLOATING_BAR_SHADOW,
          color: TEXT_PRIMARY,
        }}
      >
        {title && (
          <div id={titleId} style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px', marginBottom: message ? 8 : 16 }}>
            {title}
          </div>
        )}
        {message && (
          <div id={descId} style={{ fontSize: 13, lineHeight: 1.55, color: TEXT_SECONDARY, marginBottom: 18, whiteSpace: 'pre-line' }}>
            {message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <TactileButton ref={cancelRef} variant="ghost" onClick={() => onCancel?.()}>{cancelLabel}</TactileButton>
          <TactileButton ref={confirmRef} variant={destructive ? 'danger' : 'primary'} onClick={() => onConfirm?.()}>
            {confirmLabel}
          </TactileButton>
        </div>
        <style>{`
          @keyframes sg-fade { from { opacity: 0 } to { opacity: 1 } }
          @media (prefers-reduced-motion: reduce) { [role="alertdialog"] { animation: none !important } }
        `}</style>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Imperative confirm for event handlers: resolves true / false.
 * Returns [confirm, element] — render `element` once in the component.
 */
export function useConfirm() {
  const [pending, setPending] = useState(null)
  // The resolver lives in a ref, not in state: resolving a promise inside
  // a setState updater is a side effect (StrictMode runs updaters twice).
  const resolverRef = useRef(null)

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    // A second confirm while one is open answers the first with false.
    resolverRef.current?.(false)
    resolverRef.current = resolve
    setPending({ ...opts })
  }), [])

  const settle = (value) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setPending(null)
    resolve?.(value)
  }

  const element = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      destructive={!!pending.destructive}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return [confirm, element]
}
