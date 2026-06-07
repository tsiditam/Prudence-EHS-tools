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

// Perceived-effort delay. A genuinely complex question reads as more
// considered when the answer doesn't snap back instantly, so we hold
// the "thinking" indicator (the neon brain) for a beat scaled to how
// involved the question looks. Pure client-side UX — the model, the
// prompt, and the answer content are untouched.
const THINK_DELAY_BASE_MS = 250    // floor for any question
const THINK_DELAY_MAX_MS = 2600    // cap so it never feels broken

// Score a question 0..1 on surface complexity, using cheap text
// heuristics only (no model call):
//   • length — longer questions tend to need fuller answers
//   • multi-part — several "?", "and", commas, or list markers
//   • analytical intent — compare / explain why / walk me through / etc.
export function questionComplexity(text) {
  const t = (text || '').toLowerCase().trim()
  if (!t) return 0
  let score = 0
  // Length: ramps to ~0.4 by ~280 chars.
  score += Math.min(t.length / 280, 1) * 0.4
  // Multi-part signals.
  const questionMarks = (t.match(/\?/g) || []).length
  if (questionMarks >= 2) score += 0.15
  const parts = (t.match(/\band\b|,|;|\n|•|(\b\d\.)/g) || []).length
  score += Math.min(parts / 5, 1) * 0.2
  // Analytical / open-ended intent.
  const ANALYTICAL = /\b(compare|contrast|explain why|walk me through|step[- ]by[- ]step|pros and cons|trade-?offs?|in detail|implications?|why (?:does|do|is|are|would)|how (?:does|do|would|should)|what (?:if|are the)|relationship between|difference between|break ?down|elaborate|comprehensive|thorough)\b/
  if (ANALYTICAL.test(t)) score += 0.3
  return Math.min(score, 1)
}

// Map a complexity score to a hold duration. Simple questions barely
// pause; complex ones hold up to the cap.
export function thinkDelayMs(text) {
  const c = questionComplexity(text)
  return Math.round(THINK_DELAY_BASE_MS + c * (THINK_DELAY_MAX_MS - THINK_DELAY_BASE_MS))
}

// Abortable sleep — resolves early (rejects with an AbortError) if the
// user cancels the in-flight turn during the hold.
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

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
  // Tool-call transparency. While a tool is running, `activeTool`
  // holds { name, input } so the UI can render
  // "Searching ASHRAE 62.1…" instead of a generic thinking dot.
  // Cleared on the matching `tool_call` (completion) event, on
  // the first `token` event after the tool finishes (when the
  // model resumes streaming text), or on `done` / abort.
  const [activeTool, setActiveTool] = useState(null)
  // Pending agentic actions. Each entry is the payload emitted by
  // the `proposed_action` SSE event:
  //   { id, action: { type, ...params }, summary, status: 'pending' | 'accepted' | 'rejected' }
  // The chat UI renders these as inline action cards with
  // Accept / Reject buttons. The parent (MobileApp) handles the
  // actual execution via the onAction callback that
  // FieldAssistant passes through.
  const [proposedActions, setProposedActions] = useState([])
  // Rendered DOCX deliverables emitted by the generate_report tool.
  // Each entry: { id, template_id, template_name, file_name,
  //   size_bytes, base64, tokens_filled, tokens_empty, tokens_unknown,
  //   status: 'ready'|'downloaded' }
  // base64 lives only in client memory — it's NOT persisted to
  // field_assistant_messages (the api/field-assistant.ts side-channel
  // strips it from the tool_result before insert), so a future
  // export/training run can't replay binaries from the dataset.
  const [renderedReports, setRenderedReports] = useState([])
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
    setActiveTool(null)
    setProposedActions([])
    setRenderedReports([])
  }, [])

  const markReportDownloaded = useCallback((id) => {
    setRenderedReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'downloaded' } : r)))
  }, [])

  // Stamp a proposed action as accepted / rejected. Called by
  // the chat UI's ActionCard buttons. The actual application of
  // the action (setView / append note) lives in the parent
  // component — this hook just records the outcome so the card
  // re-renders in its terminal visual state.
  const markActionAccepted = useCallback((id) => {
    setProposedActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a)))
  }, [])
  const markActionRejected = useCallback((id) => {
    setProposedActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)))
  }, [])

  // "New chat" alias for the user-facing affordance. Semantically the
  // same as reset() — both forget the current conversationId so the
  // next send creates a fresh row in field_assistant_conversations.
  // Kept as a named alias because the chat header button reads
  // "New chat", not "Reset".
  const newConversation = reset

  // List the user's past conversations for the history surface. Each
  // row carries id + title (auto-set to the first user message on
  // server, see api/field-assistant.ts → ensureConversation) +
  // created_at / updated_at + message_count. Server caps at 50.
  // Returns [] on auth failure or network error rather than throwing
  // so the UI can render an empty state cleanly.
  const listConversations = useCallback(async () => {
    if (!supabase) return []
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return []
      const r = await fetch('/api/field-assistant-history?action=list', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok) return []
      const body = await r.json()
      return Array.isArray(body.conversations) ? body.conversations : []
    } catch (err) {
      // Network errors are non-fatal — the user can still chat,
      // they just don't see history until next attempt.
      console.warn('[useFieldAssistant] listConversations failed:', err && err.message)
      return []
    }
  }, [])

  // Load a specific conversation's messages and switch the sheet to
  // continue it. Replaces the current in-memory transcript wholesale
  // so the chat view immediately reflects the picked conversation;
  // subsequent sendMessage() calls reuse the same conversationId so
  // the server appends to the existing row rather than creating a
  // new one. Returns false if the conversation can't be loaded
  // (e.g. it was deleted or belongs to another user).
  const loadConversation = useCallback(async (id) => {
    if (!supabase || !id) return false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return false
      const r = await fetch(`/api/field-assistant-history?action=get&id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!r.ok) return false
      const body = await r.json()
      const msgs = Array.isArray(body.messages) ? body.messages : []
      // Map server rows to the in-memory message shape used by the
      // chat view. Server rows have {id, role, content, context_view,
      // created_at}; the chat view expects {role, content, ...} —
      // matching the shape used in sendMessage's setMessages call.
      setMessages(msgs.map((m) => ({
        id: m.id,
        // Server row id IS the DB id for resumed conversations, so
        // dbId == id. The streaming path uses a separate clientside
        // UUID for the in-progress bubble + the dbId from the SSE
        // meta event; the loaded path can pin both to the same value.
        dbId: m.id,
        role: m.role,
        content: m.content,
        contextView: m.context_view || null,
        createdAt: m.created_at,
        feedbackRating: m.feedback_rating || null,
        feedbackReason: m.feedback_reason || null,
      })))
      setConversationId(id)
      setError(null)
      // Clear any photos staged for a brand-new chat; resuming an
      // existing conversation shouldn't carry over half-attached
      // photos from a different mental session.
      photosRef.current = []
      setAttachedPhotos([])
      return true
    } catch (err) {
      console.warn('[useFieldAssistant] loadConversation failed:', err && err.message)
      return false
    }
  }, [])

  // Submit thumbs-up / thumbs-down feedback on a single assistant
  // message. The dbId comes from the SSE meta event's
  // assistant_message_id, threaded onto the in-memory message via
  // appendToken below. Optimistic local update — UI shows the new
  // rating immediately and rolls back if the server rejects.
  // Returns true on success, false on auth / network / 404.
  const submitFeedback = useCallback(async (dbMessageId, rating, reason) => {
    if (!dbMessageId || (rating !== 'up' && rating !== 'down')) return false
    // Optimistic flip — capture the previous rating so we can
    // restore on failure.
    let prev = null
    setMessages((list) => list.map((m) => {
      if (m.dbId !== dbMessageId) return m
      prev = { rating: m.feedbackRating || null, reason: m.feedbackReason || null }
      return { ...m, feedbackRating: rating, feedbackReason: reason || null }
    }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('not_signed_in')
      const r = await fetch('/api/field-assistant-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message_id: dbMessageId, rating, reason: reason || undefined }),
      })
      if (!r.ok) throw new Error(`status_${r.status}`)
      return true
    } catch (err) {
      // Roll back the optimistic flip so the UI matches reality.
      setMessages((list) => list.map((m) => (
        m.dbId === dbMessageId
          ? { ...m, feedbackRating: prev?.rating || null, feedbackReason: prev?.reason || null }
          : m
      )))
      console.warn('[useFieldAssistant] submitFeedback failed:', err && err.message)
      return false
    }
  }, [])

  // Delete a past conversation. Used by the history panel's trash
  // affordance so the user can free up clutter without going into
  // Settings → Clear conversation history (which nukes everything).
  // Returns true on success, false on network / auth failure or a
  // 404 (which the caller can treat as "already gone — prune
  // locally"). If the deleted conversation is the one currently
  // open in the chat view, the caller should also reset() so the
  // sheet doesn't keep streaming into a row that no longer exists.
  const deleteConversation = useCallback(async (id) => {
    if (!supabase || !id) return false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return false
      const r = await fetch(`/api/field-assistant-history?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      // 200 = deleted; 404 = already gone. Both are safe to treat
      // as success from the UI's perspective — the row is no longer
      // there either way.
      return r.ok || r.status === 404
    } catch (err) {
      console.warn('[useFieldAssistant] deleteConversation failed:', err && err.message)
      return false
    }
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

    // Perceived-effort hold: keep the neon-brain "thinking" indicator
    // up for a beat scaled to how complex the question looks, so a
    // detailed answer doesn't snap back instantly. The user message is
    // already on screen and `sending` is true, so the brain shows
    // during this window. Abortable — tapping Stop cancels it. The
    // network request hasn't fired yet, so nothing is wasted on cancel.
    try {
      await abortableDelay(thinkDelayMs(trimmed), ctrl.signal)
    } catch {
      // Aborted during the hold — bail cleanly. `stop()` already
      // cleared inFlight + sending.
      return
    }

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
    // DB row id for the upcoming assistant turn — comes from the SSE
    // meta event. Threaded onto the assistant bubble's `dbId` field
    // so the inline thumbs-up / thumbs-down feedback row knows which
    // row to attach the rating to.
    let receivedAssistantDbId = null

    const appendToken = (chunk) => {
      assistantText += chunk
      if (!assistantMsgId) {
        const msg = makeMessage('assistant', chunk, receivedAssistantDbId ? { dbId: receivedAssistantDbId } : {})
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
            if (typeof frame.data?.assistant_message_id === 'string') {
              receivedAssistantDbId = frame.data.assistant_message_id
            }
          } else if (frame.event === 'token') {
            // First token after a tool finishes signals the model
            // is back to generating text — clear the active tool
            // indicator so the UI returns to the regular streaming
            // bubble.
            setActiveTool(null)
            if (typeof frame.data?.text === 'string') appendToken(frame.data.text)
          } else if (frame.event === 'tool_start') {
            setActiveTool({
              name: frame.data?.name || 'unknown',
              input: frame.data?.input || {},
            })
          } else if (frame.event === 'tool_call') {
            // Completion event for a tool — clear the active-tool
            // status. The next text token (if any) will resume the
            // assistant bubble.
            setActiveTool(null)
          } else if (frame.event === 'proposed_action') {
            // Agentic action — append an inline card to the chat.
            // The hook only TRACKS the card state (pending /
            // accepted / rejected); execution lives in the parent
            // component so MobileApp can route setView / append
            // notes without the hook needing knowledge of app
            // state. Generates an id if the server didn't supply
            // one, so accept/reject can target the right card.
            const action = frame.data?.action || null
            const summary = typeof frame.data?.summary === 'string' ? frame.data.summary : ''
            if (action && typeof action === 'object' && action.type) {
              const id = frame.data?.id || (typeof crypto !== 'undefined' && crypto.randomUUID
                ? `action-${crypto.randomUUID().slice(0, 8)}`
                : `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
              setProposedActions((prev) => [
                ...prev,
                { id, action, summary, status: 'pending' },
              ])
            }
          } else if (frame.event === 'render_proposed') {
            // generate_report dispatcher resolved which template to
            // render. The docx render itself lives in a separate
            // function (/api/report-templates-render) so docxtemplater
            // never bundles into the Jasper hot path. We add a card
            // in `rendering` state immediately so the user sees
            // progress, then POST to the render endpoint with the
            // same auth token. On success the card flips to `ready`
            // and exposes a Download button; on failure it shows the
            // error.
            const data = frame.data || {}
            const templateId = typeof data.template_id === 'string' ? data.template_id : ''
            if (templateId) {
              const id = data.id || (typeof crypto !== 'undefined' && crypto.randomUUID
                ? `report-${crypto.randomUUID().slice(0, 8)}`
                : `report-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
              const fileName = data.file_name || 'Report.docx'
              setRenderedReports((prev) => [
                ...prev,
                {
                  id,
                  template_id: templateId,
                  template_name: data.template_name || null,
                  file_name: fileName,
                  size_bytes: 0,
                  base64: '',
                  tokens_filled: [],
                  tokens_empty: [],
                  tokens_unknown: [],
                  status: 'rendering',
                  error: null,
                },
              ])
              // Fire-and-forget render. We capture the auth token at
              // request time (same Bearer the SSE call used) and
              // forward the assessment context so the resolvers walk
              // the SAME shape Jasper saw.
              ;(async () => {
                try {
                  const renderResp = await fetch('/api/report-templates-render', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: token ? `Bearer ${token}` : '',
                    },
                    body: JSON.stringify({
                      template_id: templateId,
                      file_name: fileName,
                      assessment_context: context,
                      response_mode: 'base64',
                    }),
                  })
                  const j = await renderResp.json().catch(() => ({}))
                  if (!renderResp.ok || !j?.ok) {
                    setRenderedReports((prev) => prev.map((r) => r.id === id
                      ? { ...r, status: 'error', error: j?.error || `render_failed (${renderResp.status})` }
                      : r))
                    return
                  }
                  setRenderedReports((prev) => prev.map((r) => r.id === id ? {
                    ...r,
                    status: 'ready',
                    base64: j.base64 || '',
                    file_name: j.file_name || r.file_name,
                    tokens_filled: Array.isArray(j.tokens_filled) ? j.tokens_filled : [],
                    tokens_empty:  Array.isArray(j.tokens_empty)  ? j.tokens_empty  : [],
                    tokens_unknown: Array.isArray(j.tokens_unknown) ? j.tokens_unknown : [],
                    size_bytes: typeof j.base64 === 'string' ? Math.floor((j.base64.length * 3) / 4) : 0,
                  } : r))
                } catch (err) {
                  setRenderedReports((prev) => prev.map((r) => r.id === id
                    ? { ...r, status: 'error', error: err?.message || 'render_failed' }
                    : r))
                }
              })()
            }
          } else if (frame.event === 'replace') {
            // The server-side output linter caught prohibited phrasing in
            // the streamed answer and replaced it (corrected retry, or a
            // screening-safe fallback). The bad text was already rendered
            // token-by-token, so swap the assistant bubble's content
            // wholesale. Persistence only ever stores this clean text.
            if (typeof frame.data?.text === 'string') {
              const clean = frame.data.text
              assistantText = clean
              if (!assistantMsgId) {
                const msg = makeMessage('assistant', clean, receivedAssistantDbId ? { dbId: receivedAssistantDbId } : {})
                assistantMsgId = msg.id
                setMessages((prev) => [...prev, msg])
              } else {
                const id = assistantMsgId
                setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: clean } : m)))
              }
            }
            setActiveTool(null)
          } else if (frame.event === 'done') {
            if (frame.data?.quota) receivedQuota = frame.data.quota
            setActiveTool(null)
          } else if (frame.event === 'error') {
            upstreamError = friendlyError(frame.data?.error || 'Upstream error')
            setActiveTool(null)
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

  // Stop the in-flight stream. The AbortController triggers an
  // AbortError in the fetch which is caught silently by the
  // send-loop. The partial assistant turn already on screen stays
  // visible. Used by the modern "Stop generating" affordance.
  const stop = useCallback(() => {
    inFlight.current?.abort?.()
    inFlight.current = null
    setActiveTool(null)
    setSending(false)
  }, [])

  return {
    messages,
    sending,
    error,
    conversationId,
    quota,
    attachedPhotos,
    activeTool,
    proposedActions,
    renderedReports,
    sendMessage,
    stop,
    reset,
    attachPhoto,
    removePhoto,
    clearPhotos,
    listConversations,
    loadConversation,
    deleteConversation,
    submitFeedback,
    newConversation,
    markActionAccepted,
    markActionRejected,
    markReportDownloaded,
  }
}
