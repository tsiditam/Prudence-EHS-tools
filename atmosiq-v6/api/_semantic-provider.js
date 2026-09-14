/**
 * Vercel Serverless Function support — the semantic reviewer's provider
 * adapter.
 *
 * ── Why this is its own file ───────────────────────────────────────────
 * This is the ONLY module in the semantic path that knows a provider
 * exists. The endpoint above it knows it is asking something for candidate
 * JSON; the validator below it knows nothing about where the JSON came
 * from. Swapping provider, model or transport changes this file and
 * nothing else.
 *
 * That separation is load-bearing rather than tidy. Provider and model are
 * deliberately OUTSIDE finding identity — two providers noticing the same
 * contradiction must produce one finding, not two — so the moment a model
 * name leaks into anything downstream of here, the same report reviewed
 * twice starts producing rows that appear and vanish as availability
 * shifts. The name travels as provenance and nothing more.
 *
 * ── What it returns ────────────────────────────────────────────────────
 * Raw, unvalidated candidates, exactly as parsed. It resolves nothing,
 * trusts nothing and promotes nothing: a quote here is a string the model
 * emitted, not a claim about the report. Everything that decides whether a
 * candidate is true happens later, in `semantic-validate.js`, on the
 * client, against the same package the reviewer was given.
 *
 * ── It never throws ────────────────────────────────────────────────────
 * Every failure is a value: `{ ok: false, reason }`. A provider outage, a
 * timeout, a 500 and a reply that is not JSON are all the same KIND of
 * event — the review did not happen — and none of them is a statement
 * about the report. The caller turns them into a technical status, never
 * into a finding.
 */

const { SEMANTIC_REVIEW_SYSTEM_PROMPT, SEMANTIC_PROMPT_VERSION } = require('./_semantic-review-prompt.js')
const { classifyUpstream } = require('./_upstream-error.js')

/** The provider family this adapter speaks. Provenance only. */
const PROVIDER = 'anthropic'

/**
 * Semantic judgment over prose needs the reasoning depth; the smaller
 * models get the JSON shape right and miss the disagreements.
 */
const MODEL = 'claude-sonnet-4-6'

/** Candidates are small and bounded (`MAX_CANDIDATES` is 40 in the schema). */
const MAX_OUTPUT_TOKENS = 4000

/** Past this the review is abandoned rather than left to hang a request. */
const TIMEOUT_MS = 55_000

/**
 * Why a review did not produce candidates. Every one is TECHNICAL — a fact
 * about the reviewer or the network, never about the report.
 */
const PROVIDER_FAILURES = Object.freeze([
  'not_configured',   // no API key on this deployment
  'unreachable',      // the call threw before a response existed
  'timed_out',        // no response inside TIMEOUT_MS
  'upstream_error',   // the provider answered with a non-2xx
  'unreadable',       // a 2xx whose body was not JSON
  'unparseable',      // a reply that carried no JSON object
])

/**
 * Pull the JSON object out of a reply, tolerating a code fence the model
 * added despite the instruction not to — the same tolerance
 * `api/report-sections.js` applies for the same reason.
 *
 * Returns null rather than throwing. A reply that is not JSON is a provider
 * failure, not an empty review: those are different things to the caller,
 * because one of them is worth retrying.
 */
function parseCandidateJson(text) {
  if (!text || typeof text !== 'string') return null
  let s = text.trim()
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    const parsed = JSON.parse(s.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Ask the provider for candidate issues over one reviewer package.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {object} opts.pkg  `packageForReviewer(...)` output — prose and
 *   identifiers, never a render model or an assessment record
 * @param {Function} [opts.fetchFn]  injected for tests
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok: true, response: object, usage: object, provider: string, model: string, prompt_version: number}
 *   | {ok: false, reason: string, status?: number, detail?: string}>}
 */
async function requestSemanticCandidates(opts = {}) {
  const apiKey = opts.apiKey
  if (!apiKey) return { ok: false, reason: 'not_configured' }

  const fetchFn = opts.fetchFn || global.fetch
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  let upstream
  try {
    upstream = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SEMANTIC_REVIEW_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: 'Review this report package for internal consistency. '
            + 'Return ONLY the strict JSON object the schema requires.\n\n'
            + JSON.stringify(opts.pkg),
        }],
      }),
    })
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError')
    return { ok: false, reason: aborted ? 'timed_out' : 'unreachable', detail: (err && err.message) || '' }
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!upstream || !upstream.ok) {
    let detail = ''
    try { detail = typeof upstream.text === 'function' ? await upstream.text() : '' } catch { /* body already gone */ }
    const status = (upstream && upstream.status) || 0
    // The shared classifier, for its ONE useful distinction here: a billing
    // or quota failure is an operator problem and a 503 is a transient one,
    // and an operator reading a log needs to tell them apart. Only its
    // `code` is taken. Its `message` is deliberately dropped — that string
    // is written to be shown to a user about a FEATURE, and nothing in this
    // path may put a sentence in front of an assessor about a review that
    // did not happen.
    const { code } = classifyUpstream(status, detail, 'The semantic review is')
    return { ok: false, reason: 'upstream_error', code, status, detail: String(detail).slice(0, 300) }
  }

  let data
  try { data = await upstream.json() } catch { return { ok: false, reason: 'unreadable' } }

  const text = ((data && data.content) || [])
    .map((b) => (b && b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('')

  const response = parseCandidateJson(text)
  if (!response) return { ok: false, reason: 'unparseable' }

  return {
    ok: true,
    response,
    usage: {
      input_tokens: (data && data.usage && data.usage.input_tokens) || 0,
      output_tokens: (data && data.usage && data.usage.output_tokens) || 0,
    },
    provider: PROVIDER,
    model: MODEL,
    prompt_version: SEMANTIC_PROMPT_VERSION,
  }
}

module.exports = {
  requestSemanticCandidates,
  parseCandidateJson,
  PROVIDER,
  MODEL,
  MAX_OUTPUT_TOKENS,
  TIMEOUT_MS,
  PROVIDER_FAILURES,
}
