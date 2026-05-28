/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useGhostText — predictive ghost-text completion for observation
 * textareas. Wraps POST /api/inline-complete with the debouncing +
 * cancellation logic Smart Compose needs to feel snappy.
 *
 *   const { ghost, loading, dismiss } = useGhostText({
 *     text, context, enabled,
 *     minLength: 12,
 *     debounceMs: 500,
 *   })
 *
 * Behavior:
 *   • Watches `text`. After it stops changing for `debounceMs`, if
 *     `text.length >= minLength` and the textarea isn't actively
 *     in a deletion state (we only fire when text is growing or
 *     stable), fires a request.
 *   • While a request is in flight, any new `text` change cancels
 *     it via AbortController so we don't render a stale ghost.
 *   • The returned `ghost` is the latest completion string. Becomes
 *     '' when the user types past the start of the ghost or when
 *     the user dismisses.
 *   • `dismiss()` clears the current ghost without firing again
 *     until `text` changes.
 *
 * The hook intentionally does NOT track the cursor position or
 * mutate `text`. The parent component handles accept/dismiss UI
 * and decides when to apply the ghost.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

const ENDPOINT = '/api/inline-complete'
const DEFAULT_MIN_LENGTH = 12
const DEFAULT_DEBOUNCE_MS = 500

/**
 * @param {Object} [options]
 * @param {string} [options.text]
 * @param {Object} [options.context]
 * @param {boolean} [options.enabled]
 * @param {number} [options.minLength]
 * @param {number} [options.debounceMs]
 */
export function useGhostText({
  text,
  context,
  enabled = true,
  minLength = DEFAULT_MIN_LENGTH,
  debounceMs = DEFAULT_DEBOUNCE_MS,
} = {}) {
  const [ghost, setGhost] = useState('')
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(null)
  const debounceTimer = useRef(null)
  // Last text we fetched for. If text grows back to a prefix that
  // matches the previously-completed text exactly, we don't refire
  // — the existing ghost is still valid. If text shrinks (delete),
  // we cancel + clear.
  const lastFetchedFor = useRef('')
  // Dismissed text — when the user dismisses, we record the text
  // they dismissed AT so we don't immediately re-fire. Cleared on
  // any meaningful new typing.
  const dismissedAt = useRef('')
  // Ref mirror of `text` so the async fetch callback can read the
  // LATEST text value, not the one captured at fetch-call time.
  // Without this, a request resolving after the user has typed more
  // would set a stale ghost.
  const latestTextRef = useRef(text)
  latestTextRef.current = text

  const cancel = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (inFlight.current) {
      inFlight.current.abort?.()
      inFlight.current = null
    }
    setLoading(false)
  }, [])

  const dismiss = useCallback(() => {
    cancel()
    dismissedAt.current = text || ''
    setGhost('')
  }, [cancel, text])

  // Whenever text changes, run the orchestration:
  //   1. If disabled or too short → clear ghost + cancel.
  //   2. If user is currently deleting → clear ghost.
  //   3. If user typed past the start of the ghost in a way that
  //      diverges → clear ghost.
  //   4. If user typed exactly the first few chars of the ghost,
  //      trim those chars off the ghost (keep the rest visible).
  //   5. Otherwise, schedule a debounced fetch for new ghost.
  useEffect(() => {
    if (!enabled) {
      cancel()
      setGhost('')
      return
    }

    const current = text || ''

    // Backspacing — user has deleted chars from the previous text.
    // Clear the ghost; don't immediately refire (let them think).
    if (current.length < lastFetchedFor.current.length &&
        lastFetchedFor.current.startsWith(current)) {
      cancel()
      setGhost('')
      lastFetchedFor.current = current
      return
    }

    // User typed into the existing ghost. If they typed the first
    // few chars of the ghost, shrink it; if they diverged, drop it.
    if (ghost && lastFetchedFor.current && current.startsWith(lastFetchedFor.current)) {
      const typedIntoGhost = current.slice(lastFetchedFor.current.length)
      if (typedIntoGhost && ghost.startsWith(typedIntoGhost)) {
        // They typed the start of the ghost — slide it forward.
        setGhost(ghost.slice(typedIntoGhost.length))
        lastFetchedFor.current = current
        return
      }
      if (typedIntoGhost) {
        // They diverged from the ghost — drop it.
        setGhost('')
      }
    }

    // Below the meaningful-completion threshold.
    if (current.length < minLength) {
      cancel()
      setGhost('')
      return
    }

    // The user dismissed at this exact text and hasn't typed since.
    if (dismissedAt.current && dismissedAt.current === current) {
      return
    }
    // Any further typing clears the dismissed-at marker.
    if (dismissedAt.current && dismissedAt.current !== current) {
      dismissedAt.current = ''
    }

    // Debounced fetch.
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      fetchCompletion(current).catch(() => { /* errors are silent for ghost */ })
    }, debounceMs)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, minLength, debounceMs])

  // Tear down on unmount.
  useEffect(() => () => cancel(), [cancel])

  async function fetchCompletion(forText) {
    // Cancel any prior in-flight before starting a new one.
    if (inFlight.current) {
      inFlight.current.abort?.()
      inFlight.current = null
    }

    let token = null
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        token = data?.session?.access_token || null
      }
    } catch { /* no session — skip */ }
    if (!token) return

    const ctrl = new AbortController()
    inFlight.current = ctrl
    setLoading(true)

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: forText, context: context || null }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        // Rate limits + other errors are silent for ghost — we
        // don't want to disrupt the user with toast spam on every
        // failed completion.
        return
      }
      const body = await res.json().catch(() => null)
      const completion = body && typeof body.completion === 'string' ? body.completion : ''
      // Only apply if `text` hasn't moved on since we kicked off.
      // The parent's text prop may have updated mid-flight; if so
      // we drop the response on the floor. latestTextRef tracks
      // the current text prop synchronously, dodging the stale
      // closure problem.
      if (forText === latestTextRef.current) {
        setGhost(completion)
        lastFetchedFor.current = forText
      }
    } catch (err) {
      // AbortError or network error — silent.
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null
      setLoading(false)
    }
  }

  return { ghost, loading, dismiss, cancel }
}
