/**
 * Vercel Serverless Function — /api/audit
 * Records client-initiated audit events (e.g. logout).
 * Validates the JWT to derive actor_id server-side; the request body
 * cannot specify the actor.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

const ALLOWED_ACTIONS = new Set([
  'user.signin',
  'user.signout',
  'user.signup',
  'profile.update',
])

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const client = createClient(supabaseUrl, anonKey || serviceKey)
  const { data: { user }, error: authErr } = await client.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { action, details } = req.body || {}
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Unknown or disallowed action' })
  }

  await auditLog({
    action,
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'user',
    target_id: user.id,
    details: details && typeof details === 'object' ? details : {},
    req,
  })

  return res.status(200).json({ logged: true })
}
