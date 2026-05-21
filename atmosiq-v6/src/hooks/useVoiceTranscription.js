/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useVoiceTranscription — thin wrapper around the browser-native
 * Web Speech API (`window.SpeechRecognition` /
 * `window.webkitSpeechRecognition`). Lets the caller dictate text
 * into any input by calling `start()` and consuming the `onResult`
 * + `interim` outputs.
 *
 * Why browser-native vs server-side STT:
 * - Zero infra cost, no API key, no per-minute billing
 * - Works on iOS Safari + Chrome + Edge out of the box (~95% of
 *   AtmosFlow's field user base)
 * - Audio stays in the browser-OS pipeline; nothing is uploaded
 *   to AtmosFlow's servers (no new PII transmission path on top
 *   of what the OS already does)
 * - If quality turns out to be insufficient, Phase 2 can swap in
 *   a server-side Whisper / Deepgram pipeline behind the same
 *   hook signature — no UI changes
 *
 * Trade-off: Firefox doesn't implement the Web Speech API, so the
 * mic button renders as disabled with an "unsupported browser"
 * tooltip there. Acceptable for a field-app whose audience is
 * predominantly Safari + Chrome on iOS / iPadOS / Android.
 *
 * API contract:
 *
 *   const {
 *     supported,   // boolean — Web Speech API available
 *     listening,   // boolean — currently recording
 *     interim,     // string — live partial transcript while speaking
 *     error,       // string | null — last error code
 *     start,       // () => void — begin listening
 *     stop,        // () => void — stop and emit any pending final
 *     abort,       // () => void — hard cancel without emitting
 *   } = useVoiceTranscription({
 *     lang = 'en-US',
 *     continuous = true,
 *     onResult: (finalText: string) => void,
 *     onError: (code: string) => void,
 *   })
 *
 * `onResult` fires with the FINAL transcript of each phrase as
 * the browser commits it. `interim` is the live partial that
 * changes as the user speaks. The caller typically appends
 * onResult fragments to the input value and shows `interim` as
 * a transient preview.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

function getRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isVoiceTranscriptionSupported() {
  return getRecognitionClass() !== null
}

/**
 * @param {Object} [options]
 * @param {string} [options.lang]
 * @param {boolean} [options.continuous]
 * @param {(text: string) => void} [options.onResult]
 * @param {(code: string) => void} [options.onError]
 */
export function useVoiceTranscription({
  lang = 'en-US',
  continuous = true,
  onResult,
  onError,
} = {}) {
  const RecognitionCtor = getRecognitionClass()
  const supported = RecognitionCtor !== null

  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)

  // The SpeechRecognition instance is held in a ref so we can
  // tear it down imperatively without re-rendering. Recreated on
  // every start() so config changes (lang etc.) apply cleanly.
  const recogRef = useRef(null)
  // Tracks whether the most recent stop was an explicit user
  // action (vs the browser ending the session on silence). On
  // iOS Safari the recognition naturally ends every ~30s of
  // silence; if the user hasn't stopped, we restart so the
  // listening state matches the user's intent.
  const userStoppedRef = useRef(false)
  // Latest callbacks captured in a ref so we don't have to
  // recreate the recognition handlers on every render. The
  // SpeechRecognition object holds onto its handlers across the
  // session, so a closure over stale state would silently
  // misbehave.
  const callbacksRef = useRef({ onResult, onError })
  callbacksRef.current = { onResult, onError }

  const cleanup = useCallback(() => {
    const r = recogRef.current
    if (!r) return
    try {
      r.onresult = null
      r.onerror = null
      r.onend = null
      r.onstart = null
    } catch {
      // older browsers may throw on handler assignment after stop
    }
    recogRef.current = null
  }, [])

  const stop = useCallback(() => {
    userStoppedRef.current = true
    const r = recogRef.current
    if (r) {
      try { r.stop() } catch { /* already stopped */ }
    }
    setListening(false)
    setInterim('')
  }, [])

  const abort = useCallback(() => {
    userStoppedRef.current = true
    const r = recogRef.current
    if (r) {
      try { r.abort() } catch { /* already aborted */ }
    }
    cleanup()
    setListening(false)
    setInterim('')
  }, [cleanup])

  const start = useCallback(() => {
    if (!supported) {
      setError('unsupported')
      callbacksRef.current.onError?.('unsupported')
      return
    }
    // If a previous session is still teardown-pending, bail
    // rather than stacking instances.
    if (recogRef.current) return

    userStoppedRef.current = false
    setError(null)
    setInterim('')

    const r = new RecognitionCtor()
    r.lang = lang
    r.continuous = continuous
    r.interimResults = true
    r.maxAlternatives = 1

    r.onstart = () => {
      setListening(true)
    }

    r.onresult = (event) => {
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript || ''
        if (result.isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }
      if (interimText) setInterim(interimText)
      else setInterim('')
      if (finalText) {
        const trimmed = finalText.trim()
        if (trimmed) callbacksRef.current.onResult?.(trimmed)
      }
    }

    r.onerror = (event) => {
      const code = event?.error || 'unknown'
      setError(code)
      callbacksRef.current.onError?.(code)
      // Permission-level errors are terminal; don't try to
      // restart. Network and no-speech errors can be benign;
      // the onend handler will decide whether to restart.
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        userStoppedRef.current = true
        setListening(false)
        cleanup()
      }
    }

    r.onend = () => {
      // Auto-restart on silent end (e.g. iOS Safari's ~30s
      // continuous-mode timeout) unless the user explicitly
      // stopped. This makes "tap to start, tap to stop" behave
      // intuitively across the two engines.
      if (!userStoppedRef.current && continuous) {
        try {
          r.start()
          return
        } catch {
          // start() throws if already starting; fall through
          // to cleanup.
        }
      }
      cleanup()
      setListening(false)
      setInterim('')
    }

    recogRef.current = r
    try {
      r.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      callbacksRef.current.onError?.(msg)
      cleanup()
    }
  }, [supported, RecognitionCtor, lang, continuous, cleanup])

  // Tear down on unmount so a navigated-away page doesn't leave
  // the microphone hot.
  useEffect(() => {
    return () => {
      const r = recogRef.current
      if (r) {
        try { r.abort() } catch { /* ignore */ }
      }
      cleanup()
    }
  }, [cleanup])

  return { supported, listening, interim, error, start, stop, abort }
}
