/**
 * Vercel Serverless Function — /api/reset-credits
 * Monthly credit reset for active subscribers.
 * Call via cron job or manual trigger.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

module.exports = async function handler(req, res) {
  // Protect with a secret key
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    // Get all active subscribers
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, plan, credits_remaining, monthly_credit_limit')
      .in('subscription_status', ['active'])
      .neq('plan', 'free')

    if (error) throw error

    let resetCount = 0
    for (const p of (profiles || [])) {
      const newCredits = p.monthly_credit_limit || 50
      await supabase.from('profiles').update({
        credits_remaining: newCredits,
        billing_cycle_start: new Date().toISOString(),
      }).eq('id', p.id)

      await supabase.from('credits_ledger').insert({
        user_id: p.id,
        amount: newCredits - p.credits_remaining,
        reason: 'monthly_reset',
        reference_id: `reset-${new Date().toISOString().slice(0, 7)}`,
        balance_after: newCredits,
      })

      await auditLog({
        action: 'credits.reset',
        target_type: 'user',
        target_id: p.id,
        details: { plan: p.plan, new_credits: newCredits, prev_credits: p.credits_remaining },
        req,
      })
      resetCount++
    }

    return res.status(200).json({ success: true, reset: resetCount })
  } catch (err) {
    console.error('Credit reset error:', err)
    return res.status(500).json({ error: 'Reset failed' })
  }
}
