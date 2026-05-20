/**
 * Vercel Serverless Function — /api/photo-analyze
 *
 * Multimodal photo analysis for AtmosFlow field photos. Closes the
 * Play-1 "AI in the loop" gap from the strategic review: assessor
 * captures a photo of a finding (mold growth, water damage, HVAC
 * condition, dust accumulation, etc.) → this endpoint returns a
 * structured screening analysis the IH reviews before it lands in
 * the report.
 *
 * Screening-only positioning (CLAUDE.md):
 *   • Never definitive species ID
 *   • Always recommends confirmatory sampling
 *   • Always sets ih_review_required: true on the response
 *   • Cites IICRC S520 / EPA / OSHA references when relevant; the
 *     prompt explicitly forbids invented citation strings.
 *
 * Rate-limit gates (mirror api/narrative.js patterns):
 *   1. Per-user: 10 analyses / 60s rolling window
 *   2. Per-user: 100 analyses / 24h rolling window
 *   3. Free tier: 5 analyses / 24h regardless of credit balance
 *
 * Records each successful analysis to narrative_generations (the
 * existing AI-cost ledger) with a generation_type='photo_analysis'
 * audit tag, so per-user gross margin stays observable. Reusing
 * the table avoids a new migration for the prototype.
 *
 * Test injection (per CLAUDE.md note 2): __test.setSupabase /
 * setFetch / resetSupabase / resetFetch swap the singletons so
 * tests don't need vi.mock against require() calls.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1200
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

/**
 * Extract the base64 payload + MIME type from a data URL. Returns
 * null when the input isn't a recognizable JPEG/PNG data URL — the
 * caller treats null as "reject the request" rather than passing
 * garbage to Anthropic.
 */
function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return null
  return { mediaType: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2] }
}

const SYSTEM_PROMPT = `You are an AI screening assistant for AtmosFlow, an indoor air quality (IAQ) assessment platform used by certified industrial hygienists (CIHs) and EHS professionals.

You are looking at a single field photo captured during an IAQ walkthrough. Your job is to describe what is visibly relevant to IAQ and propose what a qualified IH might consider doing next. You are NOT making a diagnosis, not identifying species, not assigning OSHA compliance status, and not making remediation decisions. Your output is screening-only.

Output requirements (STRICT):
1. Return ONE valid JSON object only — no prose before or after.
2. Schema (every field required; use null for absent values):
   {
     "observed": string,              // 1-2 sentence factual description of what is visible (color, location, surrounding context). Do NOT speculate beyond what is visible.
     "concerns": string[],            // 0-5 short concerns, each a clause (e.g. "Visible dark growth on porous substrate"). Empty array when no IAQ concerns are apparent.
     "probable_iaq_class": string|null, // Tentative classification — e.g. "Possible IICRC S520 Condition 2 (settled spores or indirectly-contaminated materials)". Always hedged ("possible", "consistent with"). null when not applicable.
     "recommended_actions": string[], // 0-5 brief next-step recommendations — e.g. "Consider Air-O-Cell spore trap sample for AOC + outdoor reference", "Document moisture content with pin meter". Screening-level only.
     "confidence": "low"|"medium"|"high", // Your confidence in the visual analysis. Most photos should be "low" or "medium".
     "citations": string[],           // 0-4 standards / references RELEVANT to the proposed actions. Allowed: IICRC S520-2024, EPA Mold Remediation in Schools and Commercial Buildings, ASHRAE 62.1-2025, ASHRAE 55-2023, OSHA Z-1 PELs (29 CFR 1910.1000), NIOSH RELs, ASHRAE 241-2023, ACGIH TLVs. Never invent a citation.
     "disclaimers": string            // Hardcoded note acknowledging screening-only positioning and IH-review requirement.
   }
3. NEVER claim definitive species identification, definitive compliance status, or final remediation tier from a photo alone.
4. NEVER use the phrase "AI confirms" or "AI determines" — use "AI screening suggests" / "may warrant" / "consider".
5. When in doubt, prefer a LOWER confidence value and add a recommended_action that proposes confirmatory sampling.
6. If the photo shows NO IAQ-relevant content (e.g. exterior, blank wall, person's face), return empty concerns/recommended_actions arrays, probable_iaq_class: null, confidence: "low", and observed: 1 sentence describing what is shown.`

const USER_PROMPT_TEMPLATE = `Analyze this IAQ field photo. Return the JSON object specified in your system prompt.

Optional context from the assessor (use only to disambiguate; never as a basis for invented detail):
{CONTEXT}`

async function callAnthropicVision(apiKey, imageDataUrl, contextText) {
  const fetchFn = getFetch()
  const img = parseImageDataUrl(imageDataUrl)
  if (!img) {
    const err = new Error('invalid_image_data_url')
    err._client = true
    throw err
  }
  const userText = USER_PROMPT_TEMPLATE.replace('{CONTEXT}', contextText || '(no additional context provided)')
  return fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          { type: 'text', text: userText },
        ],
      }],
    }),
  })
}

/**
 * Pull the assistant's first text block out of the Anthropic
 * response, parse JSON, and normalize into the canonical
 * PhotoAnalysis shape. Returns null when the response can't be
 * parsed; caller surfaces an error.
 */
function parseModelResponse(data) {
  if (!data || !Array.isArray(data.content)) return null
  const textBlock = data.content.find(b => b && b.type === 'text')
  if (!textBlock || typeof textBlock.text !== 'string') return null
  let parsed
  try {
    // The system prompt instructs JSON-only output, but be defensive
    // against leading whitespace or a markdown code-fence wrapper that
    // sometimes survives despite instructions.
    const text = textBlock.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim()
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  // Coerce + clamp fields to the canonical shape — defensive against
  // model output that omits or fuzzes a field.
  const clampStr = (v) => (typeof v === 'string' ? v : null)
  const clampArr = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
  const conf = ['low', 'medium', 'high'].includes(parsed && parsed.confidence) ? parsed.confidence : 'low'
  return {
    observed: clampStr(parsed && parsed.observed) || '',
    concerns: clampArr(parsed && parsed.concerns).slice(0, 5),
    probable_iaq_class: clampStr(parsed && parsed.probable_iaq_class),
    recommended_actions: clampArr(parsed && parsed.recommended_actions).slice(0, 5),
    confidence: conf,
    citations: clampArr(parsed && parsed.citations).slice(0, 4),
    disclaimers: clampStr(parsed && parsed.disclaimers) ||
      'Screening-level visual analysis only. AI cannot make species ID or final remediation determinations. Must be reviewed by a qualified industrial hygienist before client distribution.',
    ih_review_required: true,
    model: ANTHROPIC_MODEL,
    generated_at: new Date().toISOString(),
  }
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
    // Free tier on missing profile.
  }

  let limitCheck
  try {
    limitCheck = await checkRateLimits(supabase, user.id, plan)
  } catch (err) {
    console.error('[photo-analyze] rate limit check failed:', err && err.message)
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
      message: 'Photo analysis rate limit reached. Please wait or contact support if you need to process more photos today.',
    })
  }

  const body = req.body || {}
  const { image, context } = body
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image (data URL) in request body' })
  }
  if (!parseImageDataUrl(image)) {
    return res.status(400).json({ error: 'image must be a base64 data URL with mime type image/jpeg, image/png, or image/webp' })
  }

  let response
  try {
    response = await callAnthropicVision(apiKey, image, typeof context === 'string' ? context : null)
  } catch (e) {
    if (e && e._client) return res.status(400).json({ error: e.message })
    return res.status(500).json({ error: (e && e.message) || 'anthropic call failed' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    return res.status(response.status).json({ error: errText })
  }

  const data = await response.json()
  const analysis = parseModelResponse(data)
  if (!analysis) {
    return res.status(502).json({ error: 'model returned an unparseable response; try again or simplify the photo context' })
  }
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
    console.error('[photo-analyze] failed to record generation:', err && err.message)
  }

  await auditLog({
    action: 'photo_analyze.generate',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'photo',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      confidence: analysis.confidence,
      concerns_count: analysis.concerns.length,
    },
    req,
  })

  return res.status(200).json({
    analysis,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = handler
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropicVision,
  parseImageDataUrl,
  parseModelResponse,
  SYSTEM_PROMPT,
  ANTHROPIC_MODEL,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
