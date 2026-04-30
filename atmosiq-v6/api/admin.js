/**
 * Vercel Serverless Function — /api/admin
 * Admin dashboard data. Protected by ADMIN_SECRET.
 * Returns user list, revenue, usage metrics.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

module.exports = async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const supabase = createClient(supabaseUrl, serviceKey)

  await auditLog({
    action: 'admin.access',
    actor_email: 'admin',
    target_type: 'endpoint',
    target_id: 'admin',
    details: { method: req.method, body_action: (req.body && req.body.action) || null },
    req,
  })

  try {
    // Users
    const { data: profiles } = await supabase.from('profiles')
      .select('id, name, firm, plan, credits_remaining, subscription_status, stripe_customer_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    // Revenue
    const { data: purchases } = await supabase.from('purchases')
      .select('amount_cents, credits, plan, status, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100)

    const totalRevenue = (purchases || []).reduce((sum, p) => sum + (p.amount_cents || 0), 0)

    // Usage (last 30 days)
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

    // Credit adjustments (admin action)
    if (req.method === 'POST' && req.body?.action === 'adjust_credits') {
      const { userId, amount, reason } = req.body
      const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', userId).single()
      const newBalance = (profile?.credits_remaining || 0) + amount
      const finalBalance = Math.max(0, newBalance)
      await supabase.from('profiles').update({ credits_remaining: finalBalance }).eq('id', userId)
      await supabase.from('credits_ledger').insert({
        user_id: userId, amount, reason: reason || 'admin',
        reference_id: 'admin-adjustment', balance_after: finalBalance,
      })
      await auditLog({
        action: 'credits.adjust',
        actor_email: 'admin',
        target_type: 'user',
        target_id: userId,
        details: { amount, reason: reason || 'admin', new_balance: finalBalance },
        req,
      })
      return res.status(200).json({ success: true, newBalance: finalBalance })
    }

    // Suspend/activate user
    if (req.method === 'POST' && req.body?.action === 'set_status') {
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
    }

    return res.status(200).json({
      users: profiles || [],
      metrics: {
        totalUsers: (profiles || []).length,
        activeSubscribers: (profiles || []).filter(p => p.plan !== 'free').length,
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
