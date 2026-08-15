/**
 * Vercel Serverless Function — /api/report-editorial-review
 *
 * The editorial-review pass. Given a digest of the assembled consultant
 * report's CUTTABLE content plus the case facts, an LLM acting as a senior
 * CIH editor proposes which items to cut — the case-specific over-production
 * that the deterministic report rules cannot catch. It ONLY proposes; the
 * reviewing professional approves each cut in the UI, and the approved set is
 * applied by the renderer (src/utils/editorialSuppressions.js). No model text
 * enters the client report, so there is no AI-provenance obligation.
 *
 * The model references digest item ids only — it cannot invent a target — so
 * every suggestion maps back to a concrete, renderer-honored suppression.
 *
 * Mirrors api/narrative.js: server-side key, Bearer auth, the three rate-limit
 * gates over narrative_generations, and the __test mock hooks.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15
const MAX_OUTPUT_TOKENS = 1500

// Target kinds the renderer can apply (keep in step with
// src/utils/editorialSuppressions.js SUPPRESSION_KINDS).
const ALLOWED_KINDS = new Set(['finding', 'zone', 'resultsSubsection', 'recommendation', 'section'])
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low'])

const EDITORIAL_SYSTEM_PROMPT = [
  'You are a senior Certified Industrial Hygienist (CIH) acting as the editorial reviewer of a screening-level indoor air quality (IAQ) report before it is issued to a client.',
  '',
  'Your single guiding principle: do NOT keep a technically correct statement simply because the system can generate it. A line earns its place only if it materially helps the CIH explain a finding, support a conclusion, establish a limitation, or tell the client what to do next. Everything else is over-production and should be cut for a cleaner, more credible, more defensible deliverable.',
  '',
  'You will receive:',
  '  - reportDigest.items: the report content that CAN be cut. Each item has an "id", a "kind", and a short "text" describing it.',
  '  - caseFacts: what this investigation actually is (building type, scope, findings, whether a cleanroom/data-center classification is in scope, etc.).',
  '',
  'Propose cuts ONLY by referencing item ids from reportDigest.items. Do not invent ids or targets. For each item you would cut, give a one-sentence, specific rationale grounded in THIS case, and a confidence.',
  '',
  'Bias toward restraint but stay conservative about clinical/professional substance: never propose cutting a genuine measurement result, a real limitation, or a recommendation that a routine reader needs. Prefer cutting: disproportionate or scope-creep recommendations, redundant or over-reaching interpretation, background material that belongs in an appendix, and follow-up steps not justified by the actual findings. Preserve the screening-only posture.',
  '',
  'Respond with STRICT JSON only, no prose, no code fences, in exactly this shape:',
  '{"suggestions":[{"id":"<item id>","rationale":"<one sentence, this-case-specific>","confidence":"high|medium|low"}]}',
  'If nothing should be cut, respond {"suggestions":[]}.',
].join('\n')

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

async function callAnthropic(apiKey, payload) {
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
      max_tokens: MAX_OUTPUT_TOKENS,
      // Low temperature: this is an editorial judgment task, not creative
      // writing. We want stable, defensible cut proposals.
      temperature: 0.2,
      system: EDITORIAL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Review this report for over-production and propose cuts.\n\n${JSON.stringify(payload, null, 2)}`,
      }],
    }),
  })
}

/**
 * Parse the model's JSON, tolerating stray prose or code fences. Returns the
 * suggestions array or [] on any failure — a malformed model response yields
 * "no suggestions", never a crash.
 */
function parseSuggestions(text) {
  if (!text || typeof text !== 'string') return []
  let jsonText = text.trim()
  // Strip code fences if present.
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) jsonText = fence[1].trim()
  // If there is surrounding prose, isolate the outermost object.
  if (jsonText[0] !== '{') {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start !== -1 && end > start) jsonText = jsonText.slice(start, end + 1)
  }
  try {
    const parsed = JSON.parse(jsonText)
    return Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  } catch {
    return []
  }
}

/**
 * Map model suggestions (which reference digest item ids) back to concrete,
 * renderer-honored cut targets. Drops any suggestion whose id is unknown or
 * whose target kind is not applicable — the model can only cut what exists.
 */
function resolveSuggestions(rawSuggestions, digestItems) {
  const byId = new Map()
  for (const item of (Array.isArray(digestItems) ? digestItems : [])) {
    if (item && item.id != null) byId.set(String(item.id), item)
  }
  const seen = new Set()
  const out = []
  for (const s of rawSuggestions) {
    if (!s || s.id == null) continue
    const item = byId.get(String(s.id))
    if (!item || !item.target || !ALLOWED_KINDS.has(item.target.kind)) continue
    if (seen.has(String(s.id))) continue
    seen.add(String(s.id))
    out.push({
      target: item.target,
      label: typeof item.text === 'string' ? item.text : '',
      rationale: typeof s.rationale === 'string' ? s.rationale : '',
      confidence: ALLOWED_CONFIDENCE.has(s.confidence) ? s.confidence : 'medium',
    })
  }
  return out
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

  const userEmail = (user && user.email) || ''
  const unlimited = hasUnlimitedUsage(userEmail)

  let limitCheck = { ok: true }
  if (!unlimited) {
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[editorial-review] rate limit check failed:', err && err.message)
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
      message: 'Editorial-review rate limit reached. Please wait or contact support if you need to process more reports today.',
    })
  }

  const body = req.body || {}
  const payload = body.payload
  if (!payload || !payload.reportDigest || !Array.isArray(payload.reportDigest.items)) {
    return res.status(400).json({ error: 'Missing payload.reportDigest.items in request body' })
  }

  let response
  try {
    response = await callAnthropic(apiKey, payload)
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

  const suggestions = resolveSuggestions(parseSuggestions(text), payload.reportDigest.items)

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
    console.error('[editorial-review] failed to record generation:', err && err.message)
  }

  await auditLog({
    action: 'editorial_review_generated',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'editorial_review',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      item_count: payload.reportDigest.items.length,
      suggestion_count: suggestions.length,
    },
    req,
  })

  return res.status(200).json({
    suggestions,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = handler
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropic,
  parseSuggestions,
  resolveSuggestions,
  EDITORIAL_SYSTEM_PROMPT,
  ANTHROPIC_MODEL,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
