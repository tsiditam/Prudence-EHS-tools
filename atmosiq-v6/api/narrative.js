/**
 * Vercel Serverless Function — /api/narrative
 *
 * Proxies AI narrative generation to the Anthropic API. The API key
 * stays server-side; the browser never sees it.
 *
 * Three rate-limit gates before the upstream call:
 *   1. Per-user: 10 generations / 60s rolling window
 *   2. Per-user: 100 generations / 24h rolling window
 *   3. Free tier: 5 generations / 24h regardless of credit balance
 *
 * On a hit, returns 429 with a Retry-After header and an actionable
 * error body. Successful generations write a row to
 * narrative_generations with token counts and estimated cost so per-user
 * gross margin is observable.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15

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

async function countRowsSince(supabase, userId, sinceIso) {
  const { count, error } = await supabase
    .from('narrative_generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('generated_at', sinceIso)
  if (error) throw new Error(error.message)
  return count || 0
}

async function findOldestSince(supabase, userId, sinceIso) {
  const { data } = await supabase
    .from('narrative_generations')
    .select('generated_at')
    .eq('user_id', userId)
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
      max_tokens: 1000,
      system,
      messages: [{
        role: 'user',
        content: `Based ONLY on this data, write a professional IAQ findings narrative:\n\n${JSON.stringify(payload, null, 2)}`,
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

  let limitCheck
  try {
    limitCheck = await checkRateLimits(supabase, user.id, plan)
  } catch (err) {
    console.error('[narrative] rate limit check failed:', err && err.message)
    return res.status(500).json({ error: 'rate_limit_check_failed' })
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

  const body = req.body || {}
  const { system, payload } = body
  if (!system || !payload) {
    return res.status(400).json({ error: 'Missing system or payload in request body' })
  }

  let response
  try {
    response = await callAnthropic(apiKey, system, payload)
  } catch (e) {
    return res.status(500).json({ error: (e && e.message) || 'anthropic call failed' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    return res.status(response.status).json({ error: errText })
  }

  const data = await response.json()
  const text = data.content
    && data.content.map(b => b && b.type === 'text' ? b.text : '').filter(Boolean).join('\n') || null
  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  try {
    await supabase.from('narrative_generations').insert({
      user_id: user.id,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    })
  } catch (err) {
    console.error('[narrative] failed to record generation:', err && err.message)
  }

  await auditLog({
    action: 'narrative.generate',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'narrative',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
    },
    req,
  })

  return res.status(200).json({
    narrative: text,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = handler
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropic,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  ANTHROPIC_MODEL,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
