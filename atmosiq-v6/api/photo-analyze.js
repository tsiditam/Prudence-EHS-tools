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
 * Records each analysis to narrative_generations (the existing AI-cost
 * ledger) with generation_type='photo_analysis' so per-user gross margin
 * stays observable and photos have their OWN rate-limit budget. The row is
 * reserved before the vision call and finalized with token counts after
 * (api/_rate-limit.js); a failed upstream call releases it.
 *
 * Test injection (per CLAUDE.md note 2): __test.setSupabase /
 * setFetch / resetSupabase / resetFetch swap the singletons so
 * tests don't need vi.mock against require() calls.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
// Own ledger stream: photos used to insert with no generation_type, so
// they landed as 'narrative' and shared (and drained) the narrative budget.
const GENERATION_TYPE = 'photo_analysis'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1200
// Reject oversized image payloads before the upstream vision call. A field
// photo is well under 8 MB; anything larger is a client bug or abuse.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
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

async function checkRateLimits(supabase, userId, plan, now = Date.now()) {
  return rateLimit.checkRateLimits(
    supabase, userId, plan,
    { perMinute: PER_MINUTE_LIMIT, perDay: PER_DAY_LIMIT, freeTierDaily: FREE_TIER_DAILY_CAP },
    GENERATION_TYPE, now,
  )
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

  // Unlimited-usage allowlist (UNLIMITED_USAGE_EMAILS env var). Skip
  // rate-limit gates for allowlisted internal test accounts. See
  // lib/unlimited-usage.js for the contract.
  const userEmail = (user && user.email) || ''
  const unlimited = hasUnlimitedUsage(userEmail)

  let limitCheck = { ok: true }
  if (!unlimited) {
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[photo-analyze] rate limit check failed:', err && err.message)
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
      message: 'Photo analysis rate limit reached. Please wait or contact support if you need to process more photos today.',
    })
  }

  const body = req.body || {}
  const { image, context } = body
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image (data URL) in request body' })
  }
  const parsedImage = parseImageDataUrl(image)
  if (!parsedImage) {
    return res.status(400).json({ error: 'image must be a base64 data URL with mime type image/jpeg, image/png, or image/webp' })
  }
  // Decoded bytes ≈ base64 length × 3/4. Reject oversized payloads up front.
  if (Math.floor((parsedImage.data.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: 'image too large (max 8 MB)' })
  }

  // Reserve the ledger row BEFORE the upstream call (api/_rate-limit.js).
  let reservation
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'photo-analyze' })
  } catch {
    return res.status(500).json({ error: 'ledger_reserve_failed' })
  }

  let response
  try {
    response = await callAnthropicVision(apiKey, image, typeof context === 'string' ? context : null)
  } catch (e) {
    await rateLimit.releaseGeneration(supabase, reservation.id, 'photo-analyze')
    if (e && e._client) return res.status(400).json({ error: e.message })
    console.error('[photo-analyze] anthropic call threw:', e && e.message)
    return res.status(502).json({ error: 'upstream_unreachable' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    console.error('[photo-analyze] anthropic non-2xx:', response.status, String(errText).slice(0, 300))
    await rateLimit.releaseGeneration(supabase, reservation.id, 'photo-analyze')
    const status = response.status === 429 ? 429 : 502
    return res.status(status).json({ error: `upstream_${response.status}` })
  }

  const data = await response.json()
  const analysis = parseModelResponse(data)
  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  // Tokens were spent whether or not the JSON parsed — the ledger keeps them.
  await rateLimit.finalizeGeneration(supabase, reservation.id, { inputTokens, outputTokens, cost }, 'photo-analyze')

  if (!analysis) {
    return res.status(502).json({ error: 'model returned an unparseable response; try again or simplify the photo context' })
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

module.exports = withSentry(handler, { route: 'photo-analyze' })
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropicVision,
  parseImageDataUrl,
  parseModelResponse,
  SYSTEM_PROMPT,
  ANTHROPIC_MODEL,
  GENERATION_TYPE,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
