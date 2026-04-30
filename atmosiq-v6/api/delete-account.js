/**
 * Vercel Serverless Function — /api/delete-account
 *
 * Self-service account deletion. Hard-deletes all PII per GDPR Art. 17
 * and CCPA §1798.105.
 *
 * Order matters because of foreign key constraints:
 *   1. assessments         (user_id FK)
 *   2. credits_ledger      (user_id FK)
 *   3. purchases           (user_id FK)
 *   4. analytics_events    (user_id FK)
 *   5. narrative_generations
 *   6. early_access_signups (matched by email — not FK, but PII)
 *   7. profiles
 *   8. Stripe customer
 *   9. auth.users
 *
 * After deletion, an immutable row is written to deletion_audit with a
 * SHA-256 hash of the user_id. No PII is retained.
 *
 * Response:
 *   200 { status: "deleted", entities_purged: [...] }
 *   401 if not authenticated
 *   403 if body.user_id is provided but doesn't match the JWT's user
 */

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

let _stripeClient = null
function getStripe() {
  if (_stripeClient) return _stripeClient
  if (!process.env.STRIPE_SECRET_KEY) return null
  const stripeLib = require('stripe')
  _stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY)
  return _stripeClient
}

let _supabaseClient = null
function getSupabase(serviceKey, url) {
  if (_supabaseClient) return _supabaseClient
  return createClient(url, serviceKey)
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

async function cancelStripeCustomer(stripeCustomerId) {
  const stripe = getStripe()
  if (!stripe || !stripeCustomerId) return { canceled: false, deleted: false }
  let canceled = 0
  try {
    const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 100 })
    for (const sub of (subs.data || [])) {
      if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
        await stripe.subscriptions.cancel(sub.id)
        canceled++
      }
    }
  } catch (err) {
    console.error('[delete-account] sub cancellation failed:', err && err.message)
  }
  let deleted = false
  try {
    await stripe.customers.del(stripeCustomerId)
    deleted = true
  } catch (err) {
    console.error('[delete-account] customer.del failed:', err && err.message)
  }
  return { canceled, deleted }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const supabase = getSupabase(serviceKey, supabaseUrl)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const requestedId = req.body && req.body.user_id
  if (requestedId && requestedId !== user.id) {
    return res.status(403).json({ error: 'Cannot delete another user' })
  }
  const initiatedBy = (req.body && req.body.initiated_by) || 'user'

  await auditLog({
    action: 'user.terminate',
    actor_id: user.id,
    actor_email: user.email,
    target_type: 'user',
    target_id: user.id,
    details: { self_initiated: initiatedBy === 'user', initiated_by: initiatedBy },
    req,
  })

  let stripeCustomerId = null
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()
    stripeCustomerId = profile && profile.stripe_customer_id
  } catch (err) {
    console.error('[delete-account] profile lookup failed:', err && err.message)
  }

  const purged = []
  try {
    await supabase.from('assessments').delete().eq('user_id', user.id)
    purged.push('assessments')

    await supabase.from('credits_ledger').delete().eq('user_id', user.id)
    purged.push('credits_ledger')

    await supabase.from('purchases').delete().eq('user_id', user.id)
    purged.push('purchases')

    await supabase.from('analytics_events').delete().eq('user_id', user.id)
    purged.push('analytics_events')

    await supabase.from('narrative_generations').delete().eq('user_id', user.id)
    purged.push('narrative_generations')

    if (user.email) {
      await supabase.from('early_access_signups').delete().eq('email', user.email)
      purged.push('early_access_signups')
    }

    await supabase.from('profiles').delete().eq('id', user.id)
    purged.push('profiles')

    const stripeResult = await cancelStripeCustomer(stripeCustomerId)
    if (stripeResult.deleted) purged.push('stripe_customer')
    if (stripeResult.canceled) purged.push('stripe_subscriptions')

    await supabase.auth.admin.deleteUser(user.id)
    purged.push('auth_user')
  } catch (err) {
    console.error('[delete-account] deletion error:', err)
    return res.status(500).json({ error: 'Deletion failed', entities_purged: purged })
  }

  try {
    await supabase.from('deletion_audit').insert({
      user_id_hash: sha256(user.id),
      entities_purged: purged,
      initiated_by: initiatedBy === 'admin' || initiatedBy === 'gdpr_request' ? initiatedBy : 'user',
    })
    purged.push('deletion_audit_recorded')
  } catch (err) {
    console.error('[delete-account] deletion_audit insert failed:', err && err.message)
  }

  return res.status(200).json({ status: 'deleted', entities_purged: purged })
}

module.exports = handler
module.exports.__test = {
  sha256,
  cancelStripeCustomer,
  setStripe(mock) { _stripeClient = mock },
  setSupabase(mock) { _supabaseClient = mock },
  resetStripe() { _stripeClient = null },
  resetSupabase() { _supabaseClient = null },
}
