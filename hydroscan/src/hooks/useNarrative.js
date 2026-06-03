/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useNarrative — state + SSE client for the narrative layer. POSTs an
 * assessment payload to /api/water-narrative and parses the SSE stream
 * (delta / review / done / error), accumulating prose live and splitting it
 * into the four report sections via parseNarrativeSections.
 */

import { useCallback, useRef, useState } from 'react'
import { parseNarrativeSections } from '../constants/narrative-prompt.js'

const ENDPOINT = '/api/water-narrative'

function friendly(msg) {
  if (!msg) return 'Could not generate the narrative. Please try again.'
  if (msg.includes('wn_init_001') || msg.includes('not configured')) return 'The narrative engine is not configured on this deployment yet (missing API key).'
  if (msg.includes('429') || msg.includes('Too many')) return 'Too many requests — wait a few seconds and try again.'
  if (msg.startsWith('upstream_5')) return 'The AI service is temporarily unavailable. Please try again shortly.'
  return msg
}

export function useNarrative() {
  const [text, setText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [review, setReview] = useState(null) // { level, flags }
  const abortRef = useRef(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setText(''); setStreaming(false); setDone(false); setError(null); setReview(null)
  }, [])

  const run = useCallback(async (payload) => {
    if (streaming) return
    setText(''); setDone(false); setError(null); setReview(null); setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload }),
        signal: controller.signal,
      })
      if (!resp.ok || !resp.body) {
        let detail = `HTTP ${resp.status}`
        try { detail = (await resp.json())?.error || detail } catch { /* ignore */ }
        throw new Error(detail)
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done: rdone } = await reader.read()
        if (rdone) break
        raw += decoder.decode(value, { stream: true })
        const frames = raw.split('\n\n')
        raw = frames.pop() || ''
        for (const frame of frames) {
          if (!frame.trim()) continue
          let event = 'message'; let dataLine = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          let data = null
          try { data = dataLine ? JSON.parse(dataLine) : null } catch { /* ignore */ }
          if (event === 'delta' && data?.text) setText((t) => t + data.text)
          else if (event === 'review') setReview(data)
          else if (event === 'error') throw new Error(data?.message || 'stream error')
        }
      }
      setDone(true)
    } catch (e) {
      if (e?.name !== 'AbortError') setError(friendly(e?.message))
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [streaming])

  const sections = done || text ? parseNarrativeSections(text) : null

  return { text, sections, streaming, done, error, review, run, reset }
}
