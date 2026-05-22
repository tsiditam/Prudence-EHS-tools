/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useInlineAi — state + SSE client for the inline AI affordance
 * (the small "AI" button next to observation textareas). Wraps a
 * POST to /api/inline-ai and accumulates the streamed result into
 * a `result` string the UI can render token-by-token.
 *
 *   const { running, action, result, error, run, stop, reset } = useInlineAi()
 *   await run({ action: 'improve', text: 'CO2 high in room', context: { zone: 'A1' } })
 *
 * `run()` is fire-and-await. While the request is in flight,
 * `running` is true and `result` grows as tokens arrive. On
 * completion `result` holds the final rewritten text; on error
 * `error` holds a UI-friendly message.
 *
 * `stop()` aborts in-flight. `reset()` clears the result for the
 * next action.
 *
 * Same SSE frame shape as useFieldAssistant — `token` / `done` /
 * `error` — so the backend can grow shared tooling later.
 */

import { useCallback, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

const ENDPOINT = '/api/inline-ai'

export const VALID_ACTIONS = ['improve', 'expand', 'concise', 'professional']

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string') return 'Something went wrong. Please try again.'
  if (msg.includes('credit balance') || msg.includes('billing')) {
    return 'AI temporarily unavailable due to a billing issue. Please contact your administrator.'
  }
  if (msg === 'rate_limit_exceeded') return 'You\'ve hit the inline-AI limit — wait a moment and try again.'
  if (msg.startsWith('upstream_429')) return 'AI is busy — try again in a moment.'
  if (msg.startsWith('upstream_401')) return 'AI authentication failed. Contact your administrator.'
  if (msg.startsWith('upstream_5')) return 'AI service temporarily unavailable.'
  if (msg.startsWith('upstream_')) return 'AI returned an unexpected error.'
  return msg
}

function* parseSseFrames(buffer) {
  let start = 0
  while (true) {
    const idx = buffer.indexOf('\n\n', start)
    if (idx === -1) {
      yield { rest: buffer.slice(start), done: true }
      return
    }
    const frame = buffer.slice(start, idx)
    start = idx + 2
    const lines = frame.split('\n')
    const evLine = lines.find((l) => l.startsWith('event: '))
    const dataLine = lines.find((l) => l.startsWith('data: '))
    if (!evLine || !dataLine) continue
    try {
      yield { event: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) }
    } catch {
      // malformed frame — drop silently
    }
  }
}

export function useInlineAi() {
  const [running, setRunning] = useState(false)
  const [action, setAction] = useState(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState(null)
  const inFlight = useRef(null)

  const reset = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setRunning(false)
    setAction(null)
    setResult('')
    setError(null)
  }, [])

  const stop = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setRunning(false)
  }, [])

  /**
   * Fire an inline-AI action. Returns the final rewritten text on
   * success, or null on error / abort. UI can either consume the
   * return value or read `result` state — both reflect the same
   * accumulated stream.
   */
  const run = useCallback(async ({ action: act, text, context } = {}) => {
    if (running) return null
    if (!VALID_ACTIONS.includes(act)) {
      setError('Unknown AI action.')
      return null
    }
    if (!text || !text.trim()) {
      setError('Nothing to rewrite — type something first.')
      return null
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Inline AI requires network. Try again when back online.')
      return null
    }

    setRunning(true)
    setAction(act)
    setResult('')
    setError(null)

    let token = null
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        token = data?.session?.access_token || null
      }
    } catch { /* server will 401 */ }
    if (!token) {
      setRunning(false)
      setAction(null)
      setError('Not signed in. Please sign in and try again.')
      return null
    }

    const ctrl = new AbortController()
    inFlight.current = ctrl

    let acc = ''
    let upstreamError = null
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: act, text, context: context || null }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        let detail = ''
        try {
          const body = await res.json()
          detail = body?.error || ''
        } catch { /* non-JSON body */ }
        upstreamError = friendlyError(detail || `upstream_${res.status}`)
      } else if (!res.body) {
        upstreamError = 'Stream unavailable.'
      } else {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let processed = ''
          for (const frame of parseSseFrames(buffer)) {
            if (frame.done) { processed = frame.rest; break }
            if (frame.event === 'token') {
              if (typeof frame.data?.text === 'string') {
                acc += frame.data.text
                setResult(acc)
              }
            } else if (frame.event === 'done') {
              // Final ledger info on data.input_tokens / output_tokens
              // — UI doesn't surface it today but keep the hook
              // contract open for a future "cost / token" badge.
            } else if (frame.event === 'error') {
              upstreamError = friendlyError(frame.data?.error || 'Upstream error')
            }
          }
          buffer = processed
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        upstreamError = friendlyError(err?.message || 'Stream interrupted')
      }
    }

    inFlight.current = null
    setRunning(false)
    if (upstreamError) {
      setError(upstreamError)
      return null
    }
    return acc
  }, [running])

  return { running, action, result, error, run, stop, reset }
}
