/**
 * Shared Stripe client factory for the API layer.
 *
 * ONE pinned apiVersion for every handler. Before this file, checkout.js,
 * webhook.js and delete-account.js each constructed `stripe(key)` with no
 * version (so they floated with the account default) while
 * customer-portal.ts pinned '2024-11-20.acacia' — four clients, two
 * behaviours, and a Stripe dashboard version bump would have changed the
 * shape of webhook payloads for three of them without warning.
 *
 * CommonJS so the .js handlers can require() it and the .ts handlers can
 * import it as './_stripe.js' (the same shape as api/_audit.js).
 *
 * Handlers keep their own `__test.setStripe(mock)` hook: each one caches
 * the client in a module-local and only falls back to createStripeClient()
 * when nothing was injected.
 */

'use strict'

const STRIPE_API_VERSION = '2024-11-20.acacia'

// Stripe price-id ↔ (plan, billing_period) mapping. The env keys are the
// single source of truth for which Stripe price backs which tier; keep this
// table in step with STRIPE_PRICE_IDS in lib/stripe-prices.ts (that module
// is TypeScript and cannot be required from the CommonJS handlers, which is
// why the map is duplicated here).
const PRICE_ENV_KEYS = {
  solo_monthly:     'STRIPE_PRICE_SOLO_MONTHLY',
  solo_annual:      'STRIPE_PRICE_SOLO_ANNUAL',
  pro_monthly:      'STRIPE_PRICE_PRO_MONTHLY',
  pro_annual:       'STRIPE_PRICE_PRO_ANNUAL',
  practice_monthly: 'STRIPE_PRICE_PRACTICE_MONTHLY',
  practice_annual:  'STRIPE_PRICE_PRACTICE_ANNUAL',
}

/**
 * Build a Stripe client from STRIPE_SECRET_KEY (or an explicit key).
 * Returns null when no key is configured so callers can 500 cleanly.
 */
function createStripeClient(key = process.env.STRIPE_SECRET_KEY) {
  if (!key) return null
  const Stripe = require('stripe')
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION })
}

/** (plan, billing_period) → configured price id, or null when unset. */
function lookupPriceId(plan, billingPeriod) {
  if (plan === 'free') return null
  const envKey = PRICE_ENV_KEYS[`${plan}_${billingPeriod}`]
  if (!envKey) return null
  const id = process.env[envKey]
  if (!id || id.endsWith('_unset')) return null
  return id
}

/**
 * Reverse lookup: Stripe price id → { plan, billing_period }, or null when
 * the id is not one of the configured tier prices. Read at call time (not
 * module load) so a webhook instance sees the env as it is now.
 */
function planForPriceId(priceId) {
  if (!priceId || typeof priceId !== 'string') return null
  for (const [key, envKey] of Object.entries(PRICE_ENV_KEYS)) {
    const configured = process.env[envKey]
    if (configured && !configured.endsWith('_unset') && configured === priceId) {
      const [plan, billing_period] = key.split('_')
      return { plan, billing_period }
    }
  }
  return null
}

module.exports = { STRIPE_API_VERSION, PRICE_ENV_KEYS, createStripeClient, lookupPriceId, planForPriceId }
