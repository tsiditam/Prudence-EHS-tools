/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * TextareaWithGhost — drop-in replacement for <textarea> that renders
 * Gmail-Smart-Compose-style ghost text inside the field. As the
 * assessor types, a debounced ghost completion appears in faded text
 * after the cursor. Tab (desktop) or the "Accept" pill (mobile)
 * applies the ghost.
 *
 *   <TextareaWithGhost
 *     value={notes}
 *     onChange={(e) => setNotes(e.target.value)}
 *     context={{ field: 'q.obs_notes', zone: 'A1' }}
 *     ghostEnabled
 *     style={...}
 *     placeholder="..."
 *     rows={3}
 *   />
 *
 * Implementation: a transparent textarea overlays a mirror <div>
 * that paints the user's typed text + the ghost suffix. The
 * textarea contributes the caret + selection; the mirror div
 * contributes the visible glyphs. Both layers share identical
 * font, line-height, padding, and box-sizing so they render in
 * perfect register.
 *
 * Mobile accept affordance: a small floating pill appears below
 * the textarea when a ghost is available — "Tap to insert"
 * pattern lifted from iOS keyboard suggestions. On desktop Tab
 * accepts; Esc dismisses.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useGhostText } from '../hooks/useGhostText'

const DEFAULT_GHOST_COLOR = 'var(--dim)'

const TextareaWithGhost = forwardRef(function TextareaWithGhost(
  {
    value,
    onChange,
    context,
    ghostEnabled = true,
    minLength,
    debounceMs,
    style = {},
    placeholder,
    rows,
    disabled,
    onFocus,
    onBlur,
    onKeyDown,
    ariaLabel,
    // The mirror div assumes the textarea's color, font, and
    // padding match the props we read out of `style`. If the
    // caller passes a custom font / padding shape, just pass it
    // through `style` and we'll mirror it.
    ghostColor = DEFAULT_GHOST_COLOR,
    ...rest
  },
  forwardedRef,
) {
  const taRef = useRef(null)
  const mirrorRef = useRef(null)
  useImperativeHandle(forwardedRef, () => taRef.current, [])

  // Caret-at-end gate: ghost is only meaningful when the user is
  // at the END of the text. If they cursor back to edit something
  // mid-string, we suppress the ghost so it doesn't appear in
  // surprising positions.
  const [caretAtEnd, setCaretAtEnd] = useState(true)
  const updateCaret = () => {
    const el = taRef.current
    if (!el) return
    const len = (el.value || '').length
    const pos = el.selectionStart
    setCaretAtEnd(pos === len)
  }

  const { ghost, loading, dismiss } = useGhostText({
    text: value || '',
    context,
    enabled: ghostEnabled && caretAtEnd && !disabled,
    minLength,
    debounceMs,
  })

  const showGhost = ghostEnabled && caretAtEnd && !disabled && ghost && ghost.length > 0

  // Sync mirror scroll to textarea scroll so long content stays
  // aligned. Without this, scrolling the textarea would offset
  // the mirror's painted text from the actual caret.
  const syncScroll = () => {
    if (mirrorRef.current && taRef.current) {
      mirrorRef.current.scrollTop = taRef.current.scrollTop
      mirrorRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  useEffect(() => {
    // Re-sync on value change (in case it grew enough to scroll).
    syncScroll()
    updateCaret()
  }, [value, ghost])

  const accept = () => {
    if (!showGhost) return
    const el = taRef.current
    const newVal = (value || '') + ghost
    // Synthesize an onChange event so the parent's state stays in
    // sync with the new value. Mirrors React's synthetic event
    // shape so callers using e.target.value Just Work.
    if (onChange) onChange({ target: { value: newVal } })
    dismiss()
    // Move caret to the end on next tick so the user can keep
    // typing. setTimeout because React hasn't committed the new
    // value yet.
    setTimeout(() => {
      if (el) {
        el.focus()
        const len = newVal.length
        el.setSelectionRange(len, len)
        updateCaret()
      }
    }, 0)
  }

  const handleKeyDown = (e) => {
    // Tab → accept (only when ghost is showing).
    if (e.key === 'Tab' && showGhost) {
      e.preventDefault()
      accept()
      return
    }
    // Escape → dismiss (only when ghost is showing).
    if (e.key === 'Escape' && showGhost) {
      e.preventDefault()
      dismiss()
      return
    }
    onKeyDown?.(e)
  }

  // The textarea is rendered semi-transparent so the caret + the
  // user's typed text both show through to the mirror layer.
  // CSS color: transparent kills the text; caret-color keeps the
  // I-beam visible. Selection still works — the textarea owns the
  // selection rectangle. This is the pattern Gmail uses for Smart
  // Compose on the web.
  const taStyle = useMemo(() => ({
    color: showGhost ? 'transparent' : (style.color || 'inherit'),
    caretColor: style.color || 'var(--text)',
    background: 'transparent',
    position: 'relative',
    zIndex: 2,
    ...style,
  }), [style, showGhost])

  // Mirror layer must match the textarea's box exactly. Same
  // padding, same font, same line-height, same border (transparent
  // so it doesn't double-draw). pointer-events: none lets the
  // textarea below catch all interactions.
  const mirrorStyle = useMemo(() => {
    const padding = style.padding || '0'
    const borderWidth = style.borderWidth || (style.border ? style.border.split(' ')[0] : '0')
    return {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      padding,
      border: `${borderWidth} solid transparent`,
      borderRadius: style.borderRadius,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily || 'inherit',
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight || 'inherit',
      letterSpacing: style.letterSpacing,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowY: 'hidden',
      color: style.color || 'inherit',
      boxSizing: style.boxSizing || 'border-box',
      zIndex: 1,
    }
  }, [style])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mirrorRef} aria-hidden="true" style={mirrorStyle}>
        {value || ''}
        {showGhost && (
          <span style={{ color: ghostColor, opacity: 0.7 }}>{ghost}</span>
        )}
        {/* Trailing space so the layout reserves the last line when
            the textarea ends with a newline. */}
        {'​'}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => { onChange?.(e); updateCaret() }}
        onFocus={(e) => { onFocus?.(e); updateCaret() }}
        onBlur={(e) => { onBlur?.(e); updateCaret() }}
        onKeyDown={handleKeyDown}
        onKeyUp={updateCaret}
        onClick={updateCaret}
        onSelect={updateCaret}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={ariaLabel}
        // aria-describedby would point at a live region announcing
        // the ghost — added once we wire screen-reader testing.
        style={taStyle}
        {...rest}
      />

      {/* Mobile accept pill — appears below the textarea while a
          ghost is available. Tap to insert; secondary "Dismiss" link
          to clear. The pill is suppressed on hover-capable devices
          where Tab is the canonical accept gesture (desktop). */}
      {showGhost && (
        <GhostAcceptPill
          ghost={ghost}
          onAccept={accept}
          onDismiss={dismiss}
          loading={loading}
        />
      )}
    </div>
  )
})

export default TextareaWithGhost

function GhostAcceptPill({ ghost, onAccept, onDismiss }) {
  return (
    <div
      // The pill is hidden on pointer-fine devices via CSS — Tab
      // is the canonical accept gesture there. On phones (coarse
      // pointer) we show the pill.
      style={{
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 8px 12px',
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
        borderRadius: 10,
        animation: 'ghostPillIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
      <span
        aria-hidden="true"
        style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
        AI
      </span>
      <span style={{
        fontSize: 13, color: 'var(--sub)', flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: 'italic',
      }}>
        {ghost.trim().slice(0, 80)}{ghost.length > 80 ? '…' : ''}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
        style={{
          background: 'transparent', border: 'none', color: 'var(--dim)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          padding: '4px 6px', flexShrink: 0,
        }}>
        Dismiss
      </button>
      <button
        type="button"
        onClick={onAccept}
        aria-label="Accept suggestion"
        style={{
          background: 'var(--accent-fill)', border: 'none',
          color: 'var(--on-accent-fill)', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          padding: '6px 12px', borderRadius: 8, flexShrink: 0,
          letterSpacing: '-0.1px',
        }}>
        Insert · Tab
      </button>
      <style>{`
        @keyframes ghostPillIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-ghost-pill] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
