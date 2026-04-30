/**
 * Vercel Serverless Function — /api/webhook
 * Handles Stripe webhook events for payment confirmation.
 *
 * Idempotency: Stripe retries delivery on non-2xx responses, network
 * failures, and its own internal retry policy. Without an idempotency
 * gate, the same event_id can be processed 2-5 times and a single
 * checkout could grant 2-5x credits. The claim_stripe_event() RPC
 * (migration 006) atomically inserts an event_id row; the first caller
 * wins and processes business logic, subsequent callers see the row
 * already exists and return 200 already_processed.
 *
 * On business logic failure, the claim row is deleted so a retry can
 * re-attempt — partial state is impossible.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit')

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
    await supabase
      .from('stripe_webhook_events')
      .update({ result })
      .eq('event_id', eventId)
  } catch (err) {
    console.error('[webhook] failed to record result for event', eventId, err && err.message)
  }
}

async function processCheckoutCompleted(supabase, event, req) {
  const session = event.data.object
  const userId = session.metadata?.user_id
  const credits = parseInt(session.metadata?.credits || '0', 10)
  const plan = session.metadata?.plan || 'unknown'

  if (!userId || !credits) {
    console.error('Missing metadata:', session.metadata)
    return { status: 'skipped', reason: 'missing metadata' }
  }

  const { data: profile } = await supabase.from('profiles').select('credits_remaining').eq('id', userId).single()
  const currentCredits = profile?.credits_remaining || 0
  const newBalance = currentCredits + credits

  await supabase.from('profiles').update({
    credits_remaining: newBalance,
    plan: plan === 'team' ? 'team' : plan === 'pro' ? 'pro' : 'starter',
    stripe_customer_id: session.customer || null,
    subscription_status: 'active',
  }).eq('id', userId)

  await supabase.from('credits_ledger').insert({
    user_id: userId,
    amount: credits,
    reason: 'purchase',
    reference_id: session.payment_intent,
    balance_after: newBalance,
  })

  await supabase.from('purchases').insert({
    user_id: userId,
    stripe_payment_intent: session.payment_intent,
    stripe_session_id: session.id,
    amount_cents: session.amount_total,
    credits,
    plan,
    status: 'completed',
  })

  console.log(`Credits added: ${credits} to user ${userId} (new balance: ${newBalance})`)

  await auditLog({
    action: 'credits.grant',
    actor_id: userId,
    target_type: 'user',
    target_id: userId,
    details: {
      amount: credits,
      plan,
      payment_intent: session.payment_intent,
      amount_cents: session.amount_total,
      new_balance: newBalance,
    },
    req,
  })

  return { status: 'success', credits, plan, new_balance: newBalance }
}

async function processSubscriptionUpdated(supabase, event /* , req */) {
  const sub = event.data.object
  const customerId = sub.customer
  const status = sub.status
  if (!customerId || !status) return { status: 'skipped', reason: 'missing fields' }

  await supabase
    .from('profiles')
    .update({ subscription_status: status })
    .eq('stripe_customer_id', customerId)

  return { status: 'success', customer: customerId, subscription_status: status }
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
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      result = await processSubscriptionUpdated(supabase, event, req)
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
  claimEvent,
  releaseClaim,
  recordResult,
  processCheckoutCompleted,
  processSubscriptionUpdated,
  setStripe(mock) { _stripeClient = mock },
  setSupabase(mock) { _supabaseClient = mock },
  resetStripe() { _stripeClient = null },
  resetSupabase() { _supabaseClient = null },
}
