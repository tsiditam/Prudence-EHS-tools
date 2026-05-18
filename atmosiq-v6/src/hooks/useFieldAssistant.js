/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useFieldAssistant — state + SSE client for the in-app field-assistant
 * agent. POSTs to /api/field-assistant, parses the Anthropic-style
 * Server-Sent Events stream, and exposes a small surface to the chat UI.
 *
 * Commit 2/3 (this commit) buffers the streamed tokens and only renders
 * the assistant message when the `done` event arrives — the UI shows a
 * loading indicator in the meantime. Commit 3/3 will swap the buffered
 * render for incremental token-by-token updates.
 */

import { useCallback, useRef, useState } from 'react'
import { supabase } from '../utils/supabaseClient'

const ENDPOINT = '/api/field-assistant'

function makeMessage(role, content, extras = {}) {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    role,
    content,
    ...extras,
  }
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

export function useFieldAssistant() {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [quota, setQuota] = useState(null) // { used_today, limit_today, plan } | null
  const inFlight = useRef(null)

  const reset = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setMessages([])
    setConversationId(null)
    setError(null)
    setSending(false)
    setQuota(null)
  }, [])

  const sendMessage = useCallback(async (text, context) => {
    const trimmed = (text || '').trim()
    if (!trimmed || sending) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Field assistant requires network. Try again when back online.')
      return
    }

    setError(null)
    setSending(true)
    const userMsg = makeMessage('user', trimmed)
    setMessages((prev) => [...prev, userMsg])

    let token = null
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        token = data?.session?.access_token || null
      }
    } catch {
      // fall through — server will 401
    }
    if (!token) {
      setSending(false)
      setError('Not signed in. Please sign in and try again.')
      return
    }

    const ctrl = new AbortController()
    inFlight.current = ctrl

    let res
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: trimmed,
          context,
        }),
        signal: ctrl.signal,
      })
    } catch (err) {
      setSending(false)
      if (err?.name !== 'AbortError') setError('Network error. Please try again.')
      return
    }

    if (res.status === 429) {
      let body = {}
      try { body = await res.json() } catch { /* ignore */ }
      setSending(false)
      setError(body?.message || 'You\'ve hit the field-assistant rate limit. Please wait a bit and try again.')
      return
    }
    if (res.status === 401) {
      setSending(false)
      setError('Session expired. Please sign in again.')
      return
    }
    if (!res.ok) {
      setSending(false)
      setError(`Server error (${res.status}). Please try again.`)
      return
    }
    if (!res.body) {
      setSending(false)
      setError('Server returned no response body.')
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let assistantMsgId = null  // id of the in-progress assistant bubble
    let assistantText = ''
    let upstreamError = null
    let receivedConversationId = conversationId
    let receivedQuota = null

    const appendToken = (chunk) => {
      assistantText += chunk
      if (!assistantMsgId) {
        const msg = makeMessage('assistant', chunk)
        assistantMsgId = msg.id
        setMessages((prev) => [...prev, msg])
      } else {
        const id = assistantMsgId
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk } : m)),
        )
      }
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let processed = ''
        for (const frame of parseSseFrames(buffer)) {
          if (frame.done) { processed = frame.rest; break }
          if (frame.event === 'meta') {
            if (frame.data?.conversation_id) receivedConversationId = frame.data.conversation_id
          } else if (frame.event === 'token') {
            if (typeof frame.data?.text === 'string') appendToken(frame.data.text)
          } else if (frame.event === 'done') {
            if (frame.data?.quota) receivedQuota = frame.data.quota
          } else if (frame.event === 'error') {
            upstreamError = frame.data?.error || 'Upstream error'
          }
        }
        buffer = processed
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        upstreamError = err?.message || 'Stream interrupted'
      }
    }

    if (receivedConversationId && receivedConversationId !== conversationId) {
      setConversationId(receivedConversationId)
    }
    if (receivedQuota) setQuota(receivedQuota)

    if (upstreamError && !assistantText) {
      setError(upstreamError)
    } else if (!assistantText && !upstreamError) {
      setError('No response from assistant. Please try again.')
    }

    inFlight.current = null
    setSending(false)
  }, [conversationId, sending])

  return { messages, sending, error, conversationId, quota, sendMessage, reset }
}
