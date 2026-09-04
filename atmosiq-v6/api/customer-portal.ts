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
 * `return_url` is allow-listed (audit 2026-09 H6 sibling): only the
 * production origin or the request's own origin is honoured; anything else
 * falls back to the default account page.
 *
 * Response contract:
 *   200 { url: string }                       — portal session URL
 *   401 { error: 'Not authenticated' }        — no/invalid JWT
 *   404 { error: 'No active subscription...' } — free tier or no Stripe customer
 *   500 { error: 'Server not configured' }    — env vars missing
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { createStripeClient } from './_stripe.js'
import { withSentry } from './_with-sentry.js'

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

const DEFAULT_RETURN_URL = 'https://atmosflow.net/account'
const ALLOWED_RETURN_ORIGINS = new Set(['https://atmosflow.net', 'https://www.atmosflow.net'])

let _stripe: Stripe | null = null
function getStripe(): Stripe | null {
  if (_stripe) return _stripe
  _stripe = createStripeClient() as Stripe | null
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

function headerStr(h: Record<string, string | string[] | undefined> | undefined, name: string): string | null {
  if (!h) return null
  const v = h[name]
  if (Array.isArray(v)) return v[0] ?? null
  return typeof v === 'string' ? v : null
}

function requestOrigin(req: VercelLikeRequest): string | null {
  const origin = headerStr(req.headers, 'origin')
  if (origin) return origin
  const host = headerStr(req.headers, 'x-forwarded-host') || headerStr(req.headers, 'host')
  if (!host) return null
  const proto = (headerStr(req.headers, 'x-forwarded-proto') || 'https').split(',')[0].trim()
  return `${proto}://${host}`
}

/** Allow-listed origins only; falls back to the account page otherwise. */
export function resolveReturnUrl(candidate: unknown, req: VercelLikeRequest): string {
  if (typeof candidate !== 'string' || !candidate.trim()) return DEFAULT_RETURN_URL
  let parsed: URL
  try { parsed = new URL(candidate.trim()) } catch { return DEFAULT_RETURN_URL }
  if (parsed.protocol !== 'https:') return DEFAULT_RETURN_URL
  const own = requestOrigin(req)
  if (!ALLOWED_RETURN_ORIGINS.has(parsed.origin) && parsed.origin !== own) return DEFAULT_RETURN_URL
  return `${parsed.origin}${parsed.pathname}`
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

  const returnUrl = resolveReturnUrl(req.body && req.body.return_url, req)

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

export default withSentry(handler, { route: 'customer-portal' })

// Test-only injection points.
export const __test = {
  DEFAULT_RETURN_URL,
  resolveReturnUrl,
  setStripe(mock: unknown) { _stripe = mock as Stripe },
  setSupabase(mock: unknown) { _supabase = mock as SupabaseClient },
  resetStripe() { _stripe = null },
  resetSupabase() { _supabase = null },
}
