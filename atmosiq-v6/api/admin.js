/**
 * Vercel Serverless Function — /api/admin
 * Admin dashboard data. Protected by ADMIN_SECRET.
 * Returns user list, revenue, usage metrics.
 */

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || req.headers.authorization !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    // Users
    const { data: profiles } = await supabase.from('profiles')
      .select('id, name, firm, plan, credits_remaining, subscription_status, stripe_customer_id, created_at, updated_at')
      .order('created_at', { ascending: false })

    // Attach auth emails (the profiles table doesn't store email —
    // it lives on auth.users). We page through up to 1000 users
    // (10 pages × 100); for larger tenants the server should
    // paginate the response, but the admin dashboard is a single-
    // operator surface so this is sufficient.
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
    const profilesWithEmail = (profiles || []).map(p => ({
      ...p,
      email: emailById.get(p.id) || '',
    }))

    // v2.6.2 — recentSignups field exposes the 10 most-recently-
    // joined profiles (matches the order requested by ?ascending:
    // false above) so the AdminDashboard can render a "who signed
    // up" panel without re-querying.
    const recentSignups = profilesWithEmail.slice(0, 10)

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
      await supabase.from('profiles').update({ credits_remaining: Math.max(0, newBalance) }).eq('id', userId)
      await supabase.from('credits_ledger').insert({
        user_id: userId, amount, reason: reason || 'admin',
        reference_id: 'admin-adjustment', balance_after: Math.max(0, newBalance),
      })
      return res.status(200).json({ success: true, newBalance: Math.max(0, newBalance) })
    }

    // Suspend/activate user
    if (req.method === 'POST' && req.body?.action === 'set_status') {
      const { userId, status } = req.body
      await supabase.from('profiles').update({ subscription_status: status }).eq('id', userId)
      return res.status(200).json({ success: true })
    }

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
