/**
 * Sentry — server-side initialization for /api/* serverless functions
 * and the Express container harness (server/index.js).
 *
 * PII scrubbing is mandatory. The beforeSend hook strips email/firm/name/
 * address/phone/address fields from any error context before transmission,
 * defense-in-depth on top of the project-level scrubbing configured in
 * the Sentry dashboard. See docs/SENTRY.md.
 *
 * Sample rates:
 *   • Errors: 100% (sampleRate: 1.0)
 *   • Performance: 10% (tracesSampleRate: 0.1)
 *
 * Tags applied:
 *   • release:     git SHA via VERCEL_GIT_COMMIT_SHA / GIT_COMMIT
 *   • environment: VERCEL_ENV / NODE_ENV
 *   • user_id:     attached at request boundary by handlers, not here
 */

import * as Sentry from '@sentry/node'

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

export function scrubPii<T>(value: T): T {
  if (value == null) return value
  if (Array.isArray(value)) {
    return value.map(scrubPii) as unknown as T
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_FIELDS.has(k.toLowerCase())) {
        out[k] = '[scrubbed]'
      } else {
        out[k] = scrubPii(v)
      }
    }
    return out as unknown as T
  }
  return value
}

export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Strip PII from request body, request headers, extra, contexts, breadcrumbs.
  if (event.request) {
    if (event.request.headers) {
      const headers = { ...event.request.headers }
      delete headers.cookie
      delete headers.authorization
      delete headers.Authorization
      event.request.headers = headers
    }
    if (event.request.data && typeof event.request.data === 'object') {
      event.request.data = scrubPii(event.request.data)
    }
  }
  if (event.extra) event.extra = scrubPii(event.extra)
  if (event.contexts) event.contexts = scrubPii(event.contexts)
  if (event.user) {
    // Keep id (it's a UUID, not PII), drop email/username/ip.
    event.user = { id: event.user.id }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(bc => ({
      ...bc,
      data: bc.data ? scrubPii(bc.data) : bc.data,
    }))
  }
  return event
}

let _initialized = false

export function initSentryServer(): void {
  if (_initialized) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    // No-op when DSN unset — local dev, tests, etc.
    return
  }
  const release = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown'
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
  Sentry.init({
    dsn,
    release,
    environment,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend,
  })
  _initialized = true
}

export function tagUser(userId: string | null): void {
  if (!userId) return
  Sentry.setUser({ id: userId })
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.withScope(scope => {
      for (const [k, v] of Object.entries(scrubPii(context))) {
        scope.setExtra(k, v)
      }
      Sentry.captureException(err)
    })
  } else {
    Sentry.captureException(err)
  }
}
