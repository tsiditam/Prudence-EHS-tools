/**
 * withSentry — the one place server-side Sentry is initialised for the
 * TypeScript Vercel functions, and the last line of defence for a handler
 * that throws.
 *
 * Audit 2026-09 §2.10: initSentryServer() was called only from
 * server/index.js (the container path, which cannot boot), so no Vercel
 * function ever initialised Sentry and captureException had zero callers —
 * a week of 500s produced no alert. Every handler's default export is now
 * wrapped here, so the first request to a cold instance initialises Sentry
 * (guarded by a module flag; lib/sentry.ts guards again internally) and an
 * uncaught throw is captured before a stable 500 goes back to the client.
 *
 * The response body never carries the error text — that is the same
 * error-message-leak class the audit called out in ~15 handlers. Detail is
 * logged server-side and sent to Sentry (through the PII-scrubbing
 * beforeSend); the client sees { error: 'internal_error', code }.
 *
 * The CommonJS handlers use api/_with-sentry-cjs.js — a plain .js file
 * cannot require this .ts module at runtime (CLAUDE.md pitfall #4).
 */

import { initSentryServer, captureException } from '../lib/sentry.js'

type AnyHandler = (req: any, res: any) => unknown | Promise<unknown>

interface ResLike {
  headersSent?: boolean
  writableEnded?: boolean
  status?: (code: number) => { json: (body: unknown) => unknown; end?: () => unknown }
  statusCode?: number
  setHeader?: (k: string, v: string) => void
  end?: (body?: unknown) => unknown
}

let _initialised = false

function ensureInit(): void {
  if (_initialised) return
  _initialised = true
  try {
    initSentryServer()
  } catch (err) {
    console.error('[sentry] init failed:', err instanceof Error ? err.message : String(err))
  }
}

/** True when a body (or headers) already left — we must not write a JSON 500 over an SSE stream. */
function alreadyResponded(res: ResLike): boolean {
  return Boolean(res && (res.headersSent || res.writableEnded))
}

export function withSentry(handler: AnyHandler, opts: { route?: string; code?: string } = {}): AnyHandler {
  const code = opts.code || 'unhandled'
  return async function sentryWrapped(req: any, res: any) {
    ensureInit()
    try {
      return await handler(req, res)
    } catch (err) {
      console.error(`[${opts.route || 'api'}] unhandled handler error:`, err instanceof Error ? err.stack || err.message : err)
      try {
        captureException(err, { route: opts.route || null, method: req && req.method ? String(req.method) : null })
      } catch {
        // Sentry must never turn a 500 into a crash.
      }
      const r = res as ResLike
      if (!r) return
      if (alreadyResponded(r)) {
        try { if (typeof r.end === 'function') r.end() } catch { /* ignore */ }
        return
      }
      try {
        if (typeof r.status === 'function') {
          r.status(500).json({ error: 'internal_error', code })
          return
        }
        if (typeof r.setHeader === 'function' && typeof r.end === 'function') {
          r.statusCode = 500
          r.setHeader('content-type', 'application/json')
          r.end(JSON.stringify({ error: 'internal_error', code }))
        }
      } catch {
        // Nothing left to do — the connection is gone.
      }
    }
  }
}

export const __test = {
  reset() { _initialised = false },
  isInitialised() { return _initialised },
}
