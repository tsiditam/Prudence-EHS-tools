/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * VoiceInputButton — small mic button that sits next to (or inside)
 * a text input and toggles dictation via useVoiceTranscription.
 *
 * Usage:
 *
 *   <VoiceInputButton
 *     onTranscript={(text) => setValue(v => appendWithSpace(v, text))}
 *     onInterim={(text) => setLivePreview(text)}  // optional
 *     ariaLabel="Dictate observation"
 *   />
 *
 * Visual states:
 *   - Idle (supported, not listening): subtle bordered mic icon
 *   - Listening: filled accent background, pulsing dot indicator
 *   - Unsupported browser: disabled, muted color, tooltip explains
 *   - Permission denied: disabled with error tooltip
 *
 * The button intentionally has no opinion about layout — the
 * caller positions it (absolute next to a textarea, inline next
 * to a send button, etc.). Default size 36px square.
 *
 * Helper export: `appendWithSpace(currentValue, transcript)` —
 * the standard "drop the transcript into a text input" reducer.
 * Inserts a space between existing text and the new fragment so
 * dictating multiple phrases doesn't smash them together.
 */

import { useEffect, useState } from 'react'
import { useVoiceTranscription } from '../hooks/useVoiceTranscription'

/**
 * Append a dictation fragment to an existing text value, inserting
 * a single space if the existing text doesn't already end with
 * whitespace. Idempotent on the empty-string boundary so brand-new
 * inputs don't get a leading space.
 */
export function appendWithSpace(currentValue, fragment) {
  const v = currentValue || ''
  const f = (fragment || '').trim()
  if (!f) return v
  if (!v) return f
  return /\s$/.test(v) ? v + f : v + ' ' + f
}

const ERROR_MESSAGES = {
  unsupported: 'Voice input not supported in this browser.',
  'not-allowed': 'Microphone permission denied. Enable it in browser settings.',
  'service-not-allowed': 'Microphone access blocked. Check browser settings.',
  'no-speech': 'No speech detected. Try again.',
  'audio-capture': 'No microphone found.',
  network: 'Voice input requires network. Try again when online.',
}

export default function VoiceInputButton({
  onTranscript,
  onInterim,
  ariaLabel = 'Dictate',
  size = 36,
  style = {},
  disabled = false,
  // Color tokens — defaults match the rest of the v3 surface but
  // callers can override (e.g. on a dark sheet vs a light wizard
  // card). Resolved as CSS values so they swap with the theme.
  idleColor = 'var(--sub)',
  idleBorder = 'var(--border)',
  activeColor = 'var(--on-accent-fill)',
  activeBackground = 'var(--accent-fill)',
  unsupportedColor = 'var(--dim)',
} = {}) {
  const { supported, listening, interim, error, start, stop } = useVoiceTranscription({
    onResult: (text) => {
      onTranscript?.(text)
    },
    onError: (_code) => {
      // Error surfacing is handled by reading `error` below; the
      // callback exists for callers that want to react (e.g. clear
      // a live-preview state).
      onInterim?.('')
    },
  })

  // Mirror interim out to the parent (for live preview rendering)
  // without making the parent depend on the hook directly. We
  // also clear the parent's preview when listening stops so
  // stale interim text doesn't linger after the mic turns off.
  useEffect(() => {
    onInterim?.(listening ? interim : '')
  }, [interim, listening, onInterim])

  // Two-second auto-clear on transient errors (no-speech etc.) so
  // the button doesn't get stuck displaying an old error message.
  // Permanent errors (not-allowed, unsupported) stay until the
  // user dismisses by tapping the button.
  const [shownError, setShownError] = useState(null)
  useEffect(() => {
    if (!error) { setShownError(null); return }
    setShownError(error)
    if (error === 'no-speech' || error === 'network') {
      const t = setTimeout(() => setShownError(null), 2000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [error])

  const effectivelyDisabled = !supported || disabled
  const buttonTitle =
    !supported ? ERROR_MESSAGES.unsupported
      : shownError ? (ERROR_MESSAGES[shownError] || `Voice input error: ${shownError}`)
      : (listening ? 'Stop dictation' : ariaLabel)

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: 8,
    border: `1px solid ${listening ? 'transparent' : idleBorder}`,
    background: listening ? activeBackground : 'transparent',
    color: !supported ? unsupportedColor : (listening ? activeColor : idleColor),
    cursor: effectivelyDisabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    flexShrink: 0,
    opacity: effectivelyDisabled ? 0.6 : 1,
    position: 'relative',
    WebkitTapHighlightColor: 'transparent',
    ...style,
  }

  return (
    <button
      type="button"
      aria-label={buttonTitle}
      aria-pressed={listening ? 'true' : 'false'}
      title={buttonTitle}
      disabled={effectivelyDisabled}
      onClick={(e) => {
        e.preventDefault()
        if (effectivelyDisabled) return
        if (listening) stop()
        else start()
      }}
      style={baseStyle}>
      <svg
        width={Math.round(size * 0.45)}
        height={Math.round(size * 0.45)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      {listening && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4, right: 4,
            width: 6, height: 6, borderRadius: 3,
            background: 'var(--danger, #EF4444)',
            animation: 'voicePulse 1.1s ease-in-out infinite',
          }}
        />
      )}
      <style>{`
        @keyframes voicePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-voice-pulse] { animation: none !important; }
        }
      `}</style>
    </button>
  )
}
