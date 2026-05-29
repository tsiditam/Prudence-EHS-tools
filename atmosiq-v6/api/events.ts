/**
 * Vercel Serverless Function — /api/events
 *
 * Event-spine endpoint (connectivity layer PR D). Forwards a
 * browser-issued event into the audit_log table via the same write
 * path /api/audit uses for security-audit events.
 *
 * Why a separate endpoint from /api/audit:
 *   /api/audit gates writes against a small allowlist of
 *   security-audit actions (user.signin, user.signout, profile.update).
 *   /api/events gates writes against the product-flow EventName
 *   allowlist defined in lib/events/types.ts. Different vocabularies,
 *   different governance, same backing table.
 *
 * Auth: same Bearer-token pattern as the other Jasper-adjacent
 * endpoints — caller forwards the Supabase access token; we validate
 * via auth.getUser; actor_id / actor_email are derived from the JWT
 * and CANNOT be specified in the body.
 *
 * Endpoint:
 *   POST /api/events
 *     body: {
 *       name: EventName,                    // required, allowlisted
 *       target_id?: string | null,          // optional
 *       target_type?: string | null,        // optional
 *       details?: Record<string, unknown>,  // optional, must be plain object
 *     }
 *     → 200 { ok: true }
 *       | 400 { error: 'bad_input' | 'unknown_event' | 'details_too_large' }
 *       | 401 { error: 'not_authenticated' | 'invalid_token' }
 *       | 405 { error: 'method_not_allowed' }
 *       | 500 { error: 'log_failed' }
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { KNOWN_EVENTS, type EventName } from '../lib/events/types'

// Cap details to a sane size so a runaway client payload can't
// inflate audit_log rows. Matches the spirit of the trackEvent
// fire-and-forget shape.
const MAX_DETAILS_BYTES = 8 * 1024

let _supabaseClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  _supabaseClient = createClient(url, key)
  return _supabaseClient
}

const KNOWN_EVENT_SET: Set<string> = new Set(KNOWN_EVENTS)

interface EventBody {
  name?: unknown
  target_id?: unknown
  target_type?: unknown
  details?: unknown
}

type Req = import('http').IncomingMessage & {
  body?: EventBody | string
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}
type Res = import('http').ServerResponse & {
  status: (n: number) => Res
  json: (body: unknown) => void
}

function ipFromReq(req: Req): string | null {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  const real = req.headers['x-real-ip']
  if (typeof real === 'string' && real.length > 0) return real
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress
  return null
}

async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'not_authenticated' })
    return
  }

  // Body parsing — Vercel auto-parses JSON, tests inject a string.
  let body: EventBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as EventBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as EventBody
  }

  const name = typeof body.name === 'string' ? body.name : ''
  if (!name) {
    res.status(400).json({ error: 'bad_input' })
    return
  }
  if (!KNOWN_EVENT_SET.has(name)) {
    res.status(400).json({ error: 'unknown_event' })
    return
  }

  const target_id = typeof body.target_id === 'string' ? body.target_id.slice(0, 256) : null
  const target_type = typeof body.target_type === 'string' ? body.target_type.slice(0, 64) : null

  let details: Record<string, unknown> = {}
  if (body.details && typeof body.details === 'object' && !Array.isArray(body.details)) {
    // Cap serialized size. JSON.stringify cost is O(payload), which
    // is bounded anyway by the JSON body limit Vercel applies.
    const serialized = JSON.stringify(body.details)
    if (serialized.length > MAX_DETAILS_BYTES) {
      res.status(400).json({ error: 'details_too_large' })
      return
    }
    details = body.details as Record<string, unknown>
  }

  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'invalid_token' })
    return
  }

  // Direct insert (rather than calling auditLog from api/_audit.js
  // via require()) keeps this TS module free of cross-extension
  // imports — the .js → .ts landmine pattern documented in CLAUDE.md
  // is about the inverse direction (.js importing .ts), but we
  // sidestep all of it by writing the row directly. Same shape as
  // auditLog() produces.
  const row = {
    action: name as EventName,
    actor_id: user.id,
    actor_email: user.email ?? null,
    target_type,
    target_id,
    details,
    ip_address: ipFromReq(req),
  }
  const { error: insertErr } = await supabase.from('audit_log').insert(row)
  if (insertErr) {
    console.error('[events] insert failed:', insertErr.message, '— event:', name)
    res.status(500).json({ error: 'log_failed' })
    return
  }

  res.status(200).json({ ok: true })
}

export default handler

// Test injection points — same convention as
// api/field-assistant-feedback.ts.
export const __test = {
  KNOWN_EVENT_SET,
  MAX_DETAILS_BYTES,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  reset() { _supabaseClient = null },
}
