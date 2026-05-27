/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * VoiceCommandModal — fullscreen "hold to talk to Jasper" overlay.
 * Replaces the "voice → fills a textarea" idiom with the modern
 * "speak a question → routed to Jasper → answer streams back"
 * pattern (Siri / Granola / Apple Intelligence shape).
 *
 *   <VoiceCommandModal
 *     open={open}
 *     onCancel={close}
 *     onSubmit={(transcript) => routeToJasper(transcript)}
 *   />
 *
 * UX flow:
 *   1. Open → mic auto-starts, large pulsing accent ring around the
 *      mic glyph signals "listening".
 *   2. Live transcript appears as the user speaks (Web Speech API
 *      interim results).
 *   3. After ~2.2s of silence with at least one final phrase, the
 *      modal auto-submits — hands-free flow for the field. The
 *      assessor can also tap Send to commit immediately, or Cancel
 *      to discard.
 *   4. On submit, parent receives the transcript via onSubmit() and
 *      typically opens Jasper with initialMessage set.
 *
 * Wraps useVoiceTranscription — same hook the dictation buttons
 * use, so iOS Safari + Chrome + Edge all "just work" and Firefox
 * shows a graceful "unsupported" state.
 */

import { useEffect, useRef, useState } from 'react'
import { useVoiceTranscription, isVoiceTranscriptionSupported } from '../hooks/useVoiceTranscription'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

const SILENCE_AUTOSUBMIT_MS = 2200

export default function VoiceCommandModal({ open, onCancel, onSubmit }) {
  // Final transcripts accumulate here; interim is shown live but not
  // committed until the recognizer marks a phrase final.
  const [finalText, setFinalText] = useState('')
  const [silenceArmed, setSilenceArmed] = useState(false)
  const silenceTimer = useRef(null)
  const submittedRef = useRef(false)

  const supported = isVoiceTranscriptionSupported()
  // Voice command routes to Jasper, which requires network. The
  // Web Speech API itself uses cloud STT on most browsers too, so
  // there's no useful offline path. Detect offline early and show
  // a clear gating state instead of opening the mic only to have
  // the Jasper send fail.
  const { online } = useNetworkStatus()

  const { listening, interim, error, start, stop, abort } = useVoiceTranscription({
    continuous: true,
    onResult: (text) => {
      setFinalText((prev) => prev ? `${prev} ${text}` : text)
      setSilenceArmed(true)
    },
  })

  // Reset state + auto-start the mic when the modal opens. Tear
  // down + stop the mic when it closes.
  useEffect(() => {
    if (!open) return
    submittedRef.current = false
    setFinalText('')
    setSilenceArmed(false)
    // Defer start a tick so the modal is fully mounted before the
    // browser permission prompt fires (matters on iOS where the
    // prompt can briefly steal focus from the modal). Skip starting
    // entirely when offline — the Web Speech API uses cloud STT on
    // most browsers, and the downstream Jasper send needs network
    // anyway. The error state below surfaces the offline gate.
    const t = setTimeout(() => { if (supported && online) start() }, 50)
    return () => {
      clearTimeout(t)
      abort()
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current)
        silenceTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Silence detection. Each time a new final phrase arrives,
  // silenceArmed flips true and we (re)start a 2.2s timer. If no
  // new phrase arrives before it expires, auto-submit.
  useEffect(() => {
    if (!silenceArmed) return
    if (silenceTimer.current) clearTimeout(silenceTimer.current)
    silenceTimer.current = setTimeout(() => {
      if (finalText.trim()) submit()
    }, SILENCE_AUTOSUBMIT_MS)
    return () => {
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current)
        silenceTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silenceArmed, finalText, interim])

  // Esc to cancel. Useful on desktop + hardware-keyboard iPad.
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onCancel])

  // Lock body scroll behind the modal — iOS Safari otherwise lets
  // the page scroll under the backdrop and feels broken.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const submit = () => {
    if (submittedRef.current) return
    const text = (finalText + (interim ? (finalText ? ` ${interim}` : interim) : '')).trim()
    if (!text) return
    submittedRef.current = true
    stop()
    onSubmit?.(text)
  }

  if (!open) return null

  // Compose the live preview from final + interim so the user sees
  // their words building up as they speak. Final text in TEXT
  // color, interim suffix in DIM italic so they read the "not yet
  // committed" boundary.
  const hasText = (finalText.trim() + interim.trim()).length > 0
  // Only surface a failure when we genuinely captured nothing. A transient
  // recognizer error (e.g. network/aborted) that still yielded a transcript
  // must NOT read as "failed" — the user clearly got their words in.
  const showError = !hasText && (!supported || !online || (error && error !== 'no-speech'))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice command"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'color-mix(in srgb, var(--bg) 80%, rgba(0,0,0,0.6))',
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px calc(40px + env(safe-area-inset-bottom, 0px))',
        animation: 'vcmFade 160ms ease-out',
      }}>
      {/* Subtitle + close affordance on top */}
      <div style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: 16, right: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          fontSize: 11, color: 'var(--sub)', textTransform: 'uppercase',
          letterSpacing: '1px', fontWeight: 700,
        }}>
          Voice command
        </div>
        <button
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Cancel"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sub)', fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', padding: '8px 10px',
          }}>
          Cancel
        </button>
      </div>

      {/* Mic + listening pulse */}
      <div style={{
        position: 'relative',
        width: 168, height: 168,
        marginBottom: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {listening && (
          <>
            {/* Outer pulse ring */}
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid color-mix(in srgb, var(--accent) 40%, transparent)`,
              animation: 'vcmPulse 1.8s ease-out infinite',
            }} />
            {/* Inner pulse ring */}
            <div aria-hidden="true" style={{
              position: 'absolute', inset: 16, borderRadius: '50%',
              border: `2px solid color-mix(in srgb, var(--accent) 60%, transparent)`,
              animation: 'vcmPulse 1.8s ease-out 0.4s infinite',
            }} />
          </>
        )}
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: listening ? 'var(--accent-fill)' : 'var(--card)',
          border: `1px solid ${listening ? 'transparent' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: listening
            ? '0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)'
            : '0 4px 14px rgba(0,0,0,0.25)',
          transition: 'background 0.2s, box-shadow 0.2s',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24"
            fill="none"
            stroke={listening ? 'var(--on-accent-fill)' : 'var(--sub)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </div>
      </div>

      {/* Status line */}
      <div style={{
        fontSize: 13, color: 'var(--sub)', marginBottom: 14,
        textAlign: 'center', maxWidth: 480,
      }}>
        {showError ? (
          !online
            ? 'Voice commands need network. Reconnect and try again.'
            : !supported
              ? 'Voice commands are not supported in this browser.'
              : error === 'not-allowed'
                ? 'Microphone permission denied. Enable it in browser settings.'
                : 'Voice input failed — try again.'
        ) : listening ? (
          hasText ? 'Pause when done — I\'ll send automatically.' : 'Listening… speak your question.'
        ) : hasText ? 'Ready — tap Send, or the mic to add more.' : 'Tap the mic to retry.'}
      </div>

      {/* Live transcript */}
      <div style={{
        width: '100%', maxWidth: 560,
        minHeight: 100, padding: '18px 20px',
        background: 'var(--card)',
        border: `1px solid ${listening
          ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
          : 'var(--border)'}`,
        borderRadius: 16,
        boxShadow: listening
          ? `0 0 0 6px color-mix(in srgb, var(--accent) 8%, transparent)`
          : 'none',
        fontSize: 17, lineHeight: 1.5, color: 'var(--text)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        {hasText ? (
          <>
            <span>{finalText}</span>
            {interim && (
              <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>
                {finalText ? ' ' : ''}{interim}
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>
            Try: "What does ASHRAE 62.1 say about CO₂ in offices?"
          </span>
        )}
      </div>

      {/* Action row — Cancel + Send */}
      <div style={{
        marginTop: 24, display: 'flex', gap: 12,
        width: '100%', maxWidth: 560,
      }}>
        <button
          type="button"
          onClick={() => onCancel?.()}
          style={{
            flex: 1, padding: '14px 18px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 14, color: 'var(--text)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', minHeight: 48,
            WebkitTapHighlightColor: 'transparent',
          }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasText}
          style={{
            flex: 2, padding: '14px 18px',
            background: hasText ? 'var(--accent-fill)' : 'var(--card)',
            border: hasText ? 'none' : '1px solid var(--border)',
            borderRadius: 14,
            color: hasText ? 'var(--on-accent-fill)' : 'var(--dim)',
            fontSize: 14, fontWeight: 700, cursor: hasText ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', minHeight: 48, letterSpacing: '-0.1px',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.15s',
          }}>
          {hasText ? 'Send' : 'Speak to send'}
        </button>
      </div>

      <style>{`
        @keyframes vcmFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes vcmPulse {
          0%   { opacity: 0.9; transform: scale(0.85); }
          70%  { opacity: 0;   transform: scale(1.4); }
          100% { opacity: 0;   transform: scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important; }
          [role="dialog"] [aria-hidden="true"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
