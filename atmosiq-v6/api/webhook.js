/**
 * Vercel Serverless Function — /api/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 *
 * Idempotency (migration 006): Stripe retries delivery 2-5x. Without
 * the claim_stripe_event RPC, the same event_id processed multiple
 * times multi-grants credits. We claim atomically before business
 * logic; on failure, the claim row is deleted so a retry can re-process.
 *
 * Pricing rollout (migration 009):
 *   • checkout.session.completed (mode=subscription): set plan,
 *     billing_period, annual_renewal_at; grant TIER_CREDITS[plan]
 *   • customer.subscription.updated (cancel_at_period_end=true):
 *     set subscription_status='canceling'; do NOT downgrade plan
 *   • customer.subscription.deleted: revert to free tier, 1 credit
 *
 * For annual subscribers, monthly credit grants come from
 * scripts/cron-monthly-credit-grant.ts (Stripe only fires invoice.paid
 * once per year for annual subs).
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

const TIER_CREDITS = { solo: 50, pro: 200, practice: 500 }

let _stripeClient = null
function getStripe() {
  if (!_stripeClient) {
    const stripeLib = require('stripe')
    _stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY)
  }
  return _stripeClient
}

async function buffer(readable) {
  const chunks = []
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function claimEvent(supabase, eventId, eventType) {
  const { data, error } = await supabase.rpc('claim_stripe_event', {
    p_event_id: eventId,
    p_event_type: eventType,
  })
  if (error) {
    console.error('[webhook] claim_stripe_event rpc failed:', error.message)
    throw new Error('idempotency claim failed')
  }
  return data === true
}

async function releaseClaim(supabase, eventId) {
  try {
    await supabase.from('stripe_webhook_events').delete().eq('event_id', eventId)
  } catch (err) {
    console.error('[webhook] failed to release claim on event', eventId, err && err.message)
  }
}

async function recordResult(supabase, eventId, result) {
  try {
    await supabase.from('stripe_webhook_events').update({ result }).eq('event_id', eventId)
  } catch (err) {
    console.error('[webhook] failed to record result for event', eventId, err && err.message)
  }
}

async function processCheckoutCompleted(supabase, event, req) {
  const session = event.data.object
  const userId = session.metadata?.user_id
  const plan = session.metadata?.plan
  const billingPeriod = session.metadata?.billing_period || 'monthly'

  if (!userId || !plan || !TIER_CREDITS[plan]) {
    console.error('[webhook] checkout.session.completed missing metadata:', session.metadata)
    return { status: 'skipped', reason: 'missing or invalid metadata' }
  }

  const credits = TIER_CREDITS[plan]
  const annualRenewalAt = billingPeriod === 'annual'
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', userId).single()
  const newBalance = (profile?.credits_remaining || 0) + credits

  await supabase.from('profiles').update({
    credits_remaining: newBalance,
    plan,
    billing_period: billingPeriod,
    annual_renewal_at: annualRenewalAt,
    stripe_customer_id: session.customer || null,
    subscription_status: 'active',
  }).eq('id', userId)

  await supabase.from('credits_ledger').insert({
    user_id: userId,
    amount: credits,
    reason: 'subscription_grant',
    reference_id: session.subscription || session.payment_intent || session.id,
    balance_after: newBalance,
  })

  await supabase.from('purchases').insert({
    user_id: userId,
    stripe_payment_intent: session.payment_intent || null,
    stripe_session_id: session.id,
    amount_cents: session.amount_total,
    credits,
    plan,
    status: 'completed',
  })

  console.log(`[webhook] activated ${plan}/${billingPeriod} for user ${userId} (+${credits} credits)`)

  await auditLog({
    action: 'credits.grant',
    actor_id: userId,
    target_type: 'user',
    target_id: userId,
    details: {
      amount: credits, plan, billing_period: billingPeriod,
      payment_intent: session.payment_intent, amount_cents: session.amount_total,
      new_balance: newBalance, annual_renewal_at: annualRenewalAt,
    },
    req,
  })

  return { status: 'success', plan, billing_period: billingPeriod, credits, new_balance: newBalance }
}

async function processSubscriptionUpdated(supabase, event /* , req */) {
  const sub = event.data.object
  const customerId = sub.customer
  if (!customerId) return { status: 'skipped', reason: 'missing customer' }

  // Cancel-at-period-end: customer hit "Cancel" in the portal but the
  // current paid period still runs. Mark canceling, keep plan + credits.
  if (sub.cancel_at_period_end) {
    await supabase.from('profiles').update({ subscription_status: 'canceling' }).eq('stripe_customer_id', customerId)
    return { status: 'success', customer: customerId, action: 'canceling_at_period_end' }
  }

  // Plain status update — propagate.
  if (sub.status) {
    await supabase
      .from('profiles')
      .update({ subscription_status: sub.status })
      .eq('stripe_customer_id', customerId)
    return { status: 'success', customer: customerId, subscription_status: sub.status }
  }

  return { status: 'skipped', reason: 'no actionable change' }
}

async function processSubscriptionDeleted(supabase, event, req) {
  const sub = event.data.object
  const customerId = sub.customer
  if (!customerId) return { status: 'skipped', reason: 'missing customer' }

  await supabase.from('profiles').update({
    plan: 'free',
    subscription_status: 'free',
    credits_remaining: 1,
    billing_period: 'monthly',
    annual_renewal_at: null,
  }).eq('stripe_customer_id', customerId)

  await auditLog({
    action: 'subscription.terminated',
    target_type: 'subscription',
    details: { customer: customerId, reverted_to: 'free' },
    req,
  })

  return { status: 'success', customer: customerId, action: 'reverted_to_free' }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !webhookSecret) return res.status(400).json({ error: 'Missing signature or secret' })

  let event
  try {
    const body = await buffer(req)
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  const supabase = getSupabase()

  let claimed
  try {
    claimed = await claimEvent(supabase, event.id, event.type)
  } catch (err) {
    return res.status(500).json({ error: 'idempotency check failed' })
  }
  if (!claimed) {
    return res.status(200).json({ received: true, status: 'already_processed', event_id: event.id })
  }

  let result
  try {
    if (event.type === 'checkout.session.completed') {
      result = await processCheckoutCompleted(supabase, event, req)
    } else if (event.type === 'customer.subscription.updated') {
      result = await processSubscriptionUpdated(supabase, event, req)
    } else if (event.type === 'customer.subscription.deleted') {
      result = await processSubscriptionDeleted(supabase, event, req)
    } else {
      result = { status: 'ignored', event_type: event.type }
    }
  } catch (dbErr) {
    console.error('Database error during webhook processing:', dbErr)
    await releaseClaim(supabase, event.id)
    return res.status(500).json({ error: 'webhook processing failed' })
  }

  await recordResult(supabase, event.id, result)
  return res.status(200).json({ received: true, status: result.status, event_id: event.id })
}

module.exports = handler
module.exports.config = { api: { bodyParser: false } }
module.exports.__test = {
  TIER_CREDITS,
  claimEvent,
  releaseClaim,
  recordResult,
  processCheckoutCompleted,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  setStripe(mock) { _stripeClient = mock },
  setSupabase(mock) { _supabaseClient = mock },
  resetStripe() { _stripeClient = null },
  resetSupabase() { _supabaseClient = null },
}
