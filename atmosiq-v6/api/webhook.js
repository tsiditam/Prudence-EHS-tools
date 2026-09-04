/**
 * Vercel Serverless Function — /api/webhook
 * Handles Stripe webhook events for subscription lifecycle.
 *
 * Idempotency (migration 006): Stripe retries delivery 2-5x. Without
 * the claim_stripe_event RPC, the same event_id processed multiple
 * times multi-grants credits. We claim atomically before business
 * logic; on failure, the claim row is deleted so a retry can re-process.
 *
 * Lifecycle (audit 2026-09 H5 closed the gaps marked •new):
 *   • checkout.session.completed (mode=subscription): set plan,
 *     billing_period, monthly_credit_limit, annual_renewal_at; grant
 *     TIER_CREDITS[plan] via the grant_credits RPC (balance + ledger row in
 *     one transaction).
 *   • invoice.paid with billing_reason=subscription_cycle (•new): grant the
 *     plan's monthly credits, idempotent on reference_id 'cycle-<invoice>'.
 *     A Solo-monthly subscriber used to receive credits exactly once.
 *     Annual subscribers are skipped here — their monthly allotment comes
 *     from scripts/cron-monthly-credit-grant.ts (Stripe fires invoice.paid
 *     once a year for them, and the cron already grants that month) — but
 *     their annual_renewal_at is rolled forward.
 *   • customer.subscription.updated (cancel_at_period_end=true):
 *     set subscription_status='canceling'; do NOT downgrade plan.
 *   • customer.subscription.updated with a price change (•new): the
 *     portal lets customers switch tiers, which only changed the Stripe
 *     price. items.data[0].price.id is mapped through the STRIPE_PRICE_*
 *     env to plan / billing_period / monthly_credit_limit.
 *   • customer.subscription.updated status (•new): raw Stripe statuses are
 *     mapped to the app vocabulary and never overwrite an admin 'suspended'.
 *   • customer.subscription.deleted: revert to free tier, 1 credit, with a
 *     ledger row for the reset (•new) and the same 'suspended' guard.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { createStripeClient, planForPriceId } = require('./_stripe.js')
const { withSentry } = require('./_with-sentry-cjs.js')

// Keep in step with TIER_CREDITS in lib/stripe-prices.ts (TypeScript —
// not requireable from this CommonJS handler).
const TIER_CREDITS = { solo: 50, pro: 200, practice: 500 }
const FREE_TIER_CREDITS = 1

// Stripe subscription.status → the vocabulary the app reads
// (subscription_status is unconstrained in the schema; the SPA and admin
// dashboard branch on 'active' / 'suspended' / 'canceling' / 'free').
const STRIPE_STATUS_MAP = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  paused: 'paused',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
}

function mapStripeStatus(raw) {
  if (typeof raw !== 'string') return null
  return STRIPE_STATUS_MAP[raw] || null
}

function isSuspended(profile) {
  if (!profile) return false
  return profile.account_status === 'suspended' || profile.subscription_status === 'suspended'
}

let _stripeClient = null
function getStripe() {
  if (_stripeClient) return _stripeClient
  _stripeClient = createStripeClient()
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

/** Atomic grant: profile balance + ledger row in one RPC. Throws on error. */
async function grantCredits(supabase, userId, amount, reason, referenceId) {
  const { data, error } = await supabase.rpc('grant_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_reference_id: referenceId,
  })
  if (error) throw new Error(`grant_credits failed: ${error.message}`)
  return typeof data === 'number' ? data : Number(data)
}

async function findProfileByCustomer(supabase, customerId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, plan, credits_remaining, billing_period, subscription_status, account_status')
    .eq('stripe_customer_id', customerId)
    .single()
  if (error || !data) return null
  return data
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

  await supabase.from('profiles').update({
    plan,
    billing_period: billingPeriod,
    monthly_credit_limit: credits,
    annual_renewal_at: annualRenewalAt,
    stripe_customer_id: session.customer || null,
    subscription_status: 'active',
  }).eq('id', userId)

  const newBalance = await grantCredits(
    supabase, userId, credits, 'subscription_grant',
    session.subscription || session.payment_intent || session.id,
  )

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

/**
 * Monthly renewal. Stripe sends invoice.paid for every successful charge;
 * only billing_reason === 'subscription_cycle' is a renewal (the first
 * invoice is 'subscription_create' and is credited by checkout.session.
 * completed). Idempotent on the ledger reference 'cycle-<invoice.id>' in
 * addition to the event-level claim — a replayed event with a NEW event id
 * (Stripe does that on manual resend) must still not double-grant.
 */
async function processInvoicePaid(supabase, event, req) {
  const invoice = event.data.object
  if (invoice.billing_reason !== 'subscription_cycle') {
    return { status: 'ignored', reason: `billing_reason=${invoice.billing_reason || 'none'}` }
  }
  const customerId = invoice.customer
  if (!customerId) return { status: 'skipped', reason: 'missing customer' }

  const profile = await findProfileByCustomer(supabase, customerId)
  if (!profile || !profile.id) return { status: 'skipped', reason: 'no profile for customer' }

  const referenceId = `cycle-${invoice.id}`
  const { data: existing, error: lookupErr } = await supabase
    .from('credits_ledger')
    .select('id')
    .eq('reference_id', referenceId)
    .limit(1)
  if (lookupErr) throw new Error(`ledger lookup failed: ${lookupErr.message}`)
  if (Array.isArray(existing) && existing.length > 0) {
    return { status: 'already_granted', reference_id: referenceId }
  }

  if (profile.billing_period === 'annual') {
    // The cron grants annual subscribers month by month; this invoice is
    // the yearly renewal, so only the renewal date moves.
    const annualRenewalAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('profiles').update({ annual_renewal_at: annualRenewalAt, subscription_status: 'active' }).eq('id', profile.id)
    return { status: 'success', action: 'annual_renewal', annual_renewal_at: annualRenewalAt }
  }

  const credits = TIER_CREDITS[profile.plan]
  if (!credits) return { status: 'skipped', reason: `no monthly allotment for plan ${profile.plan}` }

  const newBalance = await grantCredits(supabase, profile.id, credits, 'monthly_cycle', referenceId)
  if (!isSuspended(profile)) {
    await supabase.from('profiles').update({ subscription_status: 'active' }).eq('id', profile.id)
  }

  await auditLog({
    action: 'credits.grant',
    actor_id: profile.id,
    target_type: 'user',
    target_id: profile.id,
    details: { amount: credits, plan: profile.plan, reason: 'monthly_cycle', invoice: invoice.id, new_balance: newBalance },
    req,
  })

  return { status: 'success', action: 'monthly_cycle', credits, new_balance: newBalance, reference_id: referenceId }
}

async function processSubscriptionUpdated(supabase, event /* , req */) {
  const sub = event.data.object
  const customerId = sub.customer
  if (!customerId) return { status: 'skipped', reason: 'missing customer' }

  const profile = await findProfileByCustomer(supabase, customerId)
  const suspended = isSuspended(profile)
  const patch = {}

  // Plan switch made in the Customer Portal: the Stripe price changed.
  const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
    ? sub.items.data[0].price.id
    : null
  const mapped = planForPriceId(priceId)
  if (mapped) {
    patch.plan = mapped.plan
    patch.billing_period = mapped.billing_period
    patch.monthly_credit_limit = TIER_CREDITS[mapped.plan] || 0
  }

  // Cancel-at-period-end: customer hit "Cancel" in the portal but the
  // current paid period still runs. Mark canceling, keep plan + credits.
  if (sub.cancel_at_period_end) {
    if (!suspended) patch.subscription_status = 'canceling'
    await supabase.from('profiles').update(patch).eq('stripe_customer_id', customerId)
    return { status: 'success', customer: customerId, action: 'canceling_at_period_end', ...(mapped ? { plan: mapped.plan } : {}) }
  }

  // Plain status update — propagate through the vocabulary map. An admin
  // suspension is never overwritten by a Stripe status.
  const status = mapStripeStatus(sub.status)
  if (status && !suspended) patch.subscription_status = status

  if (Object.keys(patch).length === 0) {
    return { status: 'skipped', reason: suspended ? 'account suspended' : 'no actionable change' }
  }
  await supabase
    .from('profiles')
    .update(patch)
    .eq('stripe_customer_id', customerId)
  return {
    status: 'success',
    customer: customerId,
    ...(status && !suspended ? { subscription_status: status } : {}),
    ...(mapped ? { plan: mapped.plan, billing_period: mapped.billing_period } : {}),
  }
}

async function processSubscriptionDeleted(supabase, event, req) {
  const sub = event.data.object
  const customerId = sub.customer
  if (!customerId) return { status: 'skipped', reason: 'missing customer' }

  const profile = await findProfileByCustomer(supabase, customerId)
  const suspended = isSuspended(profile)
  // Captured before the update so the ledger delta reflects what was
  // actually forfeited.
  const previous = profile && typeof profile.credits_remaining === 'number' ? profile.credits_remaining : 0

  const patch = {
    plan: 'free',
    credits_remaining: FREE_TIER_CREDITS,
    monthly_credit_limit: FREE_TIER_CREDITS,
    billing_period: 'monthly',
    annual_renewal_at: null,
  }
  if (!suspended) patch.subscription_status = 'free'
  await supabase.from('profiles').update(patch).eq('stripe_customer_id', customerId)

  // The reset is a credit movement like any other — it gets a ledger row.
  if (profile && profile.id) {
    const { error: ledgerErr } = await supabase.from('credits_ledger').insert({
      user_id: profile.id,
      amount: FREE_TIER_CREDITS - previous,
      reason: 'subscription_reset',
      reference_id: sub.id ? `sub-deleted-${sub.id}` : `sub-deleted-${event.id}`,
      balance_after: FREE_TIER_CREDITS,
    })
    if (ledgerErr) console.error('[webhook] subscription_reset ledger insert failed:', ledgerErr.message)
  }

  await auditLog({
    action: 'subscription.terminated',
    target_type: 'subscription',
    details: { customer: customerId, reverted_to: 'free', suspended_kept: suspended },
    req,
  })

  return { status: 'success', customer: customerId, action: 'reverted_to_free', suspended_kept: suspended }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!sig || !webhookSecret) return res.status(400).json({ error: 'Missing signature or secret' })

  let event
  try {
    const body = await buffer(req)
    const stripe = getStripe()
    if (!stripe) throw new Error('STRIPE_SECRET_KEY not configured')
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
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
    } else if (event.type === 'invoice.paid') {
      result = await processInvoicePaid(supabase, event, req)
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

module.exports = withSentry(handler, { route: 'webhook' })
module.exports.config = { api: { bodyParser: false } }
module.exports.__test = {
  TIER_CREDITS,
  FREE_TIER_CREDITS,
  STRIPE_STATUS_MAP,
  mapStripeStatus,
  claimEvent,
  releaseClaim,
  recordResult,
  processCheckoutCompleted,
  processInvoicePaid,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  setStripe(mock) { _stripeClient = mock },
  setSupabase(mock) { _supabaseClient = mock },
  resetStripe() { _stripeClient = null },
  resetSupabase() { _supabaseClient = null },
}
