/**
 * Vercel Serverless Function — /api/credits
 * Returns current credit balance for authenticated user.
 * Also handles credit consumption (debit).
 */

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  // Verify the user's JWT
  const supabaseClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || serviceKey)
  const { data: { user }, error: authErr } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const supabase = createClient(supabaseUrl, serviceKey)

  if (req.method === 'GET') {
    // Return current balance
    const { data: profile } = await supabase.from('profiles').select('credits_remaining, plan, monthly_credit_limit').eq('id', user.id).single()
    return res.status(200).json({
      credits: profile?.credits_remaining ?? 0,
      plan: profile?.plan ?? 'free',
      limit: profile?.monthly_credit_limit ?? 5,
    })
  }

  if (req.method === 'POST') {
    // Consume credits
    const { amount, reason, reference_id } = req.body
    if (!amount || !reason) return res.status(400).json({ error: 'amount and reason required' })

    const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', user.id).single()
    const current = profile?.credits_remaining ?? 0

    if (current < amount) return res.status(402).json({ error: 'Insufficient credits', credits: current })

    const newBalance = current - amount
    await supabase.from('profiles').update({ credits_remaining: newBalance }).eq('id', user.id)
    await supabase.from('credits_ledger').insert({
      user_id: user.id,
      amount: -amount,
      reason,
      reference_id: reference_id || null,
      balance_after: newBalance,
    })

    return res.status(200).json({ credits: newBalance, debited: amount })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
