/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * /api/webhook — Stripe webhook. Verifies the signature, is idempotent via the
 * stripe_webhook_events table (replays return 200 without double-granting), and
 * grants monthly report credits on checkout.session.completed / invoice.paid.
 * Plain CommonJS; tests inject mocks through module.exports.__test.
 */

const { creditsForPlan, planFromPriceId } = require('../lib/stripe-prices')

// Vercel: receive the raw body so Stripe signature verification works.
const config = { api: { bodyParser: false } }

let _stripe = null
let _supabase = null

function getStripe() {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  // eslint-disable-next-line global-require
  const Stripe = require('stripe')
  _stripe = new Stripe(key)
  return _stripe
}
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

function readRawBody(req) {
  if (req.body && (Buffer.isBuffer(req.body) || typeof req.body === 'string')) {
    return Promise.resolve(Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body))
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** Grant a plan's monthly credits to a user (idempotent per webhook event). */
async function grantCredits(supabase, userId, plan) {
  if (!userId || !plan) return
  const credits = creditsForPlan(plan)
  await supabase.from('billing_credits').upsert({
    user_id: userId,
    plan,
    balance: credits,
    renews_at: new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  await supabase.from('credit_ledger').insert({ user_id: userId, delta: credits, reason: `grant:${plan}` })
}

function planForEvent(event) {
  const obj = event.data && event.data.object ? event.data.object : {}
  // checkout.session.completed carries our metadata directly.
  if (obj.metadata && obj.metadata.plan) return { userId: obj.metadata.user_id, plan: obj.metadata.plan }
  // invoice.paid — resolve plan from the line-item price id.
  const line = obj.lines && obj.lines.data && obj.lines.data[0]
  const priceId = line && line.price && line.price.id
  const resolved = priceId ? planFromPriceId(priceId) : null
  const userId = (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.user_id) || obj.client_reference_id || null
  return resolved ? { userId, plan: resolved.plan } : { userId, plan: null }
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const stripe = getStripe()
  const supabase = getSupabase()
  if (!stripe || !supabase) { res.status(503).json({ error: 'Billing is not configured.' }); return }

  let event
  try {
    const raw = await readRawBody(req)
    const sig = req.headers['stripe-signature']
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    res.status(400).json({ error: `Webhook signature verification failed: ${err && err.message}` })
    return
  }

  // Idempotency — record the event id; a duplicate insert means a replay.
  try {
    const { error: dupErr } = await supabase
      .from('stripe_webhook_events')
      .insert({ id: event.id, type: event.type })
    if (dupErr) { res.status(200).json({ received: true, duplicate: true }); return }
  } catch {
    res.status(200).json({ received: true, duplicate: true })
    return
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const { userId, plan } = planForEvent(event)
      if (userId && plan) await grantCredits(supabase, userId, plan)
    }
    res.status(200).json({ received: true })
  } catch (err) {
    res.status(500).json({ error: 'Webhook handler failed.', detail: err && err.message })
  }
}

module.exports = handler
module.exports.default = handler
module.exports.config = config
module.exports.grantCredits = grantCredits
module.exports.planForEvent = planForEvent
module.exports.__test = {
  setStripe(s) { _stripe = s },
  setSupabase(s) { _supabase = s },
  reset() { _stripe = null; _supabase = null },
}
