/**
 * Vercel Serverless Function — /api/checkout
 *
 * Creates a Stripe Checkout session for a subscription. Body:
 *   { plan: 'solo'|'pro'|'practice', billing_period: 'monthly'|'annual',
 *     returnUrl?: string }
 *
 * Auth (audit 2026-09 §2.4 / H6): requires the caller's Supabase JWT as a
 * Bearer token. The user id + email are taken from the verified token;
 * `userId` / `userEmail` in the body are IGNORED. Before this the endpoint
 * was unauthenticated and the body's userId flowed straight into the
 * webhook metadata, so anyone could start a checkout that activated a plan
 * on an arbitrary account — and `returnUrl` was an open redirect into
 * Stripe's success/cancel URLs. Return URLs are now allow-listed to the
 * production origin or the request's own origin; anything else falls back
 * to the default.
 *
 * Free tier never enters this endpoint — it's tracked in the profiles
 * table only and granted on signup (lib/free-tier.ts).
 *
 * Mode is 'subscription' (recurring), so Stripe handles billing cycles.
 * Monthly renewals are credited by the webhook on invoice.paid
 * (billing_reason = subscription_cycle); annual customers get their monthly
 * allotment from scripts/cron-monthly-credit-grant.ts.
 */

const { createClient } = require('@supabase/supabase-js')
const { auditLog } = require('./_audit.js')
const { createStripeClient, lookupPriceId, PRICE_ENV_KEYS } = require('./_stripe.js')
const { withSentry } = require('./_with-sentry-cjs.js')

const PLAN_TIER_CREDITS = { solo: 50, pro: 200, practice: 500 }
const DEFAULT_RETURN_URL = 'https://atmosflow.net'
const ALLOWED_RETURN_ORIGINS = new Set(['https://atmosflow.net', 'https://www.atmosflow.net'])

let _stripeClient = null
function getStripe() {
  if (_stripeClient) return _stripeClient
  _stripeClient = createStripeClient()
  return _stripeClient
}

let _supabaseClient = null
function getSupabase() {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/** The origin the request itself came from, if the headers say so. */
function requestOrigin(req) {
  const h = (req && req.headers) || {}
  const origin = typeof h.origin === 'string' ? h.origin : null
  if (origin) return origin
  const host = typeof h['x-forwarded-host'] === 'string' ? h['x-forwarded-host'] : (typeof h.host === 'string' ? h.host : null)
  if (!host) return null
  const proto = typeof h['x-forwarded-proto'] === 'string' ? h['x-forwarded-proto'].split(',')[0].trim() : 'https'
  return `${proto}://${host}`
}

/**
 * Only an https origin on the allow-list, or the request's own origin, is
 * accepted as a Stripe return URL. Everything else → DEFAULT_RETURN_URL.
 * Returns origin + pathname only (no query/fragment) so the
 * `?checkout=success` marker appended below is unambiguous.
 */
function resolveReturnUrl(candidate, req) {
  if (typeof candidate !== 'string' || !candidate.trim()) return DEFAULT_RETURN_URL
  let parsed
  try { parsed = new URL(candidate.trim()) } catch { return DEFAULT_RETURN_URL }
  if (parsed.protocol !== 'https:') return DEFAULT_RETURN_URL
  const own = requestOrigin(req)
  if (!ALLOWED_RETURN_ORIGINS.has(parsed.origin) && parsed.origin !== own) return DEFAULT_RETURN_URL
  return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = getStripe()
  if (!stripe) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' })

  const supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Server not configured' })

  const authHeader = req.headers && req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') return res.status(401).json({ error: 'Not authenticated' })
  const { data: userData, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''))
  const user = userData && userData.user
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = req.body || {}
  const plan = String(body.plan || '')
  const billingPeriod = String(body.billing_period || 'monthly')
  const userId = user.id
  const userEmail = user.email || undefined
  const returnUrl = resolveReturnUrl(body.returnUrl, req)

  if (!['solo', 'pro', 'practice'].includes(plan)) {
    return res.status(400).json({ error: 'invalid_plan' })
  }
  if (!['monthly', 'annual'].includes(billingPeriod)) {
    return res.status(400).json({ error: 'invalid_billing_period' })
  }

  const priceId = lookupPriceId(plan, billingPeriod)
  if (!priceId) {
    console.error(`[checkout] Stripe price not configured for ${plan}/${billingPeriod} (set the STRIPE_PRICE_* env vars)`)
    return res.status(500).json({ error: 'price_not_configured' })
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: userEmail,
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
      actor_email: user.email,
      target_type: 'subscription',
      details: { plan, billing_period: billingPeriod, session_id: session.id },
      req,
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('[checkout] session create failed:', err && err.message)
    return res.status(500).json({ error: 'checkout_session_failed' })
  }
}

module.exports = withSentry(handler, { route: 'checkout' })
module.exports.__test = {
  lookupPriceId,
  resolveReturnUrl,
  PRICE_ENV_KEYS,
  PLAN_TIER_CREDITS,
  DEFAULT_RETURN_URL,
  setStripe(mock) { _stripeClient = mock },
  resetStripe() { _stripeClient = null },
  setSupabase(mock) { _supabaseClient = mock },
  resetSupabase() { _supabaseClient = null },
}
