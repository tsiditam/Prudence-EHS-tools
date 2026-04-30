/**
 * Vercel Serverless Function — /api/customer-portal
 *
 * Authenticated POST endpoint that creates a Stripe Customer Portal
 * session for the calling user. The portal lets customers cancel
 * (cancel-at-period-end), upgrade/downgrade between paid tiers, update
 * payment methods, and view invoices — all from Stripe's hosted UI.
 *
 * Configure the portal in Stripe Dashboard → Billing → Customer Portal:
 *   • Allow cancellation: yes (cancel at period end)
 *   • Allow plan changes: yes — between Solo/Pro/Practice (monthly + annual)
 *   • Allow payment method updates: yes
 *   • Allow invoice viewing: yes
 *
 * Webhook handles the lifecycle: cancel-at-period-end fires
 * customer.subscription.updated; the actual termination fires
 * customer.subscription.deleted (handled by api/webhook.js).
 *
 * Response contract:
 *   200 { url: string }                       — portal session URL
 *   401 { error: 'Not authenticated' }        — no/invalid JWT
 *   404 { error: 'No active subscription...' } — free tier or no Stripe customer
 *   500 { error: 'Server not configured' }    — env vars missing
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

interface VercelLikeRequest {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: { return_url?: string } | undefined
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse
  json: (body: Record<string, unknown>) => VercelLikeResponse
  end: () => VercelLikeResponse
}

let _stripe: Stripe | null = null
function getStripe(): Stripe | null {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  _stripe = new Stripe(key, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion })
  return _stripe
}

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

export async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = getSupabase()
  const stripe = getStripe()
  if (!supabase || !stripe) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const auth = req.headers?.authorization
  const authHeader = Array.isArray(auth) ? auth[0] : auth
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const jwt = String(authHeader).replace(/^Bearer\s+/, '')
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !userData.user) return res.status(401).json({ error: 'Invalid token' })

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('stripe_customer_id, plan')
    .eq('id', userData.user.id)
    .single()

  if (profErr) return res.status(500).json({ error: 'Profile lookup failed' })

  const customerId = profile?.stripe_customer_id
  if (!customerId) {
    return res.status(404).json({ error: 'No active subscription to manage.' })
  }

  const returnUrl = (req.body && req.body.return_url) || 'https://atmosiq.prudenceehs.com/account'

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'portal session error'
    console.error('[customer-portal] stripe error:', msg)
    return res.status(500).json({ error: 'Failed to create portal session' })
  }
}

export default handler

// Test-only injection points.
export const __test = {
  setStripe(mock: unknown) { _stripe = mock as Stripe },
  setSupabase(mock: unknown) { _supabase = mock as SupabaseClient },
  resetStripe() { _stripe = null },
  resetSupabase() { _supabase = null },
}
