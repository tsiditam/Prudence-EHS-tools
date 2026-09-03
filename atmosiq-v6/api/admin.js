/**
 * Vercel Serverless Function — /api/admin
 * Admin dashboard data. Protected by ADMIN_SECRET.
 *
 * Query param routing:
 *   GET  ?type=overview  (default) — user list, metrics, recent signups
 *   GET  ?type=credits              — credit profiles
 *   GET  ?type=usage[&days=N]       — daily AI usage via admin_usage_daily() RPC
 *   POST {action:'adjust_credits'}  — credit adjustment (grant_credits RPC)
 *   POST {action:'set_status'}      — suspend / reactivate user
 *
 * Audit 2026-09 §3 Medium: `amount` was untyped ("abc" → NaN written to
 * credits_remaining), `status` had no allow-list, and unsupported methods
 * fell through to the overview dump. All three are closed here; the credit
 * adjustment goes through grant_credits (migration 033) so the balance and
 * the ledger row are written in one transaction.
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const { auditLog } = require('./_audit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

// Largest single adjustment an admin can make in one call. A practice-tier
// month is 500; anything beyond ±5,000 is a typo, not an intent.
const MAX_ADJUSTMENT = 5000
const ALLOWED_STATUSES = new Set(['active', 'suspended'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Timing-safe bearer compare. Length is checked first (timingSafeEqual throws
// on unequal-length buffers). TODO(claude): a single shared static admin
// secret with no per-admin identity or rotation is a bigger design gap — a
// per-user `is_admin` JWT claim would replace this. Tracked for a follow-up.
function safeBearer(header, secret) {
  const a = Buffer.from(String(header || ''))
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function isUserId(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || !safeBearer(req.headers.authorization, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Server not configured' })

  await auditLog({
    action: 'admin.access',
    actor_email: 'admin',
    target_type: 'endpoint',
    target_id: 'admin',
    details: { method: req.method, body_action: (req.body && req.body.action) || null },
    req,
  })

  // ── Mutations ────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const action = req.body && req.body.action

    if (action === 'adjust_credits') {
      const { userId, amount, reason } = req.body
      if (!isUserId(userId)) return res.status(400).json({ error: 'userId must be a uuid' })
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
        return res.status(400).json({ error: 'amount must be a non-zero integer' })
      }
      if (Math.abs(amount) > MAX_ADJUSTMENT) {
        return res.status(400).json({ error: `amount exceeds ±${MAX_ADJUSTMENT}` })
      }
      const safeReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : 'admin'
      try {
        const { data: newBalance, error } = await supabase.rpc('grant_credits', {
          p_user_id: userId,
          p_amount: amount,
          p_reason: safeReason,
          p_reference_id: 'admin-adjustment',
        })
        if (error) {
          if (String(error.message || '').includes('profile_not_found')) {
            return res.status(404).json({ error: 'user_not_found' })
          }
          throw new Error(error.message)
        }
        await auditLog({
          action: 'credits.adjust',
          actor_email: 'admin',
          target_type: 'user',
          target_id: userId,
          details: { amount, reason: safeReason, new_balance: newBalance },
          req,
        })
        return res.status(200).json({ success: true, newBalance })
      } catch (err) {
        console.error('[admin] adjust_credits failed:', err && err.message)
        return res.status(500).json({ error: 'Failed to adjust credits' })
      }
    }

    if (action === 'set_status') {
      const { userId, status } = req.body
      if (!isUserId(userId)) return res.status(400).json({ error: 'userId must be a uuid' })
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ error: 'invalid_status', allowed: [...ALLOWED_STATUSES] })
      }
      try {
        const { error } = await supabase.from('profiles').update({ subscription_status: status }).eq('id', userId)
        if (error) throw new Error(error.message)
        await auditLog({
          action: status === 'suspended' ? 'user.suspend' : 'user.activate',
          actor_email: 'admin',
          target_type: 'user',
          target_id: userId,
          details: { status },
          req,
        })
        return res.status(200).json({ success: true })
      } catch (err) {
        console.error('[admin] set_status failed:', err && err.message)
        return res.status(500).json({ error: 'Failed to update status' })
      }
    }

    return res.status(400).json({ error: 'unknown_action' })
  }

  // ── Usage analytics ─────────────────────────────────────────────────────
  const queryType = (req.query && req.query.type) || 'overview'

  if (queryType === 'usage') {
    const rawDays = parseInt((req.query && req.query.days) || '30', 10)
    const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? rawDays : 30))
    try {
      const { data, error } = await supabase.rpc('admin_usage_daily', { p_days: days })
      if (error) throw new Error(error.message)
      return res.status(200).json({ usage: data || [], days })
    } catch (err) {
      console.error('[admin] usage query failed:', err && err.message)
      return res.status(500).json({ error: 'Failed to fetch usage data' })
    }
  }

  // ── Overview (default GET) ───────────────────────────────────────────────
  try {
    const { data: profiles } = await supabase.from('profiles')
      .select('id, name, firm, plan, credits_remaining, subscription_status, stripe_customer_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    const emailById = new Map()
    try {
      for (let page = 1; page <= 10; page++) {
        const { data: authPage, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
        if (authErr) break
        const users = (authPage && authPage.users) || []
        for (const u of users) emailById.set(u.id, u.email || '')
        if (users.length < 100) break
      }
    } catch (err) {
      console.error('auth.admin.listUsers failed:', err.message)
    }
    const profilesWithEmail = (profiles || []).map(p => ({ ...p, email: emailById.get(p.id) || '' }))
    const recentSignups = profilesWithEmail.slice(0, 10)

    const { data: purchases } = await supabase.from('purchases')
      .select('amount_cents, credits, plan, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100)

    const totalRevenue = (purchases || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { count: assessmentCount } = await supabase.from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'assessment_completed')
      .gte('created_at', thirtyDaysAgo)
    const { count: narrativeCount } = await supabase.from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'narrative_generated')
      .gte('created_at', thirtyDaysAgo)
    const { count: signupCount } = await supabase.from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'signup_completed')
      .gte('created_at', thirtyDaysAgo)

    return res.status(200).json({
      users: profilesWithEmail,
      recentSignups,
      metrics: {
        totalUsers: profilesWithEmail.length,
        activeSubscribers: profilesWithEmail.filter(p => p.plan !== 'free').length,
        totalRevenueCents: totalRevenue,
        totalRevenueFormatted: `$${(totalRevenue / 100).toFixed(2)}`,
        last30Days: {
          assessments: assessmentCount || 0,
          narratives: narrativeCount || 0,
          signups: signupCount || 0,
        },
      },
      recentPurchases: (purchases || []).slice(0, 20),
    })
  } catch (err) {
    console.error('Admin API error:', err)
    return res.status(500).json({ error: 'Failed to fetch admin data' })
  }
}

module.exports = withSentry(handler, { route: 'admin' })
module.exports.__test = {
  MAX_ADJUSTMENT,
  ALLOWED_STATUSES,
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
