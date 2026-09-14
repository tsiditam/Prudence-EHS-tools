/**
 * Vercel Serverless Function support — the report-authoring provider
 * adapter.
 *
 * ── Why this is its own file ───────────────────────────────────────────
 * This is the ONLY module on the authoring path that knows which vendor
 * writes the prose. `api/report-sections.js` above it knows it is asking
 * something for five sections of JSON; the evidence package, the audit and
 * the client know less than that. Changing provider, model, transport or
 * sampling controls changes this file and nothing else.
 *
 * Sibling of `api/_semantic-provider.js`, which does the same job for the
 * reviewer. They are deliberately NOT one shared module: the two speak
 * different request and response contracts, and a single adapter serving
 * both would have to grow a mode flag, which is how the boundary stops
 * being a boundary.
 *
 * ── Why it matters more than tidiness ──────────────────────────────────
 * `temperature` is the concrete case. It is legal on the model this calls
 * today and is REMOVED on the current generation — Sonnet 5, Opus 5, Opus
 * 4.8 and 4.7, Fable 5 — where sending it returns a 400. While the
 * parameter was built into the handler, moving models meant editing the
 * endpoint; here it is one line behind a boundary, and the authoring layer
 * has no opinion about whether the vendor takes a sampling control at all.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────
 * No prompt of its own — the system prompt is server-owned in
 * `_report-sections-prompt.js` and passed in. No schema of its own beyond
 * "the reply is one JSON object". No retry, no repair, no fallback prose:
 * the handler owns what happens when a call fails, because that is a
 * product decision rather than a transport one.
 *
 * ── It never throws ────────────────────────────────────────────────────
 * Every outcome is a value. A thrown request, a non-2xx and a 2xx whose
 * body will not parse are three different things to the caller and are
 * reported as three different results, because the handler answers each
 * one differently and always has.
 */

const { classifyUpstream, statusForUpstream } = require('./_upstream-error.js')

/** The vendor this adapter speaks. Provenance only. */
const PROVIDER = 'anthropic'

/** The model that writes the sections. */
const MODEL = 'claude-sonnet-4-6'

/**
 * Five short-to-medium sections. 900 words total is generous headroom; a
 * draft that hits this ceiling mid-sentence is worse than a short one, so
 * this is slack, not a target — the prompt's own per-section word guidance
 * is what governs length.
 */
const MAX_OUTPUT_TOKENS = 4000

/**
 * The vendor's sampling control, and the reason it is HERE rather than in
 * the handler: it is a property of this provider's API, not of AtmosFlow's
 * authoring policy. The policy is "low variance, bounded length, high
 * factual discipline"; how a given vendor is asked for that is an
 * implementation detail of the adapter, and on models that dropped the
 * parameter it becomes an effort control instead with no change above.
 */
const TEMPERATURE = 0.7

// $/M tokens — vendor pricing, kept beside the vendor.
const COST_INPUT_PER_M = 3
const COST_OUTPUT_PER_M = 15

/** Why a call produced no sections. Transport facts, never editorial ones. */
const AUTHORING_FAILURES = Object.freeze(['unreachable', 'upstream'])

/** Dollars for one call, rounded as the ledger stores it. */
function estimateCost(inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null
  const usd = (inputTokens * COST_INPUT_PER_M + outputTokens * COST_OUTPUT_PER_M) / 1_000_000
  return Math.round(usd * 10000) / 10000
}

/**
 * Parse the reply into a plain sections object, tolerating a code fence the
 * model added despite the strict instruction not to — the same tolerance
 * `api/_semantic-provider.js` applies for the same reason.
 *
 * Returns `{}` (not an error) on anything unparseable; the deterministic
 * report is a complete document without any of these sections.
 */
function tryParseSections(text) {
  if (!text) return {}
  let s = String(text).trim()
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

/** The vendor's reply body reduced to the text it carries. */
function extractText(data) {
  return (data && data.content
    && data.content.map(b => b && b.type === 'text' ? b.text : '').filter(Boolean).join('\n')) || null
}

/**
 * Ask the provider to write the sections.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.system    the server-owned system prompt, passed in
 * @param {object} opts.payload   the closed evidence package, wire form
 * @param {Function} opts.fetchFn injected by the handler so tests can mock it
 * @param {string} [opts.subject] how a user-facing upstream message names
 *   this feature — AtmosFlow's wording, not the vendor's
 * @returns {Promise<
 *   {ok: true, sections: object, usage: object, cost: number|null, provider: string, model: string}
 *   | {ok: false, failure: 'unreachable', detail: string}
 *   | {ok: false, failure: 'upstream', status: number, httpStatus: number,
 *      error: string, code: string, message: string, retryable: boolean, detail: string}>}
 */
async function requestReportSections(opts = {}) {
  const { apiKey, system, payload, fetchFn } = opts
  const subject = opts.subject || 'Report sections are'

  let response
  try {
    response = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [{
          role: 'user',
          content: `Based ONLY on this evidence package, write the report sections as the strict JSON schema requires:\n\n${JSON.stringify(payload)}`,
        }],
      }),
    })
  } catch (e) {
    return { ok: false, failure: 'unreachable', detail: (e && e.message) || '' }
  }

  if (!response.ok) {
    const detail = typeof response.text === 'function' ? await response.text() : ''
    // An exhausted API account arrives as a 400, so "try again" is the wrong
    // advice for it — see api/_upstream-error.js. The classifier is shared
    // so every endpoint tells those apart the same way.
    const { code, message, retryable } = classifyUpstream(response.status, detail, subject)
    return {
      ok: false,
      failure: 'upstream',
      status: response.status,
      httpStatus: statusForUpstream(response.status, code),
      error: `upstream_${response.status}`,
      code,
      message,
      retryable,
      detail: String(detail).slice(0, 300),
    }
  }

  const data = await response.json()
  const usage = {
    input_tokens: data.usage && typeof data.usage.input_tokens === 'number' ? data.usage.input_tokens : null,
    output_tokens: data.usage && typeof data.usage.output_tokens === 'number' ? data.usage.output_tokens : null,
  }

  return {
    ok: true,
    sections: tryParseSections(extractText(data)),
    usage,
    cost: estimateCost(usage.input_tokens, usage.output_tokens),
    provider: PROVIDER,
    model: MODEL,
  }
}

module.exports = {
  requestReportSections,
  tryParseSections,
  extractText,
  estimateCost,
  PROVIDER,
  MODEL,
  MAX_OUTPUT_TOKENS,
  TEMPERATURE,
  AUTHORING_FAILURES,
}
