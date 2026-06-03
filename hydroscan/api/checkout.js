/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * /api/checkout — create a Stripe Checkout Session (subscription mode) for a
 * plan. Auth via the caller's Supabase JWT (Authorization: Bearer). Plain
 * CommonJS; tests inject mocks through module.exports.__test (vi.mock doesn't
 * reliably intercept require()).
 */

const { priceIdFor } = require('../lib/stripe-prices')

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

async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const stripe = getStripe()
  const supabase = getSupabase()
  if (!stripe || !supabase) { res.status(503).json({ error: 'Billing is not configured.' }); return }

  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const { data: userData } = await supabase.auth.getUser(token)
    const user = userData && userData.user
    if (!user) { res.status(401).json({ error: 'Sign in required.' }); return }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const plan = body.plan
    const interval = body.interval === 'annual' ? 'annual' : 'monthly'
    const priceId = priceIdFor(plan, interval)
    if (!priceId) { res.status(400).json({ error: `No price configured for ${plan}/${interval}.` }); return }

    const origin = req.headers.origin || `https://${req.headers.host || 'hydroscan.prudenceehs.com'}`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    })
    res.status(200).json({ url: session.url, id: session.id })
  } catch (err) {
    res.status(500).json({ error: 'Could not start checkout.', detail: err && err.message })
  }
}

module.exports = handler
module.exports.default = handler
module.exports.__test = {
  setStripe(s) { _stripe = s },
  setSupabase(s) { _supabase = s },
  reset() { _stripe = null; _supabase = null },
}
