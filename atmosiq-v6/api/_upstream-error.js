/**
 * Vercel Serverless Function support — one classifier for an upstream
 * (Anthropic) failure, shared by every endpoint that calls the model.
 *
 * Why this exists. A 400 carrying "Your credit balance is too low to access
 * the Anthropic API" was returned to the client as a bare `upstream_400`,
 * which `/api/narrative` and `/api/report-sections` surfaced as "try again in
 * a moment" — advice that is wrong: the account is out of credit and no
 * number of retries will change that. Meanwhile `field-assistant.ts` and
 * `inline-ai.js` each carried their OWN copy of a `friendlyUpstreamError`
 * that DID detect it, so the same upstream condition produced four different
 * answers depending on which surface the assessor happened to be on. Same
 * defect class as the duplicated limiter the audit found: the fix is one
 * function every caller reads, not a fifth copy.
 *
 * What it deliberately does NOT do: name the vendor, quote the upstream
 * message, or tell the reader to go and top up an account. The assessor
 * reading this is not the account holder — they need to know that retrying
 * is pointless and who to tell. The raw upstream body is already logged
 * server-side for whoever IS the account holder.
 *
 * CommonJS so both the .js handlers (`require`) and the .ts handler
 * (`import … from './_upstream-error.js'`) can load it — the api/_rate-limit.js
 * pattern, and the extension is required (CLAUDE.md pitfall #4).
 */

'use strict'

/** Anthropic phrases an exhausted account as a 400 "credit balance" error. */
const BILLING_RE = /credit balance|billing|payment required|quota exceeded/i

/**
 * Classify an upstream non-2xx into a stable code and one sentence a
 * non-technical reader can act on.
 *
 * @param {number} status          the upstream HTTP status
 * @param {string} [bodyText]      the upstream body, as text
 * @param {string} [subject]       what to call the feature in the sentence
 * @returns {{ code: string, message: string, retryable: boolean }}
 *   `code` is stable and machine-readable: billing | auth | rate_limit |
 *   unavailable | unknown. `retryable` says whether trying again could
 *   plausibly succeed — false for billing and auth, which need a person.
 */
function classifyUpstream(status, bodyText, subject = 'AI features are') {
  const raw = String(bodyText || '')
  // Billing is checked before status, because Anthropic reports an exhausted
  // account as a 400 — indistinguishable by status from a malformed request.
  if (BILLING_RE.test(raw)) {
    return {
      code: 'billing',
      retryable: false,
      message: `${subject} temporarily unavailable because of a service billing issue. Retrying will not help — please contact your administrator.`,
    }
  }
  if (status === 401 || status === 403) {
    return {
      code: 'auth',
      retryable: false,
      message: `${subject} temporarily unavailable because the service credentials were rejected. Please contact your administrator.`,
    }
  }
  if (status === 429) {
    return { code: 'rate_limit', retryable: true, message: `${subject} busy right now. Please try again in a moment.` }
  }
  if (status >= 500) {
    return { code: 'unavailable', retryable: true, message: `${subject} temporarily unavailable. Please try again in a few minutes.` }
  }
  return { code: 'unknown', retryable: true, message: `${subject} unable to complete this request. Please try again.` }
}

/** The HTTP status this API should answer with for a given upstream failure. */
function statusForUpstream(status, code) {
  if (status === 429) return 429
  // A non-retryable upstream failure is a service-configuration problem, not
  // a bad gateway: 503 tells a client (and a monitor) not to hammer it.
  if (code === 'billing' || code === 'auth') return 503
  return 502
}

/**
 * Same classification, for the streaming handlers that carry a failure as one
 * string (`upstream_429: {…body…}`) rather than a (status, body) pair.
 * Returns the message alone, since those surfaces write it straight to SSE.
 */
function friendlyUpstreamError(raw, subject = 'AI features are') {
  const text = String(raw || '')
  const m = /^upstream_(\d{3})/.exec(text)
  return classifyUpstream(m ? Number(m[1]) : 0, text, subject).message
}

module.exports = { classifyUpstream, statusForUpstream, friendlyUpstreamError, BILLING_RE }
