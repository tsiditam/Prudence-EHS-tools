/**
 * Vercel Serverless Function — /api/inline-complete
 *
 * Predictive ghost-text completion for the observation textareas.
 * Powers the Gmail-Smart-Compose-style faded text that appears
 * inline as the assessor types in any free-text field.
 *
 * Body:  { text, context? }
 *   text    — what the user has typed so far (≤ 4000 chars)
 *   context — optional JSON-safe hints (zone name, question prompt,
 *             building type, etc.)
 *
 * Response: JSON { completion: string }
 *   • completion is a SHORT continuation (≤ ~25 words / 60 tokens),
 *     starting from the cursor — never repeats the user's text.
 *   • completion may be empty string when the model declines.
 *
 * Why JSON not SSE: completions are short and atomic. Streaming
 * tokens into the ghost overlay one at a time creates a flickery
 * jumping-text experience. The ghost should appear as a single
 * delta after the debounce window settles.
 *
 * Auth: Bearer token via Supabase, same as the other AI endpoints.
 *
 * Model: Claude Haiku 4.5 — chosen for sub-300ms TTFT. Per-call
 * cost ≈ $0.0003 at the typical 200-token input / 30-token output.
 *
 * Quota (per user, per generation_type='inline_complete'):
 *   • 60 completions / 60s rolling window    (per-keystroke flux)
 *   • 1000 completions / 24h rolling window  (daily ceiling)
 *   • 100 completions / 24h on the free plan
 *
 * The per-minute window is high because ghost-text fires
 * automatically on debounce, not on user click. Most field
 * sessions will burn <50 of the budget.
 */

const { createClient } = require('@supabase/supabase-js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PER_MINUTE_LIMIT = 60
const PER_DAY_LIMIT = 1000
const FREE_TIER_DAILY_CAP = 100
const ANTHROPIC_MODEL = 'claude-haiku-4-5'
const GENERATION_TYPE = 'inline_complete'

const MAX_OUTPUT_TOKENS = 60
const MAX_INPUT_TEXT_LEN = 4000
const COST_INPUT_PER_M = 1
const COST_OUTPUT_PER_M = 5

// System prompt is short by design — the model needs to be fast.
// The "DO NOT REPEAT" instruction prevents the common failure mode
// where Haiku echoes the user's text before continuing.
const SYSTEM_PROMPT = `You complete what the user is typing in a field-observation textarea for an industrial-hygiene assessment.

Rules:
  • Return ONLY the continuation — the next ~5 to 20 words. Do not repeat the user's text.
  • Continue naturally from the LAST character of what's been typed. If the last character is mid-word, complete that word first. If it's a space, start with a word. If it's a period, start with a capital.
  • Tone: neutral technical, professional. Match the user's apparent register (formal vs informal).
  • Do NOT invent specific measurements, numbers, occupant counts, dates, or technical findings unless the user's text strongly implies them.
  • Do NOT include preamble, markdown, quotation marks, or explanations.
  • If you can't predict a reasonable continuation, return the empty string.`

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

function estimateCost(inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null
  const usd = (inputTokens * COST_INPUT_PER_M + outputTokens * COST_OUTPUT_PER_M) / 1_000_000
  return Math.round(usd * 100000) / 100000
}

async function checkRateLimits(supabase, userId, plan, now = Date.now()) {
  return rateLimit.checkRateLimits(
    supabase, userId, plan,
    { perMinute: PER_MINUTE_LIMIT, perDay: PER_DAY_LIMIT, freeTierDaily: FREE_TIER_DAILY_CAP },
    GENERATION_TYPE, now,
  )
}

/**
 * Clean up the model's raw output before returning it as the ghost
 * suffix:
 *   1. Strip surrounding quotes / em-dash / colon noise that Haiku
 *      sometimes emits despite the prompt.
 *   2. If the model echoed the tail of the user's text before
 *      continuing, strip the echo. Walks descending suffix lengths
 *      so the longest echo wins.
 *
 * Leading whitespace is preserved — the ghost glues directly onto
 * the user's text, so a leading space is usually correct ("CO2
 * elevated" + " in the room" reads naturally).
 */
function sanitizeCompletion(raw, userText) {
  if (!raw || typeof raw !== 'string') return ''
  let s = raw
  // Strip surrounding quotes
  s = s.replace(/^["'`]+|["'`]+$/g, '')
  // Strip leading prefix noise the model sometimes adds: em-dash,
  // ellipsis, leading colon — and any whitespace immediately
  // following them (so "—  text" becomes "text" not "  text").
  // Pure leading whitespace with no punct is preserved, since the
  // ghost glues directly onto the user's text and a leading space
  // is usually correct.
  s = s.replace(/^[\-—…:]+\s*/, '')

  // Echo-tail strip. For each candidate suffix length N walking
  // down from 40 to 3, check whether the completion (with leading
  // whitespace trimmed for comparison only) starts with the
  // user's last N chars. The first match wins, since longer
  // suffixes are more specific. We slice from the ORIGINAL string
  // so we preserve any leading-space characters that follow the
  // echoed text.
  if (typeof userText === 'string' && userText.length >= 3) {
    const lowered = s.toLowerCase().replace(/^\s+/, '')
    const leadingSpace = s.length - lowered.length === 0
      ? 0
      : s.search(/\S/) // index of first non-whitespace char in s
    for (let n = Math.min(40, userText.length); n >= 3; n--) {
      const suffix = userText.slice(-n).toLowerCase()
      if (lowered.startsWith(suffix)) {
        const stripFrom = (leadingSpace === -1 ? 0 : leadingSpace) + suffix.length
        s = s.slice(stripFrom)
        break
      }
    }
  }
  return s
}

function buildUserMessage(text, context) {
  const ctx = context && typeof context === 'object' && Object.keys(context).length > 0
    ? `\n\nCONTEXT (background — do not echo): ${JSON.stringify(context).slice(0, 500)}`
    : ''
  return `Complete the OBSERVATION below. Return only the continuation.${ctx}

OBSERVATION (so far):
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
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = req.body || {}
  const text = typeof body.text === 'string' ? body.text : ''
  const context = body.context && typeof body.context === 'object' ? body.context : null

  if (!text.trim() || text.length < 6) {
    // Below the threshold where a completion is meaningful. Return
    // empty so the UI shows no ghost without burning a Haiku call.
    return res.status(200).json({ completion: '' })
  }
  if (text.length > MAX_INPUT_TEXT_LEN) {
    return res.status(400).json({ error: 'text_too_long', max: MAX_INPUT_TEXT_LEN })
  }

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
      console.error('[inline-complete] rate limit check failed:', err && err.message)
      return res.status(500).json({ error: 'rate_limit_check_failed' })
    }
    if (!limitCheck.ok) {
      if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(limitCheck.retry_after))
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        retry_after_seconds: limitCheck.retry_after,
        scope: limitCheck.scope,
      })
    }
  }

  // Reserve the ledger row BEFORE the upstream call (api/_rate-limit.js).
  let reservation
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'inline-complete' })
  } catch {
    return res.status(500).json({ error: 'ledger_reserve_failed' })
  }

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
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(text, context) }],
      }),
    })
  } catch (err) {
    console.error('[inline-complete] anthropic call threw:', err && err.message)
    await rateLimit.releaseGeneration(supabase, reservation.id, 'inline-complete')
    return res.status(502).json({ error: 'upstream_unreachable' })
  }

  if (!upstream.ok) {
    const errText = typeof upstream.text === 'function' ? await upstream.text() : ''
    console.error('[inline-complete] anthropic non-2xx:', upstream.status, String(errText).slice(0, 300))
    await rateLimit.releaseGeneration(supabase, reservation.id, 'inline-complete')
    const status = upstream.status === 429 ? 429 : 502
    return res.status(status).json({ error: `upstream_${upstream.status}` })
  }

  let data
  try {
    data = await upstream.json()
  } catch {
    await rateLimit.releaseGeneration(supabase, reservation.id, 'inline-complete')
    return res.status(502).json({ error: 'upstream_invalid_json' })
  }

  const rawCompletion = (data.content || [])
    .map((b) => (b && b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('')
  const completion = sanitizeCompletion(rawCompletion, text)
  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  await rateLimit.finalizeGeneration(supabase, reservation.id, { inputTokens, outputTokens, cost }, 'inline-complete')

  // No audit log row per completion — too noisy (60/min). The
  // generation_type='inline_complete' ledger row gives us
  // per-user counts + cost for billing/reporting without the
  // audit-log overhead.

  return res.status(200).json({
    completion,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
  })
}

const wrapped = withSentry(handler, { route: 'inline-complete' })
module.exports = wrapped
module.exports.default = wrapped
module.exports.__test = {
  setSupabase(s) { _supabase = s },
  setFetch(f) { _fetch = f },
  reset() { _supabase = null; _fetch = null },
  sanitizeCompletion,
  MAX_INPUT_TEXT_LEN,
  GENERATION_TYPE,
}
