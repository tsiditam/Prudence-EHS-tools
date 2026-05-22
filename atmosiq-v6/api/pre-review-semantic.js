/**
 * Vercel Serverless Function — /api/pre-review-semantic
 *
 * Layer 2 of the pre-review agent. Where Layer 1 (deterministic,
 * in src/utils/preReviewValidator.js) catches things that can be
 * checked with regex + token similarity, this endpoint sends the
 * assembled assessment context to Claude with a structured
 * audit prompt and asks the model to identify:
 *
 *   • Findings whose cited standard doesn't actually support the
 *     claim (e.g., "ASHRAE 62.1 says CO2 ≥ 1000 ppm is dangerous"
 *     — ASHRAE 62.1 says no such thing)
 *   • Recommendations missing a citation when one is needed
 *   • Language that overstates a screening-level finding ("proves",
 *     "demonstrates", "definitive" + harm claim)
 *   • Severity mismatches (a "critical" finding whose underlying
 *     data is mild, or vice versa)
 *   • Recommendations that don't address any finding
 *   • Internal inconsistency (zone names referenced in narrative
 *     that don't exist in the zones array, etc.)
 *
 * Response: SSE stream of `issue` events as the model surfaces
 * each one, plus `done` / `error` frames. Same shape as
 * /api/field-assistant so the client reuses parseSseFrames.
 *
 * Each `issue` event carries the same shape as Layer 1's issues
 * (severity / category / title / detail / anchor) so the panel UI
 * can render Layer 1 + Layer 2 in the same list.
 *
 * Engine-sacred: this handler reads engine output via the request
 * body; never imports from src/engine/* or src/engines/*.
 *
 * Auth: Bearer token via Supabase, same as the other AI endpoints.
 * Model: Claude Sonnet 4.6 — semantic citation judgment needs the
 * reasoning depth; Haiku gets the structure right but misses the
 * subtle "standard cited doesn't actually support this claim" cases.
 *
 * Quota (per user, per generation_type='pre_review_semantic'):
 *   • 10 runs / 60s rolling window
 *   • 60 runs / 24h rolling window
 *   • 8 runs / 24h on the free plan
 */

const { createClient } = require('@supabase/supabase-js')
const { hasUnlimitedUsage } = require('../lib/unlimited-usage.js')
const { auditLog } = require('./_audit.js')

const PER_MINUTE_LIMIT = 10
const PER_DAY_LIMIT = 60
const FREE_TIER_DAILY_CAP = 8
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const GENERATION_TYPE = 'pre_review_semantic'

const MAX_OUTPUT_TOKENS = 1500
const MAX_INPUT_BYTES = 200_000 // ~50KB JSON body cap — large reports compress well
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15

const SYSTEM_PROMPT = `You audit IAQ assessment reports for the AtmosFlow platform BEFORE they go to a CIH for review. Your job is to surface inconsistencies the human reviewer would otherwise catch — so they spend their time on judgment, not proofreading.

Look for these issue classes:

CITATION INTEGRITY
  • A standard cited in a finding or recommendation that doesn't actually support the claim made. (ASHRAE 62.1 governs ventilation rate, not CO₂ contaminant limits. IICRC S520 covers mold remediation, not assessment. Spore counts are NOT health proof — IOM 2004, ACMT 2025.)
  • A recommendation whose claim needs a citation but has none.
  • A citation to a standard that doesn't exist (made-up document number).

LANGUAGE INTEGRITY
  • Words that overstate a screening-level conclusion: "proves", "demonstrates", "definitive", "confirms" — paired with a health-harm or causation claim.
  • Regulatory determinations made from screening data ("exceeds the OSHA PEL" requires sampling, not walk-through).
  • Mold findings that frame spore counts as health risk evidence.
  • TVOC interpretations that don't cite Mølhave 1991 advisory tiers.

INTERNAL CONSISTENCY
  • Zone names in the narrative that don't appear in the zones array.
  • Sample IDs cited in text that don't appear in the lab results.
  • Severity mismatches: a finding flagged "critical" whose underlying data is mild ("slight haze" + critical), or a finding flagged "low" whose underlying data is serious ("active water intrusion" + low).
  • Recommendations that don't connect to any finding.
  • Findings without a corresponding recommendation in the right priority tier.

OUTPUT FORMAT — STRICT
Return ONLY a JSON array of issue objects. No preamble. No markdown. No code fence. Each issue must follow this schema exactly:

  {
    "severity": "blocking" | "warning" | "suggestion",
    "category": "snake_case_identifier",
    "title": "one-line headline up to 100 chars",
    "detail": "1-3 sentences citing the specific text. quote the problem in double quotes.",
    "anchor": { "type": "finding" | "recommendation" | "narrative" | "labRow" | "zone", "id"?: "string", "zone"?: "string" }
  }

If you find zero issues, return [].

Severity tiers:
  blocking    — citation is factually wrong, language makes a regulatory determination, or a fact is internally inconsistent (zone doesn't exist, sample ID nonexistent).
  warning     — overstated language, missing citation where one is needed, possible severity mismatch.
  suggestion  — defensibility nudge, soft framing improvement.

Be precise. Cite the exact text. Don't invent issues. Don't restate Layer 1 findings (duplicates, missing photos, lab date inversion, placeholder names — those are caught by the deterministic layer; ignore them).`

let _supabase = null
let _fetch = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createClient(url, key)
}
function getFetch() { return _fetch || global.fetch }

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
    .eq('generation_type', GENERATION_TYPE)
    .gte('generated_at', sinceIso)
  if (error) throw new Error(error.message)
  return count || 0
}
async function findOldestSince(supabase, userId, sinceIso) {
  const { data } = await supabase
    .from('narrative_generations')
    .select('generated_at')
    .eq('user_id', userId)
    .eq('generation_type', GENERATION_TYPE)
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

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * Slim down the assessment payload to just the fields the audit
 * needs. The full ctx in MobileApp has photos as data URLs, full
 * presurvey state, etc. — sending all that would blow the input
 * cap AND make the model focus on irrelevant fields.
 *
 * The slim shape keeps only what's auditable: narrative, recs,
 * zone findings, lab rows, photo COUNT (not the dataURLs).
 */
function slimAssessment(input) {
  const out = {}
  if (typeof input?.narrative === 'string') out.narrative = input.narrative.slice(0, 20000)
  if (input?.recs && typeof input.recs === 'object') {
    out.recs = {}
    for (const tier of ['imm', 'eng', 'adm', 'mon']) {
      const list = Array.isArray(input.recs[tier]) ? input.recs[tier] : []
      out.recs[tier] = list.map((r) => (typeof r === 'string' ? r : r?.text || '')).filter(Boolean).slice(0, 50)
    }
  }
  if (Array.isArray(input?.zoneScores)) {
    out.zones = input.zoneScores.map((zs, i) => ({
      name: zs?.zoneName || `Zone ${i + 1}`,
      composite: typeof zs?.tot === 'number' ? zs.tot : null,
      findings: (Array.isArray(zs?.cats) ? zs.cats : [])
        .flatMap((c) => (Array.isArray(c?.r) ? c.r : []).map((f) => ({
          category: c?.l || '',
          severity: f?.sev || '',
          text: typeof f?.t === 'string' ? f.t.slice(0, 600) : '',
          citation: typeof f?.std === 'string' ? f.std : '',
        })))
        .slice(0, 60),
    })).slice(0, 30)
  }
  if (input?.labResults && Array.isArray(input.labResults.rows)) {
    out.labResults = input.labResults.rows.slice(0, 40).map((r) => ({
      sampleId: r?.sampleId || '',
      analyte: r?.analyte || '',
      result: r?.result || '',
      units: r?.units || '',
      collectedAt: r?.collectedAt || '',
      receivedAt: r?.receivedAt || '',
    }))
    out.laboratory = input.labResults.laboratory || null
  }
  if (typeof input?.facilityName === 'string') out.facilityName = input.facilityName
  if (typeof input?.assessor === 'string') out.assessor = input.assessor
  return out
}

/**
 * Parse the model's emitted text into a JSON array of issues.
 * The system prompt asks for raw JSON only, but Claude can still
 * wrap it in a code fence or add a sentence — defensive parsing
 * tolerates both.
 */
function tryParseIssues(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  let s = text.trim()
  // Strip code fence if present.
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) s = fenceMatch[1].trim()
  // Find the first '[' and last ']' — model sometimes adds preamble.
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first === -1 || last === -1 || last <= first) return []
  const candidate = s.slice(first, last + 1)
  try {
    const parsed = JSON.parse(candidate)
    if (!Array.isArray(parsed)) return []
    // Defensive shape coercion — drop anything that doesn't look
    // like an issue.
    return parsed
      .filter((x) => x && typeof x === 'object' && typeof x.title === 'string' && typeof x.severity === 'string')
      .map((x, i) => ({
        id: `sem-${Date.now().toString(36)}-${i}`,
        severity: ['blocking', 'warning', 'suggestion'].includes(x.severity) ? x.severity : 'suggestion',
        category: typeof x.category === 'string' ? x.category : 'unspecified',
        title: x.title.slice(0, 200),
        detail: typeof x.detail === 'string' ? x.detail.slice(0, 2000) : '',
        anchor: x.anchor && typeof x.anchor === 'object' ? x.anchor : {},
        source: 'semantic',
      }))
  } catch {
    return []
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured — missing API key' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = req.body || {}
  const assessment = body.assessment
  if (!assessment || typeof assessment !== 'object') {
    return res.status(400).json({ error: 'missing_assessment' })
  }

  const slim = slimAssessment(assessment)
  const slimJson = JSON.stringify(slim)
  if (slimJson.length > MAX_INPUT_BYTES) {
    return res.status(400).json({ error: 'assessment_too_large', max_bytes: MAX_INPUT_BYTES })
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
      console.error('[pre-review-semantic] rate limit check failed:', err && err.message)
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

  // Open SSE response. Once headers are set we communicate failures
  // via an 'error' frame rather than HTTP status.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

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
        messages: [{
          role: 'user',
          content: `Audit this IAQ assessment payload. Return ONLY a JSON array of issues per the schema.\n\nASSESSMENT:\n${slimJson}`,
        }],
      }),
    })
  } catch (err) {
    writeSse(res, 'error', { error: (err && err.message) || 'upstream_unreachable' })
    return res.end()
  }

  if (!upstream.ok || !upstream.body) {
    const errText = typeof upstream.text === 'function' ? await upstream.text() : ''
    writeSse(res, 'error', { error: `upstream_${upstream.status}_${errText.slice(0, 200)}` })
    return res.end()
  }

  // Non-streamed read — semantic audit is one structured JSON
  // response; we surface the parsed issues one at a time so the
  // client renders them as they're ready (same UX shape as the
  // streaming chat path, despite the underlying call being a
  // single-shot completion).
  let data
  try { data = await upstream.json() } catch { data = null }
  const text = (data?.content || [])
    .map((b) => (b && b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('')

  const issues = tryParseIssues(text)
  for (const issue of issues) {
    writeSse(res, 'issue', issue)
  }

  const inputTokens = data?.usage?.input_tokens || 0
  const outputTokens = data?.usage?.output_tokens || 0
  const cost = estimateCost(inputTokens, outputTokens)

  try {
    await supabase.from('narrative_generations').insert({
      user_id: user.id,
      generation_type: GENERATION_TYPE,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    })
  } catch (err) {
    console.error('[pre-review-semantic] ledger insert failed:', err && err.message)
  }

  try {
    await auditLog({
      action: 'pre_review_semantic.run',
      actor_id: user.id,
      actor_email: user.email,
      target_type: 'assessment',
      details: {
        model: ANTHROPIC_MODEL,
        issue_count: issues.length,
        blocking_count: issues.filter((i) => i.severity === 'blocking').length,
        warning_count: issues.filter((i) => i.severity === 'warning').length,
        suggestion_count: issues.filter((i) => i.severity === 'suggestion').length,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: cost,
        plan,
      },
    })
  } catch (err) {
    console.error('[pre-review-semantic] audit log failed:', err && err.message)
  }

  writeSse(res, 'done', {
    issue_count: issues.length,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
  })
  res.end()
}

module.exports = handler
module.exports.default = handler
module.exports.__test = {
  setSupabase(s) { _supabase = s },
  setFetch(f) { _fetch = f },
  reset() { _supabase = null; _fetch = null },
  slimAssessment,
  tryParseIssues,
  SYSTEM_PROMPT,
  MAX_INPUT_BYTES,
}
