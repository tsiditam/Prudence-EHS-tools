/**
 * Vercel Serverless Function — /api/report-sections
 *
 * Proxies AI generation of the five AI-eligible sections of the AtmosFlow
 * DOCX (executive summary, discussion, conceptual site model, recommendations
 * prose, parameter background). The API key stays server-side; the browser
 * never sees it.
 *
 * WHICH provider writes them is not this file's business: model, request
 * shape, sampling controls, response extraction, upstream classification
 * and pricing all live behind `api/_report-authoring-provider.js`. This
 * handler owns auth, budget, the banned-language floor, the audit record
 * and the response contract — the parts that would be identical whoever
 * generated the prose.
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
const {
  REPORT_SECTIONS_SYSTEM_PROMPT, REPORT_SECTION_REPAIR_SYSTEM_PROMPT,
} = require('./_report-sections-prompt.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')
// The only module on this path that knows which vendor writes the prose.
// Model, request shape, sampling controls, response extraction, upstream
// classification and pricing all live behind it.
const provider = require('./_report-authoring-provider.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 100
const FREE_TIER_DAILY_CAP = 5
const GENERATION_TYPE = 'report_sections'
// Five sections plus the criteria/parameters/pathways dictionaries the
// evidence package carries — a larger closed universe than one narrative
// payload, but still a bounded assessment record, not an open document.
const MAX_PAYLOAD_CHARS = 60_000

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

async function checkRateLimits(supabase, userId, plan, now = Date.now()) {
  return rateLimit.checkRateLimits(
    supabase, userId, plan,
    { perMinute: PER_MINUTE_LIMIT, perDay: PER_DAY_LIMIT, freeTierDaily: FREE_TIER_DAILY_CAP },
    GENERATION_TYPE, now,
  )
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

/**
 * A repair request, or null if the payload does not carry a valid one.
 *
 * Fail closed, deliberately. A repair exists to answer a finding, so one
 * naming no finding is refused rather than quietly handled as something
 * else — and the caller that sends a malformed `repair` gets a 400 instead
 * of a full five-section generation it did not ask for, which would both
 * cost a generation and replace the record the assessor was looking at.
 */
const REPAIRABLE_KEY_RE = /^(executive_summary|discussion|conceptual_site_model|recommendations_prose|parameter_background\.[a-z0-9_]{1,40})$/

function readRepair(payload) {
  const r = payload && payload.repair
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  const key = typeof r.section === 'string' ? r.section.trim() : ''
  if (!REPAIRABLE_KEY_RE.test(key)) return null
  const current = typeof r.current_text === 'string' ? r.current_text.trim() : ''
  if (!current) return null
  const findings = (Array.isArray(r.findings) ? r.findings : [])
    .filter((f) => f && typeof f.message === 'string' && f.message.trim())
  if (!findings.length) return null
  return { key, current, findings }
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
  // A repair answers a deterministic finding against ONE section that was
  // already written. Same endpoint, same auth, same budget and the same
  // banned-language floor; a different prompt, because "change what the
  // finding names and nothing else" is not the job the authoring prompt
  // describes.
  const repair = payload.repair === undefined ? null : readRepair(payload)
  if (payload.repair !== undefined && !repair) {
    return res.status(400).json({ error: 'invalid_repair_request' })
  }
  // `body.system` is deliberately ignored — see the header comment.
  const system = repair ? REPORT_SECTION_REPAIR_SYSTEM_PROMPT : REPORT_SECTIONS_SYSTEM_PROMPT

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

  // Everything vendor-shaped happens inside this one call. What comes back
  // is either five sections or a transport fact; the handler below is the
  // same code whichever provider produced them.
  const result = await provider.requestReportSections({
    apiKey, system, payload, fetchFn: getFetch(),
    subject: repair ? 'The repaired section is' : 'Report sections are',
    instruction: repair
      ? 'Repair ONLY the section named in `repair`, answering only the findings listed there, using nothing outside this evidence package. Return the strict JSON schema:'
      : undefined,
  })

  if (!result.ok) {
    // Released rather than finalized: nothing was produced, so the
    // assessor's budget is not spent on a call that wrote nothing.
    await rateLimit.releaseGeneration(supabase, reservation.id, 'report_sections')
    if (result.failure === 'unreachable') {
      console.error('[report-sections] provider call threw:', result.detail)
      return res.status(502).json({ error: 'upstream_unreachable' })
    }
    console.error('[report-sections] provider non-2xx:', result.status, result.detail)
    // `message` is what the assessor is shown, and the provider's own words
    // are never in it — see api/_upstream-error.js.
    return res.status(result.httpStatus).json({
      error: result.error, code: result.code, message: result.message, retryable: result.retryable,
    })
  }

  // The model is asked for `{ authoring_plan, sections }`. A model that
  // ignores the wrapper and returns the five section keys at the top level
  // is still accepted: the report it produces is exactly today's report,
  // and refusing it would make a planning experiment able to cost an
  // assessor five sections it would otherwise have had.
  const envelope = result.envelope || {}

  // A repair returns one string where a generation returns five keys. The
  // shape differs; the floor does not — the banned-language scan runs on it
  // exactly as on generated prose, and the deterministic evidence audit
  // still re-checks it client-side before the assessor can keep it.
  if (repair) {
    const repaired = typeof envelope.section === 'string' ? envelope.section.trim() : ''
    const banned = repaired ? scanBannedLanguage(repaired) : []
    const style = repaired ? scanStyle(repaired) : []
    const review = repaired ? (banned.length ? 'failed' : 'passed') : 'empty'
    const { input_tokens: inTok, output_tokens: outTok } = result.usage
    await Promise.all([
      rateLimit.finalizeGeneration(supabase, reservation.id, { inputTokens: inTok, outputTokens: outTok, cost: result.cost }, 'report_sections'),
      auditLog({
        action: 'report_section_repaired',
        actor_id: user.id,
        actor_email: user.email,
        target_type: 'report_sections',
        details: {
          model: result.model,
          input_tokens: inTok,
          output_tokens: outTok,
          estimated_cost_usd: result.cost,
          plan,
          section: repair.key,
          // Rule ids only. A finding's message quotes the report's own
          // prose, and the audit record does not need the assessment's text.
          finding_ids: repair.findings.map((f) => f.id).filter(Boolean),
          language_review: review,
          banned_language_count: banned.length,
          style_flag_count: style.length,
        },
        req,
      }).catch((err) => console.error('[report-sections] repair audit log failed:', err && err.message)),
    ])
    return res.status(200).json({
      section: repaired || null,
      repaired_key: repair.key,
      model: result.model,
      language_review: review,
      banned_language: banned,
      style_flags: style,
      any_banned: banned.length > 0,
      usage: { input_tokens: inTok, output_tokens: outTok, estimated_cost_usd: result.cost },
    })
  }
  const parsed = envelope.sections && typeof envelope.sections === 'object' && !Array.isArray(envelope.sections)
    ? envelope.sections
    : envelope
  // Passed through unvalidated, exactly like a semantic candidate: the
  // client holds the wire package these ids must resolve against, so the
  // client is the only place the check means anything.
  const authoringPlan = envelope.authoring_plan && typeof envelope.authoring_plan === 'object' && !Array.isArray(envelope.authoring_plan)
    ? envelope.authoring_plan
    : null
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

  const { input_tokens: inputTokens, output_tokens: outputTokens } = result.usage
  const cost = result.cost

  const recordUsage = rateLimit.finalizeGeneration(
    supabase, reservation.id, { inputTokens, outputTokens, cost }, 'report_sections',
  )

  const recordAudit = auditLog({
    action: 'report_sections_generated',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'report_sections',
    details: {
      model: result.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
      plan,
      section_count: flat.length,
      // Counted, never logged verbatim: the plan is the model's own words
      // about the assessment and the audit record does not need them.
      authoring_plan_present: Boolean(authoringPlan),
      language_review: languageReview,
      banned_language_count: Object.values(bannedLanguage).reduce((n, arr) => n + arr.length, 0),
      style_flag_count: Object.values(styleFlags).reduce((n, arr) => n + arr.length, 0),
    },
    req,
  }).catch((err) => console.error('[report-sections] audit log failed:', err && err.message))

  await Promise.all([recordUsage, recordAudit])

  return res.status(200).json({
    sections: parsed,
    model: result.model,
    language_review: languageReview,
    banned_language: bannedLanguage,
    style_flags: styleFlags,
    any_banned: anyBanned,
    // Scaffolding, returned for the client to validate and then use during
    // generation. It is not a section, it never renders, and nothing
    // downstream persists it.
    authoring_plan: authoringPlan,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

module.exports = withSentry(handler, { route: 'report-sections' })
module.exports.__test = {
  // Re-exported from the adapter so the existing endpoint suite keeps
  // exercising the same symbols it always did — its passing unchanged is
  // part of the evidence that this extraction changed no behavior.
  estimateCost: provider.estimateCost,
  tryParseSections: provider.tryParseSections,
  checkRateLimits,
  flattenSections,
  PER_MINUTE_LIMIT,
  PER_DAY_LIMIT,
  FREE_TIER_DAILY_CAP,
  GENERATION_TYPE,
  MAX_PAYLOAD_CHARS,
  // Vendor facts, read THROUGH the adapter rather than owned here — so a
  // test asserting the model is asking the adapter, not this file.
  MODEL: provider.MODEL,
  PROVIDER: provider.PROVIDER,
  MAX_OUTPUT_TOKENS: provider.MAX_OUTPUT_TOKENS,
  REPORT_SECTIONS_SYSTEM_PROMPT,
  REPORT_SECTION_REPAIR_SYSTEM_PROMPT,
  readRepair,
  setSupabase(mock) { _supabaseClient = mock },
  setFetch(mock) { _fetch = mock },
  resetSupabase() { _supabaseClient = null },
  resetFetch() { _fetch = null },
}
