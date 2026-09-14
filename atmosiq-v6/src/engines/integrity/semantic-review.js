/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Semantic report review, end to end — the one path a candidate travels.
 *
 *   build the package → ask the provider → validate the WHOLE response →
 *   project what resolved into IntegrityFindings
 *
 * ── Two statuses, and they are not the same kind of thing ──────────────
 * `completed` means the review ran. It may have produced no findings, and
 * that is the ordinary outcome on a sound report.
 *
 * `unavailable` means the review did not run — a timeout, an outage, a
 * missing key, a reply that was not JSON. **This is a technical status, not
 * a consistency finding.** A provider outage says nothing whatever about the
 * report, so it must never produce a warning about the document, never
 * change readiness, and never appear in a list of things wrong with the
 * assessment. The caller is expected to say "semantic review not completed"
 * and stop there.
 *
 * ── Nothing is shown before everything is checked ──────────────────────
 * The response is validated as a COMPLETE object. There is deliberately no
 * streaming and no incremental projection: a candidate rendered as it
 * arrives is a candidate rendered before it was resolved, which is the one
 * thing this layer exists to prevent. The predecessor endpoint streamed
 * unvalidated issues as SSE frames, which is why the rule is stated here
 * rather than assumed.
 *
 * ── What this module never does ────────────────────────────────────────
 * It does not block, gate, or rate. It does not write to the render model,
 * the assessment record, or the deterministic findings. It does not
 * suppress a deterministic finding — deduplication runs one way, and the
 * deterministic layer always keeps its ground. Report review warns and
 * recommends; it never stops a report being generated, finalized, exported
 * or issued, and no change of provider, model or prompt is an exception.
 */

import { buildSemanticPackage, packageForReviewer } from './semantic-package.js'
import { validateSemanticResponse } from './semantic-validate.js'
import { supabase } from '../../utils/supabaseClient.js'

/** The review ran; `findings` is what survived resolution. */
export const COMPLETED = 'completed'

/** The review did not run. A fact about the reviewer, never about the report. */
export const UNAVAILABLE = 'unavailable'

/**
 * Every reason a review can fail to run. All technical.
 *
 * `request_failed` and `package_failed` are this module's own — the network
 * never answered, or the report could not be reduced to a package. The rest
 * are relayed from the endpoint unchanged.
 */
export const UNAVAILABLE_REASONS = Object.freeze([
  'package_failed', 'request_failed', 'not_configured', 'unreachable', 'timed_out',
  'upstream_error', 'unreadable', 'unparseable', 'rate_limited',
  'rate_limit_check_failed', 'ledger_reserve_failed', 'bad_request',
])

const unavailable = (reason, extra = {}) =>
  Object.freeze({ status: UNAVAILABLE, reason, findings: [], rejected: [], ...extra })

/**
 * Run a semantic review over one assembled report.
 *
 * Never throws and never rejects: every failure is a status. The report
 * workflow continues identically whatever happened here, which is the
 * property the whole design turns on.
 *
 * @param {object} input
 * @param {object} input.model      `assembleRenderModel` output
 * @param {object} [input.evidence] `buildEvidencePackage` output, for reference context
 * @param {Array}  [input.deterministic] `detectReportConsistency` output, for one-way dedup
 * @param {Function} [input.fetchFn] injected for tests
 * @param {string} [input.generatedAt] ISO stamp for provenance
 * @returns {Promise<{status: string, reason?: string, findings: object[],
 *   rejected: Array<{reason: string, detail?: string}>, provenance?: object,
 *   report_fingerprint?: string}>}
 */
export async function runSemanticReview(input = {}) {
  const deterministic = Array.isArray(input.deterministic) ? input.deterministic : []

  let pkg
  try {
    pkg = buildSemanticPackage({
      model: input.model,
      evidence: input.evidence,
      deterministicFindings: deterministic,
    })
  } catch (e) {
    console.error('Semantic package could not be built; review not requested:', e && e.message)
    return unavailable('package_failed')
  }
  if (!pkg.sections.length) return unavailable('package_failed')

  const fetchFn = input.fetchFn || (typeof fetch === 'function' ? fetch : null)
  if (!fetchFn) return unavailable('request_failed')

  let body
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (supabase) {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        if (session && session.access_token) headers.Authorization = `Bearer ${session.access_token}`
      } catch { /* unauthenticated; the endpoint refuses and we report unavailable */ }
    }
    const res = await fetchFn('/api/pre-review-semantic', {
      method: 'POST',
      headers,
      body: JSON.stringify({ package: packageForReviewer(pkg) }),
    })
    body = await res.json()
    if (!res.ok) {
      if (res.status === 429) return unavailable('rate_limited', { retry_after_seconds: body && body.retry_after_seconds })
      return unavailable(res.status === 400 ? 'bad_request' : 'request_failed')
    }
  } catch (e) {
    // A thrown fetch, a dropped connection, a body that is not JSON. The
    // report is untouched; nothing here is worth telling the assessor about
    // the document.
    console.warn('Semantic review request failed:', e && e.message)
    return unavailable('request_failed')
  }

  if (!body || body.status !== COMPLETED) {
    const reason = (body && body.reason) || 'request_failed'
    return unavailable(UNAVAILABLE_REASONS.includes(reason) ? reason : 'request_failed')
  }

  const provenance = (body && body.provenance) || {}

  // THE trust boundary. Every quote and identifier is resolved against the
  // same package the reviewer was given; anything unresolved is discarded
  // with a diagnostic and never reaches a reader.
  const { findings, rejected } = validateSemanticResponse({
    response: body.candidates,
    // The package already carries the deterministic findings (they were
    // built into it above, and the reviewer was shown them), and that is
    // the list dedup reads. There is no second channel for them.
    pkg,
    meta: {
      provider: provenance.provider,
      model: provenance.model,
      promptVersion: provenance.prompt_version,
      generatedAt: input.generatedAt || new Date().toISOString(),
    },
  })

  return Object.freeze({
    status: COMPLETED,
    findings,
    rejected,
    provenance,
    report_fingerprint: pkg.report_fingerprint,
  })
}

/**
 * Whether a stored review still describes the report as it stands now.
 *
 * Same discipline as `isAiSectionsFresh`: the fingerprint is over the
 * report's claim-bearing TEXT, so editing a sentence a finding quotes
 * invalidates the review that quoted it. A stale review is discarded rather
 * than shown with a caveat — a quotation mark around a sentence the report
 * no longer contains is worse than no review at all.
 */
export function isSemanticReviewFresh(review, pkg) {
  if (!review || !pkg) return false
  return review.status === COMPLETED
    && !!review.report_fingerprint
    && review.report_fingerprint === pkg.report_fingerprint
}
