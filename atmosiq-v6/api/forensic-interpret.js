/**
 * Vercel Serverless Function — /api/forensic-interpret
 *
 * Proxies Jasper's reading of one Logger Studio monitoring session to the
 * Anthropic API. The API key stays server-side; the browser never sees it.
 *
 * Sibling of api/report-sections.js — same shape, same rate-limit machinery,
 * same server-owned-prompt discipline — over a ForensicAnalysisBundle instead
 * of a report evidence package. Differences worth naming:
 *
 *   - The system prompt is SERVER-OWNED (api/_forensic-interpret-prompt.js).
 *     A client `system` in the body is ignored.
 *   - The response is ONE JSON object carrying `interpretations`, and each
 *     entry is scanned SEPARATELY by api/_banned-language.js. A violation in
 *     one reading must not cost the others, the same reasoning report-sections
 *     gives for scanning per section.
 *   - A failing entry is DROPPED here rather than flagged. This differs from
 *     /api/narrative, where the scan is advisory, and it matches
 *     /api/report-sections: the liability floor is not assessor-waivable, and
 *     a reading that fails it has nothing downstream that could rehabilitate
 *     it. What was dropped and why still travels in `language_review` and into
 *     the audit log, so the failure is observable rather than silent.
 *   - `generation_type = 'forensic_interpretation'` — its own rate-limit
 *     budget (migration 038), so a burst of interpretation never eats the
 *     narrative or report-section budget or vice versa.
 *
 * WHAT THIS HANDLER DOES NOT DO, deliberately: the deterministic gate.
 * Evidence-id resolution, pattern scoping, the arithmetic check and the
 * forensics language layer all live in src/utils/forensicValidate.js and run
 * on the client, because that module imports the shared scanner from
 * src/engine/report/cih-validation.js — TypeScript, which a plain-Node ESM
 * importer under Vercel cannot resolve (pitfall #4). The split is the same one
 * the report path already runs: the server holds the floor every report path
 * clears, the client holds the question of whether THIS session supports THIS
 * sentence.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { scan: scanBannedLanguage, scanStyle } = require('./_banned-language.js')
const { FORENSIC_INTERPRET_SYSTEM_PROMPT } = require('./_forensic-interpret-prompt.js')
const rateLimit = require('./_rate-limit.js')
const { classifyUpstream, statusForUpstream } = require('./_upstream-error.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const GENERATION_TYPE = 'forensic_interpretation'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15
// A monitoring session's bundle: per-parameter statistics, detected events,
// patterns and the deployment context. Pinned by test to WIRE_BUDGET_CHARS in
// src/utils/forensicWire.js, which trims to fit rather than sending and
// hoping — a payload refused at 413 costs the assessor a click and tells them
// nothing useful.
const MAX_PAYLOAD_CHARS = 60_000
// Five interpretations of a few sentences each, plus their alternatives and
// reviews. Slack, not a target; the prompt's own limits govern length.
const MAX_OUTPUT_TOKENS = 3000
// Lower than the report path's 0.7. This is a reading of a trace, not prose
// that has to carry a document — variety in the phrasing buys nothing and
// costs consistency between one session's reading and the next.
const TEMPERATURE = 0.5
// The gate downstream caps at five. Refusing a sixth here keeps a model that
// ignored the instruction from spending the assessor's attention on entries
// that would be rejected anyway.
const MAX_INTERPRETATIONS = 5

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
      temperature: TEMPERATURE,
      system,
      messages: [{
        role: 'user',
        content: `Based ONLY on this monitoring bundle, return interpretations as the strict JSON schema requires:\n\n${JSON.stringify(payload)}`,
      }],
    }),
  })
}

/**
 * How the model's text parsed. Exported so the client and the audit log name
 * the same three outcomes.
 *
 *   ok           the agreed shape, possibly with an empty list
 *   unparseable  not JSON at all, even after stripping a code fence
 *   malformed    JSON, but not the agreed shape — `detail` says which way
 */
const PARSE_STATUSES = Object.freeze(['ok', 'unparseable', 'malformed'])

/**
 * Parse the model's response into `{ interpretations: [...] }`, tolerating a
 * code fence it added despite the strict instruction — the same tolerance
 * api/report-sections.js and api/pre-review-semantic.js already apply for the
 * same reason.
 *
 * What it does NOT do is collapse a failure into an empty list. The first cut
 * returned `{ interpretations: [] }` for anything it could not read, which made
 * a broken contract indistinguishable from a model that had read the session
 * and validly found nothing worth raising — the opposite fact, persisted the
 * same way. A valid `{"interpretations":[]}` is `ok`; everything else is
 * refused with a status, and the client turns that into a `rejected` record.
 *
 * @returns {{status:string, interpretations:Array|null, detail?:string}}
 */
function tryParseOutput(text) {
  if (typeof text !== 'string' || !text.trim()) return { status: 'unparseable', interpretations: null, detail: 'empty_response' }
  let s = text.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return { status: 'unparseable', interpretations: null, detail: 'no_object' }
  let parsed
  try {
    parsed = JSON.parse(s.slice(start, end + 1))
  } catch {
    return { status: 'unparseable', interpretations: null, detail: 'invalid_json' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'malformed', interpretations: null, detail: 'not_an_object' }
  }
  if (!('interpretations' in parsed)) return { status: 'malformed', interpretations: null, detail: 'missing_interpretations' }
  if (!Array.isArray(parsed.interpretations)) return { status: 'malformed', interpretations: null, detail: 'interpretations_not_array' }
  return { status: 'ok', interpretations: parsed.interpretations }
}

/**
 * Everything one interpretation says in words, as one string.
 *
 * The scan has to see the WHOLE entry: a phrase this product may not publish
 * is no less published for sitting in an alternative explanation than in the
 * main text. Non-strings are skipped rather than coerced — `String(null)` is
 * "null", which scans clean and means nothing.
 */
function proseOf(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
  const parts = [entry.title, entry.interpretation]
  for (const key of ['alternative_explanations', 'recommended_reviews']) {
    if (Array.isArray(entry[key])) parts.push(...entry[key])
  }
  return parts.filter((p) => typeof p === 'string' && p.trim()).join('\n')
}

/** A stable label for one entry in the response, for the review map. */
const labelFor = (entry, index) => {
  const id = entry && typeof entry === 'object' && typeof entry.pattern_id === 'string' ? entry.pattern_id : null
  return id ? `${index}:${id}` : String(index)
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
  const system = FORENSIC_INTERPRET_SYSTEM_PROMPT

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

  const unlimited = hasUnlimitedUsage((user && user.email) || '')

  let limitCheck = { ok: true }
  if (!unlimited) {
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[forensic-interpret] rate limit check failed:', err && err.message)
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
      message: 'Interpretation rate limit reached. Please wait, or contact support if you need to review more sessions today.',
    })
  }

  let reservation
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'forensic_interpretation' })
  } catch {
    return res.status(500).json({ error: 'ledger_reserve_failed' })
  }

  let response
  try {
    response = await callAnthropic(apiKey, system, payload)
  } catch (e) {
    console.error('[forensic-interpret] anthropic call threw:', e && e.message)
    await rateLimit.releaseGeneration(supabase, reservation.id, 'forensic_interpretation')
    return res.status(502).json({ error: 'upstream_unreachable' })
  }

  if (!response.ok) {
    const errText = typeof response.text === 'function' ? await response.text() : ''
    console.error('[forensic-interpret] anthropic non-2xx:', response.status, String(errText).slice(0, 300))
    await rateLimit.releaseGeneration(supabase, reservation.id, 'forensic_interpretation')
    // `message` is what the assessor is shown. An exhausted API account
    // arrives as a 400, so "try again" is the wrong advice for it —
    // see api/_upstream-error.js.
    const { code, message, retryable } = classifyUpstream(response.status, errText, 'Interpretations are')
    return res.status(statusForUpstream(response.status, code)).json({
      error: `upstream_${response.status}`, code, message, retryable,
    })
  }

  const data = await response.json()
  const text = data.content
    && data.content.map(b => b && b.type === 'text' ? b.text : '').filter(Boolean).join('\n') || null

  const parsed = tryParseOutput(text)
  const returned = parsed.interpretations || []
  const languageReview = {}
  const bannedLanguage = {}
  const styleFlags = {}
  const kept = []
  returned.slice(0, MAX_INTERPRETATIONS).forEach((entry, i) => {
    const label = labelFor(entry, i)
    const prose = proseOf(entry)
    const banned = scanBannedLanguage(prose)
    const style = scanStyle(prose)
    languageReview[label] = banned.length > 0 ? 'failed' : 'passed'
    if (style.length) styleFlags[label] = style
    if (banned.length) { bannedLanguage[label] = banned; return }
    kept.push(entry)
  })
  const droppedForLanguage = Object.keys(bannedLanguage).length
  const droppedOverLimit = Math.max(0, returned.length - MAX_INTERPRETATIONS)

  const inputTokens = data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null
  const outputTokens = data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null
  const cost = estimateCost(inputTokens, outputTokens)

  const recordUsage = rateLimit.finalizeGeneration(
    supabase, reservation.id, { inputTokens, outputTokens, cost }, 'forensic_interpretation',
  )

  const recordAudit = auditLog({
    action: 'forensic_interpretation_generated',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'forensic_interpretation',
    details: {
      model: ANTHROPIC_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      // The fingerprint of the session this reading is about. It is the only
      // thing that says WHICH monitoring record was interpreted, and the audit
      // row is the one place that survives the assessor discarding the reading.
      fingerprint: (payload && payload.bundle && typeof payload.bundle.fingerprint === 'string') ? payload.bundle.fingerprint : null,
      parse_status: parsed.status,
      parse_detail: parsed.detail || null,
      returned_count: returned.length,
      kept_count: kept.length,
      dropped_for_language: droppedForLanguage,
      dropped_over_limit: droppedOverLimit,
      language_review: languageReview,
      style_flag_count: Object.values(styleFlags).reduce((n, a) => n + a.length, 0),
    },
    req,
  }).catch((err) => console.error('[forensic-interpret] audit log failed:', err && err.message))

  await Promise.all([recordUsage, recordAudit])

  // A parse failure is still a 200: the upstream call succeeded, the ledger
  // row is finalized and the credits are spent. What failed is the CONTRACT,
  // and the client records that as a rejected reading rather than as an
  // error, so the assessor can see the model tried and what came back was
  // unusable — which is not the same as the service being down.
  return res.status(200).json({
    output: parsed.status === 'ok' ? { interpretations: kept } : null,
    parse: { status: parsed.status, ...(parsed.detail ? { detail: parsed.detail } : {}) },
    model: ANTHROPIC_MODEL,
    language_review: languageReview,
    banned_language: bannedLanguage,
    style_flags: styleFlags,
    dropped_for_language: droppedForLanguage,
    dropped_over_limit: droppedOverLimit,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = withSentry(handler, { route: 'forensic-interpret' })
module.exports.__test = {
  estimateCost,
  checkRateLimits,
  callAnthropic,
  tryParseOutput,
  PARSE_STATUSES,
  proseOf,
  labelFor,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  GENERATION_TYPE,
  ANTHROPIC_MODEL,
  MAX_PAYLOAD_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_INTERPRETATIONS,
  TEMPERATURE,
  FORENSIC_INTERPRET_SYSTEM_PROMPT,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
