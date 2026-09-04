/**
 * Vercel Serverless Function — /api/narrative
 *
 * Proxies AI narrative generation to the Anthropic API. The API key
 * stays server-side; the browser never sees it.
 *
 * The system prompt is SERVER-OWNED (api/_narrative-prompt.js). A client
 * that still sends `system` in the body is ignored — the old handler
 * passed it verbatim, which made this an open Claude proxy for any
 * signed-in user (audit 2026-09 H1). The payload is capped at
 * MAX_PAYLOAD_CHARS (413 above it).
 *
 * Three rate-limit gates before the upstream call:
 *   1. Per-user: 10 generations / 60s rolling window
 *   2. Per-user: 100 generations / 24h rolling window
 *   3. Free tier: 5 generations / 24h regardless of credit balance
 * All three count ONLY generation_type='narrative' rows, so a photo or
 * inline-AI burst never eats the narrative budget.
 *
 * The ledger row is RESERVED before the upstream call and finalized with
 * token counts after (api/_rate-limit.js) — parallel requests can no longer
 * all pass the count, and a failed upstream call releases its reservation.
 *
 * On a hit, returns 429 with a Retry-After header and an actionable
 * error body.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { scan: scanBannedLanguage, scanStyle } = require('./_banned-language.js')
const { REASONING_SYSTEM_PROMPT } = require('./_narrative-prompt.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const GENERATION_TYPE = 'narrative'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15
// A real assessment payload is ~6-30 KB compacted. 60 KB is generous
// headroom; anything past it is not an assessment.
const MAX_PAYLOAD_CHARS = 60_000

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

let _fetch = null
function getFetch() {
  return _fetch || global.fetch
}

function estimateCost(inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null
  const usd = (inputTokens * COST_INPUT_PER_M + outputTokens * COST_OUTPUT_PER_M) / 1_000_000
  return Math.round(usd * 10000) / 10000
}

async function checkRateLimits(supabase, userId, plan, now = Date.now()) {
  return rateLimit.checkRateLimits(
    supabase, userId, plan,
    { perMinute: PER_MINUTE_LIMIT, perDay: PER_DAY_LIMIT, freeTierDaily: FREE_TIER_DAILY_CAP },
    GENERATION_TYPE, now,
  )
}

async function callAnthropic(apiKey, system, payload) {
  const fetchFn = getFetch()
  return fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      // Raised from 800 -> 3000 when the prompt's length target moved to
      // ~600-900 words. The prompt is what governs length (see
      // "# Formatting and length" in REASONING_SYSTEM_PROMPT); this
      // ceiling only decides whether a long draft finishes its sentence.
      // 900 words is ~1,200 tokens, so 3000 is deliberate slack: a cap
      // that clips is worse than a short narrative, because it ends
      // mid-recommendation and the assessor cannot tell it was truncated.
      max_tokens: 3000,
      temperature: 0.7,
      system,
      messages: [{
        role: 'user',
        // Compact, not pretty-printed. The indentation was ~2,300 of the
        // ~5,900 characters sent and bought the model nothing.
        content: `Based ONLY on this data, write a professional IAQ findings narrative:\n\n${JSON.stringify(payload)}`,
      }],
    }),
  })
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured — missing API key' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  // Body validation happens before any DB round trip.
  const body = req.body || {}
  const { payload } = body
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Missing payload in request body' })
  }
  let payloadLength
  try {
    payloadLength = JSON.stringify(payload).length
  } catch {
    return res.status(400).json({ error: 'payload_not_serializable' })
  }
  if (payloadLength > MAX_PAYLOAD_CHARS) {
    return res.status(413).json({ error: 'payload_too_large', max_chars: MAX_PAYLOAD_CHARS })
  }
  // `body.system` is deliberately ignored — see the header comment.
  const system = REASONING_SYSTEM_PROMPT

  let plan = 'free'
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    plan = (profile && profile.plan) || 'free'
  } catch {
    // Profile missing — treat as free tier.
  }

  // Unlimited-usage allowlist (UNLIMITED_USAGE_EMAILS env var). Skip
  // the per-minute / per-day / free-tier gates entirely for emails on
  // the allowlist so internal test accounts can exercise narrative
  // generation without bumping into the production caps. See
  // lib/unlimited-usage.js for the contract.
  const userEmail = (user && user.email) || ''
  const unlimited = hasUnlimitedUsage(userEmail)

  let limitCheck = { ok: true }
  if (!unlimited) {
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[narrative] rate limit check failed:', err && err.message)
      return res.status(500).json({ error: 'rate_limit_check_failed' })
    }
  }
  if (!limitCheck.ok) {
    if (typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', String(limitCheck.retry_after))
    }
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      retry_after_seconds: limitCheck.retry_after,
      scope: limitCheck.scope,
      message: 'Narrative generation rate limit reached. Please wait or contact support if you need to process more reports today.',
    })
  }

  // Reserve the ledger row BEFORE the upstream call.
  let reservation
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'narrative' })
  } catch {
    return res.status(500).json({ error: 'ledger_reserve_failed' })
  }

  let response
  try {
    response = await callAnthropic(apiKey, system, payload)
  } catch (e) {
    console.error('[narrative] anthropic call threw:', e && e.message)
    await rateLimit.releaseGeneration(supabase, reservation.id, 'narrative')
    return res.status(502).json({ error: 'upstream_unreachable' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    console.error('[narrative] anthropic non-2xx:', response.status, String(errText).slice(0, 300))
    await rateLimit.releaseGeneration(supabase, reservation.id, 'narrative')
    const status = response.status === 429 ? 429 : 502
    return res.status(status).json({ error: `upstream_${response.status}` })
  }

  const data = await response.json()
  const text = data.content
    && data.content.map(b => b && b.type === 'text' ? b.text : '').filter(Boolean).join('\n') || null

  // Lint the AI narrative with the same ruleset as the deterministic
  // engine prose. We do NOT hard-block: the client suppresses an
  // unclean narrative and falls back to the validated deterministic
  // report, while the flags travel in the response + audit log so the
  // failure is observable.
  const bannedLanguage = text ? scanBannedLanguage(text) : []
  const styleFlags = text ? scanStyle(text) : []
  const languageReview = bannedLanguage.length > 0 ? 'failed' : 'passed'

  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  // Finalize the reservation with the real token counts and write the
  // audit entry. Both are bookkeeping; they run together. Still awaited,
  // not fire-and-forget: the serverless runtime can freeze the instance
  // the moment the response is sent.
  //
  // Renamed `narrative.generate` → `narrative_generated` (connectivity
  // PR D EventName allowlist).
  const recordUsage = rateLimit.finalizeGeneration(
    supabase, reservation.id, { inputTokens, outputTokens, cost }, 'narrative',
  )

  const recordAudit = auditLog({
    action: 'narrative_generated',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'narrative',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      language_review: languageReview,
      banned_language_count: bannedLanguage.length,
      style_flag_count: styleFlags.length,
    },
    req,
  }).catch((err) => console.error('[narrative] audit log failed:', err && err.message))

  await Promise.all([recordUsage, recordAudit])

  return res.status(200).json({
    narrative: text,
    language_review: languageReview,
    banned_language: bannedLanguage,
    style_flags: styleFlags,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = withSentry(handler, { route: 'narrative' })
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropic,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  GENERATION_TYPE,
  ANTHROPIC_MODEL,
  MAX_PAYLOAD_CHARS,
  REASONING_SYSTEM_PROMPT,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
