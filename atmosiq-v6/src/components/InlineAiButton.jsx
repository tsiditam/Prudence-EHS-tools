/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * InlineAiButton — drop-in "AI" button + bottom-sheet that runs a
 * single-shot rewrite action on the text of any textarea. Sized
 * to sit next to the existing VoiceInputButton inside the same
 * textarea wrapper.
 *
 *   <InlineAiButton
 *     text={value}                     // current textarea content
 *     onAccept={(newText) => setValue(newText)}
 *     context={{ zone: 'A1', kind: 'observation' }}  // optional
 *     size={36}
 *     ariaLabel="Rewrite with AI"
 *   />
 *
 * UX flow (modern AI-app pattern — Notion AI / Apple Writing Tools /
 * Linear AI):
 *   1. Tap the AI button → bottom sheet slides up with action chips
 *      (Improve, Expand, Make concise, Professional tone).
 *   2. Tap an action → sheet switches to a "Rewriting…" status with
 *      a small spinner; result streams in as the AI generates it.
 *   3. When done, the sheet shows the rewritten text with Accept /
 *      Reject. Accept replaces the textarea content via onAccept;
 *      Reject (or backdrop tap) dismisses with no change.
 *   4. While running, a Stop button is available (same idiom as the
 *      Jasper chat composer).
 *
 * The sheet renders into document.body via a fixed-position
 * backdrop so it sits above the rest of the surface regardless of
 * the textarea's container stacking context.
 */

import { useEffect, useState } from 'react'
import { useInlineAi, VALID_ACTIONS } from '../hooks/useInlineAi'

// Per-action presentation. Order in the picker UI matches this
// array. Icon glyphs are inline SVG path data so we don't depend
// on the I() icon font for this surface.
const ACTIONS = [
  {
    id: 'improve',
    label: 'Improve writing',
    sub: 'Polish grammar and clarity',
    glyph: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  },
  {
    id: 'expand',
    label: 'Expand',
    sub: 'Add reasonable detail',
    glyph: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
  },
  {
    id: 'concise',
    label: 'Make concise',
    sub: 'Trim filler, keep facts',
    glyph: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
  },
  {
    id: 'professional',
    label: 'Professional tone',
    sub: 'Consultant-grade language',
    glyph: 'M20 7h-3V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM9 4h6v3H9V4z',
  },
]

// Action label for the in-progress status row. Used both inside the
// sheet ("Rewriting your note…" sub-line) and as the screen-reader
// status when the spinner spins.
function statusLabel(actionId) {
  switch (actionId) {
    case 'improve': return 'Improving your note…'
    case 'expand': return 'Expanding your note…'
    case 'concise': return 'Tightening your note…'
    case 'professional': return 'Rewriting in professional tone…'
    default: return 'Rewriting…'
  }
}

export default function InlineAiButton({
  text,
  onAccept,
  context,
  size = 36,
  ariaLabel = 'Rewrite with AI',
  disabled = false,
  // Color tokens — defaults match the v3 surface but callers can
  // override (e.g. on a dark sheet vs a light wizard card).
  idleColor = 'var(--accent)',
  idleBorder = 'var(--border)',
}) {
  const [open, setOpen] = useState(false)
  const { running, action, result, error, run, stop, reset } = useInlineAi()

  const canTrigger = !disabled && typeof text === 'string' && text.trim().length > 0

  // Closing the sheet also resets the hook — otherwise re-opening
  // would show a stale result from the previous run.
  const close = () => {
    setOpen(false)
    reset()
  }

  const onPick = async (actId) => {
    await run({ action: actId, text, context })
  }

  // Esc to close. Useful on desktop / when a hardware keyboard is
  // attached on iPad. Mobile users dismiss via the backdrop.
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (running) stop()
        else close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, running, stop])

  const buttonStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    border: `1px solid ${idleBorder}`,
    background: 'transparent',
    color: canTrigger ? idleColor : 'var(--dim)',
    cursor: canTrigger ? 'pointer' : 'not-allowed',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    flexShrink: 0,
    opacity: canTrigger ? 1 : 0.5,
    WebkitTapHighlightColor: 'transparent',
    padding: 0,
  }

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        title={canTrigger ? ariaLabel : 'Type something first to use AI'}
        disabled={!canTrigger}
        onClick={(e) => { e.preventDefault(); if (canTrigger) setOpen(true) }}
        style={buttonStyle}>
        {/* Sparkle / wand icon. AI-action glyph used by Linear,
            Raycast, Apple Intelligence — universally read as
            "magic / AI" without needing the letters AI inside. */}
        <svg
          width={Math.round(size * 0.5)}
          height={Math.round(size * 0.5)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true">
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
          <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
          <path d="M5 16l.7 1.6L7.3 18l-1.6.7L5 20l-.7-1.6L2.7 18l1.6-.7L5 16z" />
        </svg>
      </button>

      {open && (
        <InlineAiSheet
          open={open}
          text={text}
          running={running}
          action={action}
          result={result}
          error={error}
          onPick={onPick}
          onStop={stop}
          onAccept={(newText) => { onAccept?.(newText); close() }}
          onClose={close}
        />
      )}
    </>
  )
}

/**
 * Bottom sheet UI. Three visual states:
 *   1. Picker      — running=false, result='', error=null
 *   2. In-progress — running=true (shows status + spinner + Stop)
 *   3. Result      — running=false, result.length > 0 (Accept / Reject)
 *   4. Error       — running=false, error != null (retry option)
 */
function InlineAiSheet({
  open, text, running, action, result, error,
  onPick, onStop, onAccept, onClose,
}) {
  const hasResult = !running && result && result.trim().length > 0
  const hasError = !running && !!error
  const showPicker = !running && !hasResult && !hasError

  // Lock body scroll while the sheet is open. iOS Safari otherwise
  // lets the page scroll under the backdrop which feels broken.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [open])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI rewrite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'inlineAiFade 160ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}>
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--surface)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          border: '1px solid var(--border)',
          borderBottom: 'none',
          padding: '14px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '78vh',
          overflowY: 'auto',
          boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
          animation: 'inlineAiSlide 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
        {/* Grabber bar — iOS bottom-sheet idiom. Visual only. */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border)',
          margin: '0 auto 14px',
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 12, marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
              {showPicker ? 'Rewrite with AI' : hasError ? 'Something went wrong' : hasResult ? 'Suggested rewrite' : statusLabel(action)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>
              {showPicker ? 'Pick how to transform your note.' : hasError ? error : null}
            </div>
          </div>
          {!running && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--sub)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                padding: '6px 4px',
              }}>
              Close
            </button>
          )}
        </div>

        {/* Original text preview — shown in picker + result states so
            the user can see what's being transformed. Truncated to
            stay compact. */}
        {(showPicker || hasResult) && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            marginBottom: 14,
            fontSize: 13, color: 'var(--sub)', lineHeight: 1.5,
            maxHeight: 80, overflow: 'hidden', position: 'relative',
          }}>
            <div style={{
              fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase',
              letterSpacing: '0.5px', fontWeight: 600, marginBottom: 4,
            }}>Original</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>
          </div>
        )}

        {/* ── Picker ───────────────────────────────────────────── */}
        {showPicker && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  minHeight: 56,
                  transition: 'background 0.12s, border-color 0.12s',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.background = 'var(--card)'
                }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg
                    width={16} height={16} viewBox="0 0 24 24"
                    fill="none" stroke="var(--accent)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={a.glyph} />
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{a.sub}</div>
                </div>
                <span style={{ color: 'var(--dim)', fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {/* ── In-progress ─────────────────────────────────────── */}
        {running && (
          <div style={{
            padding: '14px 16px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 12,
          }}>
            <span
              aria-hidden="true"
              style={{
                width: 14, height: 14, borderRadius: '50%',
                border: `2px solid var(--border)`,
                borderTopColor: 'var(--accent)',
                animation: 'inlineAiSpin 0.9s linear infinite',
                flexShrink: 0,
              }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {result ? (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {result}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--sub)', fontStyle: 'italic' }}>
                  {statusLabel(action)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              title="Stop"
              style={{
                width: 32, height: 32, borderRadius: 16,
                background: 'var(--accent-fill)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{
                display: 'block', width: 10, height: 10, borderRadius: 1,
                background: 'var(--on-accent-fill)',
              }} />
            </button>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────── */}
        {hasResult && (
          <>
            <div style={{
              padding: '12px 14px',
              background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              borderRadius: 12,
              marginBottom: 14,
              fontSize: 14, color: 'var(--text)', lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              <div style={{
                fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase',
                letterSpacing: '0.5px', fontWeight: 700, marginBottom: 6,
              }}>AI suggestion</div>
              {result}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: '12px 16px',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, color: 'var(--text)',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', minHeight: 44,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                Reject
              </button>
              <button
                type="button"
                onClick={() => onAccept(result)}
                style={{
                  flex: 1, padding: '12px 16px',
                  background: 'var(--accent-fill)', border: 'none',
                  borderRadius: 12, color: 'var(--on-accent-fill)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', minHeight: 44, letterSpacing: '-0.1px',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                Accept rewrite
              </button>
            </div>
          </>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {hasError && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 16px',
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, color: 'var(--text)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 44,
              }}>
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes inlineAiFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes inlineAiSlide {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes inlineAiSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important; }
          [role="dialog"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  )
}

export { VALID_ACTIONS }
