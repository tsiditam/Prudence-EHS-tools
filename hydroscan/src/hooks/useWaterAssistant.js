/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useWaterAssistant — state + SSE client for Marlow. POSTs the conversation
 * to /api/water-assistant and parses the Server-Sent Events stream
 * (delta / tool / done / error), appending streamed tokens to the in-flight
 * assistant message so the UI renders the answer as it arrives.
 */

import { useCallback, useRef, useState } from 'react'

const ENDPOINT = '/api/water-assistant'

function friendlyError(msg) {
  if (!msg || typeof msg !== 'string') return 'Something went wrong. Please try again.'
  if (msg.includes('wa_init_001') || msg.includes('not configured')) return 'Marlow is not configured on this deployment yet (missing API key).'
  if (msg.startsWith('upstream_429')) return 'Marlow is receiving too many requests. Please wait a moment and try again.'
  if (msg.startsWith('upstream_401')) return 'Marlow authentication failed. Please contact your administrator.'
  if (msg.startsWith('upstream_5')) return 'The AI service is temporarily unavailable. Please try again shortly.'
  if (msg.includes('Too many requests') || msg.includes('429')) return 'You are sending messages too quickly — give it a few seconds.'
  return msg
}

export function useWaterAssistant() {
  // messages: [{ id, role: 'user'|'assistant', content, streaming?, tools? }]
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    setBusy(false)
  }, [])

  const send = useCallback(
    async (text, context) => {
      const clean = (text || '').trim()
      if (!clean || busy) return
      setError(null)
      setBusy(true)

      const userMsg = { id: `u-${Date.now()}`, role: 'user', content: clean }
      const asstId = `a-${Date.now()}`
      const asstMsg = { id: asstId, role: 'assistant', content: '', streaming: true, tools: [] }

      // Build the wire history from prior turns + this user message.
      const wire = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      setMessages((prev) => [...prev, userMsg, asstMsg])

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const resp = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: wire, context }),
          signal: controller.signal,
        })

        if (!resp.ok || !resp.body) {
          let detail = `HTTP ${resp.status}`
          try { detail = (await resp.json())?.error || detail } catch { /* ignore */ }
          throw new Error(detail)
        }

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let bufferRaw = ''

        const apply = (event, data) => {
          if (event === 'delta' && data?.text) {
            setMessages((prev) =>
              prev.map((m) => (m.id === asstId ? { ...m, content: m.content + data.text } : m)),
            )
          } else if (event === 'tool' && data?.name) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== asstId) return m
                const tools = [...(m.tools || [])]
                const idx = tools.findIndex((t) => t.name === data.name && t.status === 'running')
                if (data.status === 'done' && idx >= 0) tools[idx] = { ...tools[idx], status: 'done', found: data.found }
                else tools.push({ name: data.name, status: data.status, found: data.found })
                return { ...m, tools }
              }),
            )
          } else if (event === 'error') {
            throw new Error(data?.message || 'stream error')
          }
        }

        // Read + parse the SSE frames.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          bufferRaw += decoder.decode(value, { stream: true })
          const frames = bufferRaw.split('\n\n')
          bufferRaw = frames.pop() || ''
          for (const frame of frames) {
            if (!frame.trim()) continue
            let event = 'message'
            let dataLine = ''
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
            }
            let data = null
            try { data = dataLine ? JSON.parse(dataLine) : null } catch { /* ignore */ }
            apply(event, data)
          }
        }

        setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, streaming: false } : m)))
      } catch (e) {
        if (e?.name === 'AbortError') {
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, streaming: false } : m)))
        } else {
          const fe = friendlyError(e?.message)
          setError(fe)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === asstId ? { ...m, streaming: false, content: m.content || `⚠ ${fe}` } : m,
            ),
          )
        }
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [messages, busy],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return { messages, busy, error, send, stop, reset }
}
