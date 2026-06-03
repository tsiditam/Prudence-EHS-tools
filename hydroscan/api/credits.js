/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * /api/credits — GET the signed-in user's report-credit balance; POST to
 * consume credits (e.g. on report generation). Plain CommonJS; tests inject
 * mocks through module.exports.__test.
 */

let _supabase = null
function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // eslint-disable-next-line global-require
  const { createClient } = require('@supabase/supabase-js')
  _supabase = createClient(url, key)
  return _supabase
}

async function userFromReq(supabase, req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data } = await supabase.auth.getUser(token)
  return data && data.user ? data.user : null
}

async function handler(req, res) {
  const supabase = getSupabase()
  if (!supabase) { res.status(503).json({ error: 'Billing is not configured.' }); return }

  try {
    const user = await userFromReq(supabase, req)
    if (!user) { res.status(401).json({ error: 'Sign in required.' }); return }

    // Current balance row (default free).
    const { data: row } = await supabase.from('billing_credits').select('plan, balance').eq('user_id', user.id).single()
    const plan = row ? row.plan : 'free'
    const balance = row ? row.balance : 0

    if (req.method === 'GET') {
      res.status(200).json({ plan, balance, unlimited: balance === -1 })
      return
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
      const amount = Math.max(1, parseInt(body.amount, 10) || 1)
      if (balance === -1) { res.status(200).json({ plan, balance: -1, unlimited: true }); return } // unlimited
      if (balance < amount) { res.status(402).json({ error: 'Out of report credits.', plan, balance }); return }
      const next = balance - amount
      await supabase.from('billing_credits').update({ balance: next, updated_at: new Date().toISOString() }).eq('user_id', user.id)
      await supabase.from('credit_ledger').insert({ user_id: user.id, delta: -amount, reason: body.reason || 'consume' })
      res.status(200).json({ plan, balance: next, unlimited: false })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: 'Credits operation failed.', detail: err && err.message })
  }
}

module.exports = handler
module.exports.default = handler
module.exports.__test = {
  setSupabase(s) { _supabase = s },
  reset() { _supabase = null },
}
