/**
 * Vercel Serverless Function — /api/checkout
 *
 * Creates a Stripe Checkout session for a subscription. Body:
 *   { plan: 'solo'|'pro'|'practice', billing_period: 'monthly'|'annual',
 *     userId: string, userEmail?: string, returnUrl?: string }
 *
 * Free tier never enters this endpoint — it's tracked in the profiles
 * table only and granted on signup (lib/free-tier.ts).
 *
 * Mode is 'subscription' (recurring), so Stripe handles billing cycles.
 * For annual subscriptions Stripe fires invoice.paid once per year; the
 * monthly credit grant for annual customers is handled by the cron at
 * scripts/cron-monthly-credit-grant.ts.
 */

const { auditLog } = require('./_audit')

const PLAN_TIER_CREDITS = { solo: 50, pro: 200, practice: 500 }

let _stripeClient = null
function getStripe() {
  if (_stripeClient) return _stripeClient
  if (!process.env.STRIPE_SECRET_KEY) return null
  const stripeLib = require('stripe')
  _stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY)
  return _stripeClient
}

const PRICE_ENV_KEYS = {
  solo_monthly:     'STRIPE_PRICE_SOLO_MONTHLY',
  solo_annual:      'STRIPE_PRICE_SOLO_ANNUAL',
  pro_monthly:      'STRIPE_PRICE_PRO_MONTHLY',
  pro_annual:       'STRIPE_PRICE_PRO_ANNUAL',
  practice_monthly: 'STRIPE_PRICE_PRACTICE_MONTHLY',
  practice_annual:  'STRIPE_PRICE_PRACTICE_ANNUAL',
}

function lookupPriceId(plan, billingPeriod) {
  if (plan === 'free') return null
  const key = `${plan}_${billingPeriod}`
  const envKey = PRICE_ENV_KEYS[key]
  if (!envKey) return null
  const id = process.env[envKey]
  if (!id || id.endsWith('_unset')) return null
  return id
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = getStripe()
  if (!stripe) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' })

  const body = req.body || {}
  const plan = String(body.plan || '')
  const billingPeriod = String(body.billing_period || 'monthly')
  const userId = body.userId
  const userEmail = body.userEmail
  const returnUrl = body.returnUrl || 'https://atmosiq.prudenceehs.com'

  if (!['solo', 'pro', 'practice'].includes(plan)) {
    return res.status(400).json({ error: `Invalid plan: ${plan}` })
  }
  if (!['monthly', 'annual'].includes(billingPeriod)) {
    return res.status(400).json({ error: `Invalid billing_period: ${billingPeriod}` })
  }
  if (!userId) return res.status(400).json({ error: 'userId required' })

  const priceId = lookupPriceId(plan, billingPeriod)
  if (!priceId) {
    return res.status(500).json({
      error: `Stripe price not configured for ${plan}/${billingPeriod}`,
      hint: 'Run scripts/setup-stripe-products.ts and populate the STRIPE_PRICE_* env vars on Vercel',
    })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        user_id: userId,
        plan,
        billing_period: billingPeriod,
        credits: String(PLAN_TIER_CREDITS[plan] ?? 0),
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan,
          billing_period: billingPeriod,
        },
      },
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=cancelled`,
    })

    await auditLog({
      action: 'checkout.session_created',
      actor_id: userId,
      target_type: 'subscription',
      details: { plan, billing_period: billingPeriod, session_id: session.id },
      req,
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('Checkout error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session', detail: err && err.message })
  }
}

module.exports = handler
module.exports.__test = {
  lookupPriceId,
  PRICE_ENV_KEYS,
  PLAN_TIER_CREDITS,
  setStripe(mock) { _stripeClient = mock },
  resetStripe() { _stripeClient = null },
}
