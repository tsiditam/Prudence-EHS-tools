/**
 * Vercel Serverless Function — /api/admin
 * Admin dashboard data. Protected by ADMIN_SECRET.
 *
 * Query param routing:
 *   GET  ?type=overview  (default) — user list, metrics, recent signups
 *   GET  ?type=credits              — credit profiles
 *   GET  ?type=usage[&days=N]       — daily AI usage via admin_usage_daily() RPC
 *   POST {action:'adjust_credits'}  — credit adjustment
 *   POST {action:'set_status'}      — suspend / reactivate user
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

module.exports = async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
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

  // ── Usage analytics ─────────────────────────────────────────────────────
  const queryType = (req.query && req.query.type) || 'overview'

  if (req.method === 'GET' && queryType === 'usage') {
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

  // ── Mutations ────────────────────────────────────────────────────────────
  if (req.method === 'POST' && req.body?.action === 'adjust_credits') {
    try {
      const { userId, amount, reason } = req.body
      const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', userId).single()
      const newBalance = Math.max(0, (profile?.credits_remaining || 0) + amount)
      await supabase.from('profiles').update({ credits_remaining: newBalance }).eq('id', userId)
      await supabase.from('credits_ledger').insert({
        user_id: userId, amount, reason: reason || 'admin',
        reference_id: 'admin-adjustment', balance_after: newBalance,
      })
      await auditLog({
        action: 'credits.adjust',
        actor_email: 'admin',
        target_type: 'user',
        target_id: userId,
        details: { amount, reason: reason || 'admin', new_balance: newBalance },
        req,
      })
      return res.status(200).json({ success: true, newBalance })
    } catch (err) {
      console.error('[admin] adjust_credits failed:', err && err.message)
      return res.status(500).json({ error: 'Failed to adjust credits' })
    }
  }

  if (req.method === 'POST' && req.body?.action === 'set_status') {
    try {
      const { userId, status } = req.body
      await supabase.from('profiles').update({ subscription_status: status }).eq('id', userId)
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

module.exports.__test = {
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
