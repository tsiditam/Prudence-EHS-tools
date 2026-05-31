/**
 * Vercel Serverless Function — /api/inline-ai
 *
 * Single-shot AI text-action endpoint that powers the in-app inline
 * AI affordance (the small "AI" button next to observation textareas).
 * Streams the rewritten text via Server-Sent Events using the same
 * frame shape as /api/field-assistant — token / done / error — so the
 * client can reuse parseSseFrames().
 *
 * Body:  { action, text, context? }
 *   action  — 'improve' | 'expand' | 'concise' | 'professional'
 *   text    — the source text the user typed (≤ 4000 chars)
 *   context — optional JSON-safe object with hints (zone name,
 *             building type, etc.) for better grounding
 *
 * Auth:  Bearer token via Supabase, same as /api/narrative + /api/field-assistant.
 *
 * Model: Claude Haiku 4.5 — fastest model for short rewrites. The
 *        average inline action expects <300 output tokens, so Haiku's
 *        latency advantage matters more than Sonnet's reasoning depth.
 *
 * Quota (per user, per generation_type='inline_ai'):
 *   • 30 actions / 60s rolling window   (burst protection)
 *   • 300 actions / 24h rolling window  (daily ceiling)
 *   • 20 actions / 24h on the free plan
 *
 * Hard constraints:
 *   • Never imports from src/engines/* or src/engine/*.
 *   • Prompt explicitly tells the model not to invent measurements,
 *     occupant counts, or technical findings not present in the
 *     original — the user is editing field notes, not asking for new
 *     IH judgments.
 */

const { createClient } = require('@supabase/supabase-js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { auditLog } = require('./_audit.js')

// ── Quota / model / pricing ────────────────────────────────────────
const PER_MINUTE_LIMIT = 30
const PER_DAY_LIMIT = 300
const FREE_TIER_DAILY_CAP = 20
const ANTHROPIC_MODEL = 'claude-haiku-4-5'
const GENERATION_TYPE = 'inline_ai'

const MAX_OUTPUT_TOKENS = 600
const MAX_INPUT_TEXT_LEN = 4000

// Haiku 4.5 — $1 / $5 per M tokens (in / out). Far cheaper than Sonnet
// per call so the per-action quota can be more generous than chat.
const COST_INPUT_PER_M = 1
const COST_OUTPUT_PER_M = 5

const VALID_ACTIONS = new Set(['improve', 'expand', 'concise', 'professional'])

// Per-action system prompts. Tight and specific so Haiku can deliver
// fast, deterministic rewrites without over-thinking. Every prompt
// ends with "Return ONLY the rewritten text" so the UI can drop the
// streamed output directly into the textarea without parsing.
//
// Voice: write like a sharp human industrial hygienist, not a chatbot.
// The HUMAN_VOICE block is appended to every action so the
// anti-robotic rules stay consistent. Humanizing is STYLE ONLY — it
// never loosens the "preserve every fact / invent nothing" guardrail.
const HUMAN_VOICE = `Write like a sharp, experienced industrial hygienist talking shop — not like a chatbot. Vary sentence length and rhythm; avoid a templated cadence. Plain, direct language; active voice; concrete verbs, not nominalizations. Lead with the substance — no throat-clearing or hedging boilerplate. Never use AI-tell phrases: "It is important to note", "It is worth noting", "Overall,", "In conclusion", "Furthermore", "Moreover", "Additionally" as a crutch, "delve", "leverage" as filler, "plays a crucial/vital role", "navigate the landscape". Don't overuse em-dashes as a tic.`

const SYSTEM_PROMPTS = {
  improve: `You improve industrial-hygiene field observations. Keep every fact from the original — measurements, locations, occupant counts, observations. Make the language clearer and tighter. Do not invent new measurements, occupant counts, or technical findings. ${HUMAN_VOICE}

Example —
Robotic: "It is important to note that the CO2 levels in Room 3 were observed to be elevated, which may potentially indicate that ventilation could be insufficient in this particular area."
Human: "CO2 ran high in Room 3, which points to under-ventilation there."

Return ONLY the rewritten text — no preamble, no quotation marks, no markdown formatting.`,
  expand: `You expand brief industrial-hygiene field observations into fuller field notes. Add reasonable supporting context (e.g. why something matters, what an IH would typically check next), but do not invent specific measurements, occupant counts, or facts not stated in the original. ${HUMAN_VOICE}

Return ONLY the rewritten text — no preamble, no quotation marks, no markdown formatting.`,
  concise: `You make industrial-hygiene field observations more concise. Preserve every fact (measurements, locations, occupant counts, observations) — drop only filler words and redundant phrasing. ${HUMAN_VOICE}

Return ONLY the rewritten text — no preamble, no quotation marks, no markdown formatting.`,
  professional: `You rewrite industrial-hygiene field observations in consultant-grade language suitable for an IAQ report. Keep it neutral and technical, but readable — not stiff. Preserve every fact from the original. Do not invent measurements, occupant counts, or technical findings not present. ${HUMAN_VOICE}

Example —
Robotic: "Furthermore, it should be noted that visible water staining was identified on the ceiling tiles, which plays a crucial role in the overall moisture assessment of the space."
Human: "Visible water staining on the ceiling tiles was noted and warrants follow-up."

Return ONLY the rewritten text — no preamble, no quotation marks, no markdown formatting.`,
}

// ── Test injection hooks (mirrors api/narrative.js pattern) ────────
let _supabase = null
let _fetch = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createClient(url, key)
}
function getFetch() {
  return _fetch || global.fetch
}

function friendlyUpstreamError(raw) {
  if (raw.includes('credit balance')) return 'AI temporarily unavailable due to a billing issue. Please contact your administrator.'
  if (raw.startsWith('upstream_429')) return 'AI is busy — please try again in a moment.'
  if (raw.startsWith('upstream_401')) return 'AI authentication failed. Please contact your administrator.'
  if (raw.startsWith('upstream_5')) return 'AI service temporarily unavailable. Try again shortly.'
  return raw
}

function estimateCost(inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null
  const usd = (inputTokens * COST_INPUT_PER_M + outputTokens * COST_OUTPUT_PER_M) / 1_000_000
  return Math.round(usd * 10000) / 10000
}

async function countRowsSince(supabase, userId, sinceIso) {
  const { count, error } = await supabase
    .from('narrative_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('generation_type', GENERATION_TYPE)
    .gte('generated_at', sinceIso)
  if (error) throw new Error(error.message)
  return count || 0
}

async function findOldestSince(supabase, userId, sinceIso) {
  const { data } = await supabase
    .from('narrative_generations')
    .select('generated_at')
    .eq('user_id', userId)
    .eq('generation_type', GENERATION_TYPE)
    .gte('generated_at', sinceIso)
    .order('generated_at', { ascending: true })
    .limit(1)
    .single()
  return data && data.generated_at ? data.generated_at : null
}

async function checkRateLimits(supabase, userId, plan, now = Date.now()) {
  const oneMinAgo = new Date(now - 60_000).toISOString()
  const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString()
  const minuteCount = await countRowsSince(supabase, userId, oneMinAgo)
  if (minuteCount >= PER_MINUTE_LIMIT) {
    const oldest = await findOldestSince(supabase, userId, oneMinAgo)
    const retryAt = oldest ? new Date(oldest).getTime() + 60_000 : now + 60_000
    const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000))
    return { ok: false, scope: 'per_minute', retry_after: retryAfter }
  }
  const dayCount = await countRowsSince(supabase, userId, oneDayAgo)
  if (plan === 'free' && dayCount >= FREE_TIER_DAILY_CAP) {
    return { ok: false, scope: 'free_tier_daily', retry_after: 24 * 60 * 60 }
  }
  if (dayCount >= PER_DAY_LIMIT) {
    return { ok: false, scope: 'per_day', retry_after: 24 * 60 * 60 }
  }
  return { ok: true }
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Build the user message for the model. Includes the source text
 * inside delimiters so the model doesn't confuse it with the prompt,
 * and a small JSON-stringified context block when provided.
 */
function buildUserMessage(action, text, context) {
  const ctx = context && typeof context === 'object' && Object.keys(context).length > 0
    ? `\n\nCONTEXT (background — do not echo): ${JSON.stringify(context).slice(0, 600)}`
    : ''
  return `Apply the "${action}" action to the OBSERVATION below.${ctx}

OBSERVATION:
<<<
${text}
>>>`
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured — missing API key' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  // Body validation. Body parsing is handled by Vercel so we can read
  // it directly; in tests we hand-stub the body.
  const body = req.body || {}
  const action = String(body.action || '').toLowerCase()
  const text = typeof body.text === 'string' ? body.text : ''
  const context = body.context && typeof body.context === 'object' ? body.context : null

  if (!VALID_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'invalid_action', actions: [...VALID_ACTIONS] })
  }
  if (!text.trim()) {
    return res.status(400).json({ error: 'empty_text' })
  }
  if (text.length > MAX_INPUT_TEXT_LEN) {
    return res.status(400).json({ error: 'text_too_long', max: MAX_INPUT_TEXT_LEN })
  }

  // Plan lookup + rate-limit gate. Mirrors the narrative.js path.
  let plan = 'free'
  try {
    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
    plan = (profile && profile.plan) || 'free'
  } catch { /* missing profile treated as free */ }

  const unlimited = hasUnlimitedUsage((user && user.email) || '')
  if (!unlimited) {
    let limitCheck = { ok: true }
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[inline-ai] rate limit check failed:', err && err.message)
      return res.status(500).json({ error: 'rate_limit_check_failed' })
    }
    if (!limitCheck.ok) {
      if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(limitCheck.retry_after))
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        retry_after_seconds: limitCheck.retry_after,
        scope: limitCheck.scope,
        message: 'Inline AI rate limit reached. Please wait a moment.',
      })
    }
  }

  // Open SSE response. Once headers are set we communicate failures
  // via an 'error' frame rather than HTTP status, matching the
  // field-assistant convention.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  const system = SYSTEM_PROMPTS[action]
  const userMessage = buildUserMessage(action, text, context)

  let upstream
  try {
    upstream = await getFetch()('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Moderate temperature — enough variety to break the robotic
        // cadence, low enough that facts in the source stay intact.
        temperature: 0.6,
        system,
        stream: true,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
  } catch (err) {
    writeSse(res, 'error', { error: friendlyUpstreamError((err && err.message) || 'upstream_unreachable') })
    return res.end()
  }

  if (!upstream.ok || !upstream.body) {
    const errText = typeof upstream.text === 'function' ? await upstream.text() : ''
    writeSse(res, 'error', {
      error: friendlyUpstreamError(`upstream_${upstream.status}_${errText.slice(0, 200)}`),
    })
    return res.end()
  }

  let outputTokens = 0
  let inputTokens = 0
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Anthropic streams in lines like `event: ...\ndata: ...\n\n`.
      // Walk frame-by-frame.
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        let payload
        try { payload = JSON.parse(dataLine.slice(6)) } catch { continue }
        if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
          const tok = payload.delta.text || ''
          if (tok) writeSse(res, 'token', { text: tok })
        } else if (payload.type === 'message_start') {
          inputTokens = payload.message?.usage?.input_tokens || 0
        } else if (payload.type === 'message_delta') {
          outputTokens = payload.usage?.output_tokens || outputTokens
        }
      }
    }
  } catch (err) {
    writeSse(res, 'error', { error: friendlyUpstreamError((err && err.message) || 'stream_interrupted') })
    return res.end()
  }

  // Ledger row — same table the narrative + field-assistant use; the
  // generation_type column distinguishes them so reporting / billing
  // can slice by surface.
  const cost = estimateCost(inputTokens, outputTokens)
  try {
    await supabase.from('narrative_generations').insert({
      user_id: user.id,
      generation_type: GENERATION_TYPE,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    })
  } catch (err) {
    console.error('[inline-ai] failed to record generation:', err && err.message)
  }

  try {
    await auditLog({
      action: 'inline_ai.generate',
      actor_id: user.id,
      actor_email: user.email,
      target_type: 'inline_ai',
      details: {
        model: ANTHROPIC_MODEL,
        ai_action: action,
        input_chars: text.length,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: cost,
        plan,
      },
    })
  } catch (err) {
    console.error('[inline-ai] audit log failed:', err && err.message)
  }

  writeSse(res, 'done', {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
  })
  res.end()
}

module.exports = handler
module.exports.default = handler
module.exports.__test = {
  setSupabase(s) { _supabase = s },
  setFetch(f) { _fetch = f },
  reset() { _supabase = null; _fetch = null },
  VALID_ACTIONS,
  MAX_INPUT_TEXT_LEN,
}
