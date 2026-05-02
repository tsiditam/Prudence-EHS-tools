/**
 * Sentry — client-side initialization for the SPA bundle.
 *
 * Surfaces runtime errors from iOS Safari, Chrome, and other PWA targets
 * back to Sentry. Same PII scrubbing rules as the server:
 * email/firm/name/address never leave the browser.
 */

import * as Sentry from '@sentry/react'

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

function scrubPii<T>(value: T): T {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(scrubPii) as unknown as T
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_FIELDS.has(k.toLowerCase())) out[k] = '[scrubbed]'
      else out[k] = scrubPii(v)
    }
    return out as unknown as T
  }
  return value
}

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
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
  if (event.user) event.user = { id: event.user.id }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(bc => ({
      ...bc,
      data: bc.data ? scrubPii(bc.data) : bc.data,
    }))
  }
  return event
}

let _initialized = false

export function initSentryClient(): void {
  if (_initialized) return
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN
  if (!dsn) return
  const release = (import.meta as any).env?.VITE_GIT_COMMIT_SHA || 'unknown'
  const environment = (import.meta as any).env?.MODE || 'development'
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
