/**
 * Vercel Serverless Function — /api/report-sections
 *
 * Proxies AI generation of the five AI-eligible sections of the AtmosFlow
 * DOCX (executive summary, discussion, conceptual site model, recommendations
 * prose, parameter background) to the Anthropic API. The API key stays
 * server-side; the browser never sees it.
 *
 * Sibling of api/narrative.js — same shape, same rate-limit machinery, same
 * server-owned-prompt discipline — for a structured multi-section response
 * instead of one freeform document. Differences worth naming:
 *
 *   - The system prompt is SERVER-OWNED (api/_report-sections-prompt.js),
 *     same as narrative's. A client `system` in the body is ignored.
 *   - The upstream response is parsed as ONE JSON object with up to five
 *     keys, not plain text — `tryParseSections` is tolerant of a code fence
 *     the model added despite the strict instruction not to, matching the
 *     tolerance api/pre-review-semantic.js already uses for the same reason.
 *   - The banned-language scan (api/_banned-language.js) runs PER SECTION,
 *     not once — a violation in one section must not cost the other four.
 *     `language_review` in the response is an object keyed by section
 *     (`parameter_background.<key>` for background entries), not one flag.
 *   - `generation_type = 'report_sections'` — its own rate-limit budget, so
 *     a burst of section generation never eats the narrative budget or vice
 *     versa (the same reasoning narrative.js's header gives for its own
 *     type).
 *
 * The deterministic evidence audit (src/report/narrativeAudit.js, via
 * src/report/aiSections.js on the client) is a SEPARATE, later gate — this
 * endpoint's banned-language scan is the liability floor; the audit is
 * whether THIS assessment supports THIS text. Neither runs in place of the
 * other.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { scan: scanBannedLanguage, scanStyle } = require('./_banned-language.js')
const { REPORT_SECTIONS_SYSTEM_PROMPT } = require('./_report-sections-prompt.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const GENERATION_TYPE = 'report_sections'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15
// Five sections plus the criteria/parameters/pathways dictionaries the
// evidence package carries — a larger closed universe than one narrative
// payload, but still a bounded assessment record, not an open document.
const MAX_PAYLOAD_CHARS = 60_000
// Five short-to-medium sections. 900 words total is generous headroom; a
// draft that hits this ceiling mid-sentence is worse than a short one, so
// this is slack, not a target — the prompt's own per-section word guidance
// is what governs length.
const MAX_OUTPUT_TOKENS = 4000

const TOP_LEVEL_KEYS = ['executive_summary', 'discussion', 'conceptual_site_model', 'recommendations_prose']

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
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.7,
      system,
      messages: [{
        role: 'user',
        content: `Based ONLY on this evidence package, write the report sections as the strict JSON schema requires:\n\n${JSON.stringify(payload)}`,
      }],
    }),
  })
}

/**
 * Parse the model's response into a plain sections object, tolerating a code
 * fence the model added despite the strict "no markdown fence" instruction —
 * the same tolerance api/pre-review-semantic.js already applies for the same
 * reason. Returns `{}` (not an error) on anything unparseable; the deterministic
 * report is a complete document without any of these sections.
 */
function tryParseSections(text) {
  if (!text) return {}
  let s = text.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return {}
  try {
    const parsed = JSON.parse(s.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * Every (key, text) pair the response carries, flattened — top-level
 * sections as their own key, parameter-background entries as
 * `parameter_background.<paramKey>` — so the banned-language scan and its
 * result travel at the same granularity `aiSections.js` audits at.
 */
function flattenSections(parsed) {
  const out = []
  for (const key of TOP_LEVEL_KEYS) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) out.push([key, parsed[key]])
  }
  const pbg = parsed.parameter_background
  if (pbg && typeof pbg === 'object' && !Array.isArray(pbg)) {
    for (const [paramKey, text] of Object.entries(pbg)) {
      if (typeof text === 'string' && text.trim()) out.push([`parameter_background.${paramKey}`, text])
    }
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
  const system = REPORT_SECTIONS_SYSTEM_PROMPT

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
      console.error('[report-sections] rate limit check failed:', err && err.message)
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
      message: 'Report-section generation rate limit reached. Please wait or contact support if you need to process more reports today.',
    })
  }

  let reservation
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'report_sections' })
  } catch {
    return res.status(500).json({ error: 'ledger_reserve_failed' })
  }

  let response
  try {
    response = await callAnthropic(apiKey, system, payload)
  } catch (e) {
    console.error('[report-sections] anthropic call threw:', e && e.message)
    await rateLimit.releaseGeneration(supabase, reservation.id, 'report_sections')
    return res.status(502).json({ error: 'upstream_unreachable' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    console.error('[report-sections] anthropic non-2xx:', response.status, String(errText).slice(0, 300))
    await rateLimit.releaseGeneration(supabase, reservation.id, 'report_sections')
    const status = response.status === 429 ? 429 : 502
    return res.status(status).json({ error: `upstream_${response.status}` })
  }

  const data = await response.json()
  const text = data.content
    && data.content.map(b => b && b.type === 'text' ? b.text : '').filter(Boolean).join('\n') || null

  const parsed = tryParseSections(text)
  const flat = flattenSections(parsed)

  // Lint every section with the same ruleset as the narrative endpoint, per
  // section rather than once — a violation in one must not cost the other
  // four. Non-suppressing here for the same reason it is on /api/narrative:
  // the client decides what to do with a flagged section, and the flags
  // travel in the response + audit log so the failure is observable either way.
  const languageReview = {}
  const bannedLanguage = {}
  const styleFlags = {}
  let anyBanned = false
  for (const [key, sectionText] of flat) {
    const banned = scanBannedLanguage(sectionText)
    const style = scanStyle(sectionText)
    languageReview[key] = banned.length > 0 ? 'failed' : 'passed'
    if (banned.length) { bannedLanguage[key] = banned; anyBanned = true }
    if (style.length) styleFlags[key] = style
  }

  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  const recordUsage = rateLimit.finalizeGeneration(
    supabase, reservation.id, { inputTokens, outputTokens, cost }, 'report_sections',
  )

  const recordAudit = auditLog({
    action: 'report_sections_generated',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'report_sections',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      section_count: flat.length,
      language_review: languageReview,
      banned_language_count: Object.values(bannedLanguage).reduce((n, arr) => n + arr.length, 0),
      style_flag_count: Object.values(styleFlags).reduce((n, arr) => n + arr.length, 0),
    },
    req,
  }).catch((err) => console.error('[report-sections] audit log failed:', err && err.message))

  await Promise.all([recordUsage, recordAudit])

  return res.status(200).json({
    sections: parsed,
    model: ANTHROPIC_MODEL,
    language_review: languageReview,
    banned_language: bannedLanguage,
    style_flags: styleFlags,
    any_banned: anyBanned,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = withSentry(handler, { route: 'report-sections' })
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropic,
  tryParseSections,
  flattenSections,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  GENERATION_TYPE,
  ANTHROPIC_MODEL,
  MAX_PAYLOAD_CHARS,
  MAX_OUTPUT_TOKENS,
  REPORT_SECTIONS_SYSTEM_PROMPT,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
