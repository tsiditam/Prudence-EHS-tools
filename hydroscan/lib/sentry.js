/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sentry — server-side helpers for /api/* serverless functions.
 *
 * PII scrubbing is mandatory. scrubPii strips email/firm/name/address/
 * phone fields from any object before it leaves the process. The actual
 * Sentry transport is optional and lazy: until SENTRY_DSN is set and
 * @sentry/node is installed, initSentryServer / captureException are
 * no-ops so the assistant hot path carries zero extra weight.
 *
 * Plain `.js` (not `.ts`) on purpose: this file is reachable from the
 * api/** import graph, and the api-js-import guardrail forbids a
 * `.js` → extension-less `.ts` resolution. Keeping it `.js` keeps the
 * Vercel runtime resolution safe.
 */

const PII_FIELDS = new Set([
  'email',
  'name',
  'firm',
  'phone',
  'address',
  'street',
  'city',
  'zip',
  'postal_code',
])

export function scrubPii(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(scrubPii)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = PII_FIELDS.has(k.toLowerCase()) ? '[scrubbed]' : scrubPii(v)
    }
    return out
  }
  return value
}

// No-op transport stubs. Wired to @sentry/node in a later hardening
// pass; kept callable now so handlers can reference them unconditionally.
export function initSentryServer() {}
export function tagUser(_userId) {}
export function captureException(_err, _context) {}
