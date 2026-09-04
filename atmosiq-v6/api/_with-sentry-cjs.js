/**
 * withSentry for the CommonJS handlers (api/*.js).
 *
 * Twin of api/_with-sentry.ts. A plain .js function file cannot require
 * lib/sentry.ts at runtime on Vercel (CLAUDE.md pitfall #4 — the container
 * harness has been throwing on exactly that `require('../lib/sentry')` for
 * months, swallowed), so this file talks to @sentry/node directly and
 * carries a copy of the PII scrub from lib/sentry.ts. Keep the two
 * PII_FIELDS lists and the beforeSend shape in step.
 *
 * Contract is identical to the TS wrapper: init once per instance (no-op
 * without SENTRY_DSN), capture on throw, respond 500 with a stable code
 * and never with the error text.
 */

'use strict'

const PII_FIELDS = new Set(['email', 'name', 'firm', 'phone', 'address', 'street', 'city', 'zip', 'postal_code'])

function scrubPii(value) {
  if (value == null) return value
  if (Array.isArray(value)) return value.map(scrubPii)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = PII_FIELDS.has(String(k).toLowerCase()) ? '[scrubbed]' : scrubPii(v)
    }
    return out
  }
  return value
}

function beforeSend(event) {
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
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({ ...bc, data: bc.data ? scrubPii(bc.data) : bc.data }))
  }
  return event
}

let _initialised = false
let _sentry = null

function ensureInit() {
  if (_initialised) return
  _initialised = true
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    _sentry = require('@sentry/node')
    _sentry.init({
      dsn,
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown',
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      sampleRate: 1.0,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend,
    })
  } catch (err) {
    _sentry = null
    console.error('[sentry] init failed:', err && err.message)
  }
}

function capture(err, context) {
  if (!_sentry) return
  try {
    _sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(scrubPii(context || {}))) scope.setExtra(k, v)
      _sentry.captureException(err)
    })
  } catch {
    // never let telemetry crash the response path
  }
}

function alreadyResponded(res) {
  return Boolean(res && (res.headersSent || res.writableEnded))
}

function withSentry(handler, opts = {}) {
  const code = opts.code || 'unhandled'
  return async function sentryWrapped(req, res) {
    ensureInit()
    try {
      return await handler(req, res)
    } catch (err) {
      console.error(`[${opts.route || 'api'}] unhandled handler error:`, err && (err.stack || err.message) ? err.stack || err.message : err)
      capture(err, { route: opts.route || null, method: req && req.method ? String(req.method) : null })
      if (!res) return
      if (alreadyResponded(res)) {
        try { if (typeof res.end === 'function') res.end() } catch { /* ignore */ }
        return
      }
      try {
        if (typeof res.status === 'function') {
          res.status(500).json({ error: 'internal_error', code })
          return
        }
        if (typeof res.setHeader === 'function' && typeof res.end === 'function') {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'internal_error', code }))
        }
      } catch {
        // connection gone
      }
    }
  }
}

module.exports = {
  withSentry,
  scrubPii,
  beforeSend,
  __test: {
    reset() { _initialised = false; _sentry = null },
    isInitialised() { return _initialised },
  },
}
