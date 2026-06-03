/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Vercel serverless function — /api/water-narrative
 *
 * The NARRATIVE layer. Generates a short, screening-only prose interpretation
 * of an assessment, streamed back as Server-Sent Events (same framing as
 * Marlow so the UI renders it live). Single-turn, no tools. Borrows AtmosFlow's
 * /api/narrative method: manifest-bound system prompt + a banned-language scan
 * emitted as a final `review` event.
 *
 * Hard constraints (enforced by lint:imports + a bundle test):
 *   - MUST NOT import the DOCX renderer (docx/docxtemplater/pizzip).
 *   - Cites only values present in the supplied payload; never invents limits.
 *
 * Diagnostic codes: wn_init_000 method · wn_init_001 missing key ·
 *   wn_init_002 bad body · wn_init_003 upstream error
 */

import { NARRATIVE_SYSTEM_PROMPT } from '../src/constants/narrative-prompt.js'
import { scanNarrative } from '../src/constants/narrative-language-guard.js'
import { getAnthropicKey } from '../lib/env'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_OUTPUT_TOKENS = 750

// In-memory per-IP burst limiter (resets on cold start; durable per-user
// ledger lands with auth/billing).
const PER_MINUTE_LIMIT = 8
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const win = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  win.push(now)
  hits.set(ip, win)
  return win.length > PER_MINUTE_LIMIT
}

function sse(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', code: 'wn_init_000' })
    return
  }
  const apiKey = getAnthropicKey()
  if (!apiKey) {
    res.status(503).json({ error: 'The narrative engine is not configured.', code: 'wn_init_001' })
    return
  }

  let body: any = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const payload = body?.payload
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Expected { payload: {...} }.', code: 'wn_init_002' })
    return
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment.', code: 'wn_init_000' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.6,
        system: [{ type: 'text', text: NARRATIVE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`upstream_${resp.status}: ${text.slice(0, 200)}`)
    }
    const data: any = await resp.json()
    let text: string = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    if (!text) text = 'A narrative could not be composed from the available assessment data.'

    // Chunk-emit for a live feel (same pseudo-stream as Marlow).
    const tokens = text.match(/\S+\s*/g) || [text]
    let buf = ''
    for (let i = 0; i < tokens.length; i++) {
      buf += tokens[i]
      if (buf.length >= 20 || i === tokens.length - 1) {
        sse(res, 'delta', { text: buf })
        buf = ''
        await new Promise((r) => setTimeout(r, 10))
      }
    }
    const review = scanNarrative(text)
    sse(res, 'review', review)
    sse(res, 'done', { ok: true })
    res.end()
  } catch (err: any) {
    sse(res, 'error', { message: err?.message || 'unknown error', code: 'wn_init_003' })
    res.end()
  }
}
