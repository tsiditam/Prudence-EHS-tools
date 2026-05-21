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

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string') return 'Something went wrong. Please try again.'
  if (msg.includes('credit balance') || msg.includes('billing')) {
    return 'The AI assistant is temporarily unavailable due to a billing issue. Please contact your administrator.'
  }
  if (msg.startsWith('upstream_429')) return 'The AI assistant is receiving too many requests. Please wait a moment and try again.'
  if (msg.startsWith('upstream_401')) return 'AI assistant authentication failed. Please contact your administrator.'
  if (msg.startsWith('upstream_5')) return 'The AI service is temporarily unavailable. Please try again in a few minutes.'
  if (msg.startsWith('upstream_')) return 'The AI assistant encountered an unexpected error. Please try again.'
  return msg
}

// Mirrors the backend caps in api/field-assistant.ts so a too-large
// or too-many-photos request fails fast on the client without a
// 400 round-trip.
export const MAX_PHOTOS_PER_REQUEST = 5
export const MAX_PHOTO_BYTES = 2_000_000 // ~2MB decoded
const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp']

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

/**
 * Read a File / Blob and resolve to a base64 data URL. Used for the
 * L4 photo-attach path — photos are passed in the request body so the
 * backend can route them to the analyze_photo tool dispatcher.
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'))
    reader.readAsDataURL(file)
  })
}

export function useFieldAssistant() {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [quota, setQuota] = useState(null) // { used_today, limit_today, plan } | null
  // L4 — photos staged for the next message. Cleared on successful send.
  // Each entry: { id, dataUrl, label, sizeBytes }
  const [attachedPhotos, setAttachedPhotos] = useState([])
  // Ref mirror of attachedPhotos so attachPhoto can synchronously check
  // the current count even when called multiple times in the same act
  // cycle (React state updates aren't visible inside the same closure).
  const photosRef = useRef([])
  const inFlight = useRef(null)

  const reset = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setMessages([])
    setConversationId(null)
    setError(null)
    setSending(false)
    setQuota(null)
    photosRef.current = []
    setAttachedPhotos([])
  }, [])

  /**
   * Stage a File for the next message. Validates MIME type + size up
   * front so the user sees a useful error instead of a backend 400.
   */
  const attachPhoto = useCallback(async (file, label) => {
    if (!file) return { ok: false, error: 'no_file' }
    if (!ALLOWED_PHOTO_MIME.includes(file.type)) {
      const msg = 'Only JPEG, PNG, and WebP photos are supported.'
      setError(msg)
      return { ok: false, error: msg }
    }
    if (file.size > MAX_PHOTO_BYTES) {
      const msg = `Photo exceeds the ${Math.round(MAX_PHOTO_BYTES / 1_000_000)}MB limit. Resize and retry.`
      setError(msg)
      return { ok: false, error: msg }
    }
    if (photosRef.current.length >= MAX_PHOTOS_PER_REQUEST) {
      const msg = `Maximum ${MAX_PHOTOS_PER_REQUEST} photos per message.`
      setError(msg)
      return { ok: false, error: msg }
    }
    let dataUrl
    try {
      dataUrl = await fileToDataUrl(file)
    } catch {
      const msg = 'Failed to read photo file.'
      setError(msg)
      return { ok: false, error: msg }
    }
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? `photo-${crypto.randomUUID().slice(0, 8)}`
        : `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry = {
      id,
      dataUrl,
      label: typeof label === 'string' && label ? label.slice(0, 200) : file.name || null,
      sizeBytes: file.size,
    }
    photosRef.current = [...photosRef.current, entry]
    setAttachedPhotos(photosRef.current)
    setError(null)
    return { ok: true, id }
  }, [])

  const removePhoto = useCallback((id) => {
    photosRef.current = photosRef.current.filter((p) => p.id !== id)
    setAttachedPhotos(photosRef.current)
  }, [])

  const clearPhotos = useCallback(() => {
    photosRef.current = []
    setAttachedPhotos([])
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
    const photosAttached = attachedPhotos.map((p) => ({ id: p.id, label: p.label }))
    const userMsg = makeMessage('user', trimmed, photosAttached.length ? { photos: photosAttached } : {})
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

    // Snapshot the attached-photo list so the user can attach more
    // while the response streams without re-sending the originals.
    const photosToSend = attachedPhotos.slice()
    const photosPayload = photosToSend.length
      ? photosToSend.map((p) => ({ id: p.id, dataUrl: p.dataUrl, label: p.label }))
      : undefined

    let res
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: trimmed,
          context,
          ...(photosPayload ? { photos: photosPayload } : {}),
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
            upstreamError = friendlyError(frame.data?.error || 'Upstream error')
          }
        }
        buffer = processed
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        upstreamError = friendlyError(err?.message || 'Stream interrupted')
      }
    }

    if (receivedConversationId && receivedConversationId !== conversationId) {
      setConversationId(receivedConversationId)
    }
    if (receivedQuota) setQuota(receivedQuota)

    // Clear the staged photos now that they've been sent. The user
    // bubble retains a record of which IDs were attached so the UI
    // can render "📎 N photos" under the message.
    if (photosToSend.length > 0 && !upstreamError) {
      photosRef.current = []
      setAttachedPhotos([])
    }

    if (upstreamError && !assistantText) {
      setError(upstreamError)
    } else if (!assistantText && !upstreamError) {
      setError('No response from assistant. Please try again.')
    }

    inFlight.current = null
    setSending(false)
  }, [conversationId, sending, attachedPhotos])

  return {
    messages,
    sending,
    error,
    conversationId,
    quota,
    attachedPhotos,
    sendMessage,
    reset,
    attachPhoto,
    removePhoto,
    clearPhotos,
  }
}
