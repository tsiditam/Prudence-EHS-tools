/**
 * Vercel Serverless Function — /api/credits
 * Returns current credit balance for authenticated user.
 * Also handles credit consumption (debit).
 *
 * Debit path (audit 2026-09 §2.1 / C1): `amount` must be a positive integer
 * no larger than MAX_DEBIT — the old `!amount` check let `amount: -1000`
 * through, and `current < -1000` is never true, so the balance GREW and the
 * ledger row looked like a legitimate grant. The debit itself is now the
 * consume_credits RPC (migration 033), which checks-and-decrements in one
 * statement and writes the ledger row in the same transaction; the old
 * select → compute → update → insert sequence could double-spend under
 * concurrent requests and could leave balance_after out of step with
 * credits_remaining.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { withSentry } = require('./_with-sentry-cjs.js')

// One report / narrative / render is 1 credit. Nothing legitimate debits
// more than a handful at a time; a cap keeps a compromised session from
// zeroing an account in one call.
const MAX_DEBIT = 100
const MAX_REASON_LEN = 64
const MAX_REFERENCE_LEN = 128

let _supabaseClient = null
function getSupabase(serviceKey, url) {
  if (_supabaseClient) return _supabaseClient
  return createClient(url, serviceKey)
}

async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase(serviceKey, supabaseUrl)

  // Verify the user's JWT
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

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
    const body = req.body || {}
    const { amount, reason, reference_id } = body
    if (amount === undefined || amount === null || !reason) {
      return res.status(400).json({ error: 'amount and reason required' })
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer' })
    }
    if (amount > MAX_DEBIT) {
      return res.status(400).json({ error: `amount exceeds maximum of ${MAX_DEBIT}` })
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'amount and reason required' })
    }
    const safeReason = reason.trim().slice(0, MAX_REASON_LEN)
    const safeReference = typeof reference_id === 'string' && reference_id.trim()
      ? reference_id.trim().slice(0, MAX_REFERENCE_LEN)
      : null

    const { data: newBalanceRaw, error: rpcErr } = await supabase.rpc('consume_credits', {
      p_user_id: user.id,
      p_amount: amount,
      p_reason: safeReason,
      p_reference_id: safeReference,
    })

    if (rpcErr) {
      const msg = String(rpcErr.message || '')
      if (msg.includes('insufficient_credits')) {
        const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', user.id).single()
        const current = profile?.credits_remaining ?? 0
        return res.status(402).json({ error: 'Insufficient credits', credits: current })
      }
      if (msg.includes('profile_not_found')) {
        return res.status(402).json({ error: 'Insufficient credits', credits: 0 })
      }
      console.error('[credits] consume_credits rpc failed:', msg)
      return res.status(500).json({ error: 'credit_debit_failed' })
    }

    const newBalance = typeof newBalanceRaw === 'number' ? newBalanceRaw : Number(newBalanceRaw)

    await auditLog({
      action: 'credits.consume',
      actor_id: user.id,
      actor_email: user.email,
      target_type: 'user',
      target_id: user.id,
      details: { amount, reason: safeReason, reference_id: safeReference, new_balance: newBalance },
      req,
    })

    return res.status(200).json({ credits: newBalance, debited: amount })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

module.exports = withSentry(handler, { route: 'credits' })
module.exports.__test = {
  MAX_DEBIT,
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
