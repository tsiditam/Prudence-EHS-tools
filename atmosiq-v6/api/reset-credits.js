/**
 * Vercel Serverless Function — /api/reset-credits
 * Monthly credit reset for active subscribers.
 * Call via cron job or manual trigger.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const { auditLog } = require('./_audit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

// Timing-safe bearer compare. Length is checked first (timingSafeEqual throws
// on unequal-length buffers); that leaks only the length, not the secret.
function safeBearer(header, secret) {
  const a = Buffer.from(String(header || ''))
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function handler(req, res) {
  // FAIL-CLOSED: a missing CRON_SECRET is a misconfiguration, not an open door.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return res.status(503).json({ error: 'CRON_SECRET not configured' })
  if (!safeBearer(req.headers.authorization, cronSecret)) {
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

module.exports = withSentry(handler, { route: 'reset-credits' })
