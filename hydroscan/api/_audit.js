/**
 * Append-only audit log writer.
 *
 * Writes to public.audit_log (migration 004). Service-role-only insert
 * per the table's RLS policy. Failures are logged but never thrown — a
 * logging failure must not break the user action that triggered it.
 *
 * NIST AU-2 (Auditable Events) + AU-3 (Content of Audit Records) surface.
 */

const { createClient } = require('@supabase/supabase-js')

let _client = null
function getClient() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _client = createClient(url, key)
  return _client
}

function ipFromReq(req) {
  if (!req || !req.headers) return null
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  if (req.headers['x-real-ip']) return req.headers['x-real-ip']
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress
  return null
}

async function auditLog({ action, actor_id, actor_email, target_type, target_id, details, req }) {
  if (!action) return
  const supabase = getClient()
  if (!supabase) {
    console.warn('[audit] supabase not configured; dropping event:', action)
    return
  }
  try {
    const row = {
      action,
      actor_id: actor_id || null,
      actor_email: actor_email || null,
      target_type: target_type || null,
      target_id: target_id != null ? String(target_id) : null,
      details: details || {},
      ip_address: ipFromReq(req),
    }
    const { error } = await supabase.from('audit_log').insert(row)
    if (error) console.error('[audit] insert failed:', error.message, '— event:', action)
  } catch (err) {
    console.error('[audit] insert threw:', err && err.message ? err.message : err, '— event:', action)
  }
}

module.exports = { auditLog }
