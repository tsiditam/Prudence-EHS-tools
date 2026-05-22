/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * usePreReviewSemantic — client for the Layer 2 (Jasper-powered)
 * pre-review semantic audit. Layer 1 (deterministic, in
 * src/utils/preReviewValidator.js) handles regex / similarity /
 * date-sanity / placeholder checks; Layer 2 sends the assembled
 * assessment to Claude and asks for the citation / language /
 * internal-consistency judgments that need actual reasoning.
 *
 *   const { running, issues, error, run, reset, stop } = usePreReviewSemantic()
 *   await run(ctx)
 *
 * State:
 *   running   — true while the request is in flight
 *   issues    — array of structured issues, appended as the
 *               endpoint emits each `issue` SSE event
 *   error     — UI-friendly error string or null
 *
 * Each issue has the same shape Layer 1 emits:
 *   { id, severity, category, title, detail, anchor, source: 'semantic' }
 *
 * so the PreReviewCheckPanel can render Layer 1 + Layer 2 issues in
 * the same list once they're composed.
 */

import { useCallback, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

const ENDPOINT = '/api/pre-review-semantic'

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string') return 'Pre-review check failed. Try again.'
  if (msg === 'rate_limit_exceeded') return 'Pre-review audit limit reached — wait a moment and try again.'
  if (msg === 'assessment_too_large') return 'This assessment is too large for the audit. Trim the narrative or split the report.'
  if (msg === 'missing_assessment') return 'No assessment data provided for audit.'
  if (msg.includes('credit balance')) return 'AI temporarily unavailable due to a billing issue. Contact your administrator.'
  if (msg.startsWith('upstream_429')) return 'AI is busy — try again in a moment.'
  if (msg.startsWith('upstream_5')) return 'AI service temporarily unavailable.'
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
      // malformed — drop
    }
  }
}

export function usePreReviewSemantic() {
  const [running, setRunning] = useState(false)
  const [issues, setIssues] = useState([])
  const [error, setError] = useState(null)
  const [issueCount, setIssueCount] = useState(0)
  const inFlight = useRef(null)

  const reset = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setRunning(false)
    setIssues([])
    setError(null)
    setIssueCount(0)
  }, [])

  const stop = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setRunning(false)
  }, [])

  const run = useCallback(async (assessment) => {
    if (running) return null
    if (!assessment || typeof assessment !== 'object') {
      setError('No assessment data to audit.')
      return null
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Pre-review audit requires network. Try again when reconnected.')
      return null
    }
    setRunning(true)
    setIssues([])
    setError(null)
    setIssueCount(0)

    let token = null
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        token = data?.session?.access_token || null
      }
    } catch { /* server will 401 */ }
    if (!token) {
      setRunning(false)
      setError('Not signed in. Please sign in and try again.')
      return null
    }

    const ctrl = new AbortController()
    inFlight.current = ctrl

    const collected = []
    let upstreamError = null
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assessment }),
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
            if (frame.event === 'issue') {
              if (frame.data && typeof frame.data === 'object') {
                collected.push(frame.data)
                setIssues((prev) => [...prev, frame.data])
              }
            } else if (frame.event === 'done') {
              if (typeof frame.data?.issue_count === 'number') {
                setIssueCount(frame.data.issue_count)
              }
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
    return collected
  }, [running])

  return { running, issues, issueCount, error, run, stop, reset }
}
