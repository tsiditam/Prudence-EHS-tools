/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Vercel serverless function — /api/water-assistant
 *
 * Streaming conversational endpoint that powers Marlow, HydroScan's in-app
 * water-quality assistant. Modeled on AtmosFlow's /api/field-assistant:
 *   - Response is Server-Sent Events (SSE) so the UI streams the answer.
 *   - The grounding corpus (role prompt + manifest standards) is sent as
 *     Anthropic cache_control:'ephemeral' system blocks so the bulk of input
 *     tokens hit the cache after the first warm request.
 *   - Read-only, manifest-bound tools resolve every regulatory value; Marlow
 *     never invents a number (see water-assistant-prompt.js).
 *
 * Hard constraints:
 *   - MUST NOT import the DOCX renderer (docxtemplater/pizzip). Report
 *     rendering stays in its own endpoint (Phase 4). A bundle test enforces
 *     this.
 *   - Stateless v1: the client sends the message history. Supabase-persisted
 *     conversations arrive with auth (Phase 5); migration 013 is staged.
 *
 * Diagnostic codes (in the error body, for debugging only):
 *   wa_init_000 method · wa_init_001 missing ANTHROPIC_API_KEY ·
 *   wa_init_002 bad body · wa_init_003 upstream error
 */

import { WATER_ASSISTANT_TOOLS, dispatchTool } from '../src/constants/water-assistant-tools.js'
import { WATER_ASSISTANT_ROLE_PROMPT, buildContextBlock } from '../src/constants/water-assistant-prompt.js'
import { STANDARDS_CORPUS_TEXT } from '../src/constants/water-assistant-corpus.js'
import { getAnthropicKey } from '../lib/env'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_OUTPUT_TOKENS = 900
const MAX_TOOL_ROUNDS = 4
const MAX_HISTORY_TURNS = 20
const MAX_USER_MESSAGE_LEN = 4000

// ── Lightweight in-memory burst limiter (per IP). Resets on cold start;
//    a durable per-user ledger lands with auth/billing (Phases 5–6). ──
const PER_MINUTE_LIMIT = 15
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const win = (hits.get(ip) || []).filter((t) => now - t < 60_000)
  win.push(now)
  hits.set(ip, win)
  return win.length > PER_MINUTE_LIMIT
}

type Msg = { role: 'user' | 'assistant'; content: any }

function sse(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

async function callAnthropic(apiKey: string, system: any[], messages: Msg[]) {
  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      tools: WATER_ASSISTANT_TOOLS,
      messages,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`upstream_${resp.status}: ${text.slice(0, 300)}`)
  }
  return resp.json()
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', code: 'wa_init_000' })
    return
  }
  const apiKey = getAnthropicKey()
  if (!apiKey) {
    res.status(503).json({ error: 'The AI assistant is not configured.', code: 'wa_init_001' })
    return
  }

  // Parse body (Vercel pre-parses JSON; fall back to raw).
  let body: any = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const incoming = Array.isArray(body?.messages) ? body.messages : null
  if (!incoming) {
    res.status(400).json({ error: 'Expected { messages: [...] }.', code: 'wa_init_002' })
    return
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment.', code: 'wa_init_000' })
    return
  }

  // Normalize + clamp client history.
  const history: Msg[] = incoming
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MAX_USER_MESSAGE_LEN) }))
  if (!history.length) {
    res.status(400).json({ error: 'No usable messages.', code: 'wa_init_002' })
    return
  }

  // Cached system blocks (byte-stable) + per-request context (uncached, last).
  const system = [
    { type: 'text', text: WATER_ASSISTANT_ROLE_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: STANDARDS_CORPUS_TEXT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `(Reference only.)${buildContextBlock(body?.context)}` },
  ]

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  const messages: Msg[] = [...history]
  try {
    let finalText = ''
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const data: any = await callAnthropic(apiKey, system, messages)
      const blocks: any[] = data?.content || []
      const toolUses = blocks.filter((b) => b.type === 'tool_use')

      if (data?.stop_reason === 'tool_use' && toolUses.length && round < MAX_TOOL_ROUNDS) {
        messages.push({ role: 'assistant', content: blocks })
        const toolResults = toolUses.map((tu) => {
          sse(res, 'tool', { name: tu.name, status: 'running' })
          const result = dispatchTool(tu.name, tu.input || {})
          sse(res, 'tool', { name: tu.name, status: 'done', found: (result as any)?.found })
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) }
        })
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      finalText = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
      break
    }

    if (!finalText) finalText = 'I could not compose an answer. Please rephrase your question.'

    // Stream the final answer to the client in small chunks for a live feel.
    const tokens = finalText.match(/\S+\s*/g) || [finalText]
    let buf = ''
    for (let i = 0; i < tokens.length; i++) {
      buf += tokens[i]
      if (buf.length >= 18 || i === tokens.length - 1) {
        sse(res, 'delta', { text: buf })
        buf = ''
        await new Promise((r) => setTimeout(r, 12))
      }
    }
    sse(res, 'done', { ok: true })
    res.end()
  } catch (err: any) {
    const msg = err?.message || 'unknown error'
    sse(res, 'error', { message: msg, code: 'wa_init_003' })
    res.end()
  }
}
