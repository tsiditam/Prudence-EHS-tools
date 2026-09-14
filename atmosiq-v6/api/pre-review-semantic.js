/**
 * Vercel Serverless Function — /api/pre-review-semantic
 *
 * ── What crosses this boundary ─────────────────────────────────────────
 * IN: a reviewer package (`packageForReviewer`) — the report's own prose by
 * section, the identifiers the assessment recorded, any approved reference
 * statements, and the issues the deterministic layer already reported.
 * Prose and identifiers. No render model, no docx object, no photograph, no
 * assessment record, nothing about the user.
 *
 * OUT: CANDIDATE JSON, exactly as the provider returned it, plus the
 * provenance needed to label it.
 *
 * ── What this endpoint deliberately does NOT do ────────────────────────
 * It never returns an IntegrityFinding, and it must never learn how to. The
 * model-output schema and the internal trusted representation are different
 * types on purpose: that difference IS the trust boundary. A candidate
 * becomes a finding in exactly one place — `validateSemanticResponse` on the
 * client, against the same package the reviewer was given — and it gets
 * there only by having every quote and identifier resolved rather than
 * believed. An endpoint that promoted candidates itself would move that
 * decision to the one side of the wire that cannot check it.
 *
 * It also does not STREAM. The old handler emitted each issue as an SSE
 * frame the moment it was parsed, which put unvalidated model output in
 * front of an assessor by construction. The complete response is validated
 * before anything is shown.
 *
 * And it does not rate. No `blocking` severity exists anywhere in this path.
 * Report review warns and recommends; it never stops a report being
 * generated, finalized, exported or issued.
 *
 * ── Failure is technical, never editorial ──────────────────────────────
 * A timeout, an outage, a non-2xx or an unparseable reply all mean the same
 * thing: the review did not happen. None is a statement about the report,
 * so none produces a finding, a warning, or a mark against the document.
 * The response carries `status: 'unavailable'` with a machine-readable
 * reason and HTTP 200 — the request was handled correctly, the review
 * simply has nothing to say.
 *
 * ── History ────────────────────────────────────────────────────────────
 * This file was the disconnected Phase 2 stub, kept rather than deleted
 * because the half it described — judging whether a cited standard supports
 * the claim beside it, whether two sections agree — is the half no
 * structural join reaches. The condition on wiring it was quote-resolution
 * validation, which now exists (`src/engines/integrity/semantic-validate.js`).
 * Everything the stub carried has been replaced: the prompt is server-owned
 * and byte-parity tested, the schema is closed, and the old three-tier
 * severity with its `blocking` top end is gone.
 *
 * Quota (per user, per generation_type='pre_review_semantic'):
 *   • 10 runs / 60s rolling window
 *   • 60 runs / 24h rolling window
 *   • 8 runs / 24h on the free plan
 */

const { createClient } = require('@supabase/supabase-js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { auditLog } = require('./_audit.js')
const rateLimit = require('./_rate-limit.js')
const { withSentry } = require('./_with-sentry-cjs.js')
const { requestSemanticCandidates, PROVIDER, MODEL } = require('./_semantic-provider.js')
const { SEMANTIC_PROMPT_VERSION } = require('./_semantic-review-prompt.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 60
const FREE_TIER_DAILY_CAP = 8
const GENERATION_TYPE = 'pre_review_semantic'

// The reviewer package is report prose plus labels — comparable to the
// writer's payload, and bounded the same way.
const MAX_INPUT_BYTES = 200_000

// $/M tokens — keep in sync with Anthropic pricing.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15

let _supabase = null
let _fetch = null
function getSupabase() {
  if (_supabase) return _supabase
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}
function getFetch() { return _fetch || global.fetch }

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
 * The reviewer did not answer. 200, because the REQUEST was handled — the
 * client reads `status` and leaves the report exactly as it was.
 */
const unavailable = (res, reason, extra = {}) =>
  res.status(200).json({ status: 'unavailable', reason, ...extra })

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase()
  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = req.body || {}
  const pkg = body.package
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return res.status(400).json({ error: 'missing_package' })
  }
  if (!Array.isArray(pkg.sections) || !pkg.sections.length) {
    return res.status(400).json({ error: 'empty_package' })
  }

  const pkgJson = JSON.stringify(pkg)
  if (pkgJson.length > MAX_INPUT_BYTES) {
    return res.status(400).json({ error: 'package_too_large', max_bytes: MAX_INPUT_BYTES })
  }

  // Configuration is checked AFTER the request is understood, so a
  // misconfigured deployment reports the same way an outage does: the review
  // is unavailable, and the report is untouched.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return unavailable(res, 'not_configured')

  let plan = 'free'
  try {
    const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
    plan = (profile && profile.plan) || 'free'
  } catch { /* missing profile treated as free */ }

  if (!hasUnlimitedUsage((user && user.email) || '')) {
    let limitCheck = { ok: true }
    try {
      limitCheck = await checkRateLimits(supabase, user.id, plan)
    } catch (err) {
      console.error('[pre-review-semantic] rate limit check failed:', err && err.message)
      return unavailable(res, 'rate_limit_check_failed')
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

  let reservation = null
  try {
    reservation = await rateLimit.reserveGeneration(supabase, { userId: user.id, generationType: GENERATION_TYPE, tag: 'pre-review-semantic' })
  } catch {
    return unavailable(res, 'ledger_reserve_failed')
  }

  const result = await requestSemanticCandidates({ apiKey, pkg, fetchFn: getFetch() })

  if (!result.ok) {
    // The run is released rather than finalized: nothing was produced, so
    // the assessor's budget is not spent on a review that did not happen.
    try { await rateLimit.releaseGeneration(supabase, reservation.id, 'pre-review-semantic') } catch { /* best effort */ }
    if (result.status) console.error('[pre-review-semantic] provider:', result.reason, result.code || '', result.status, result.detail || '')
    // `code` distinguishes a billing/quota failure from a transient outage
    // for whoever is operating the deployment. It is a machine token, never
    // a sentence, and never anything about the report.
    return unavailable(res, result.reason, result.code ? { code: result.code } : {})
  }

  const inputTokens = result.usage.input_tokens
  const outputTokens = result.usage.output_tokens
  const cost = estimateCost(inputTokens, outputTokens)

  try {
    await rateLimit.finalizeGeneration(supabase, reservation.id, { inputTokens, outputTokens, cost }, 'pre-review-semantic')
  } catch (err) {
    console.error('[pre-review-semantic] finalize failed:', err && err.message)
  }

  // The count logged is of CANDIDATES, and the name says so. None of them is
  // a finding yet, and a log line that called them findings would be the
  // first place the distinction started to blur.
  const candidateCount = Array.isArray(result.response && result.response.issues)
    ? result.response.issues.length
    : 0

  try {
    await auditLog({
      action: 'pre_review_semantic.run',
      actor_id: user.id,
      actor_email: user.email,
      target_type: 'assessment',
      details: {
        provider: result.provider,
        model: result.model,
        prompt_version: result.prompt_version,
        report_fingerprint: pkg.report_fingerprint || null,
        candidate_count: candidateCount,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: cost,
        plan,
      },
    })
  } catch (err) {
    console.error('[pre-review-semantic] audit log failed:', err && err.message)
  }

  // `candidates` is the provider's object VERBATIM. It is not reshaped,
  // filtered, sorted or repaired here — the validator is written to reject
  // anything malformed, and a handler that tidied the response first would
  // be deciding what the validator gets to see.
  return res.status(200).json({
    status: 'completed',
    candidates: result.response,
    provenance: {
      provider: result.provider,
      model: result.model,
      prompt_version: result.prompt_version,
      report_fingerprint: pkg.report_fingerprint || null,
    },
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost },
  })
}

const wrapped = withSentry(handler, { route: 'pre-review-semantic' })
module.exports = wrapped
module.exports.default = wrapped
module.exports.__test = {
  setSupabase(s) { _supabase = s },
  setFetch(f) { _fetch = f },
  reset() { _supabase = null; _fetch = null },
  MAX_INPUT_BYTES,
  GENERATION_TYPE,
  PROVIDER,
  MODEL,
  SEMANTIC_PROMPT_VERSION,
}
