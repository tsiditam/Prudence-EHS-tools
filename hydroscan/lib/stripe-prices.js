/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Stripe price resolution + plan→credits map. Price IDs come from env (set in
 * the Vercel project), never hardcoded. Plain CommonJS (.js) so the api/*.js
 * billing handlers can require it without tripping the api-graph .ts guardrail.
 */

// Monthly report-credit grant per plan (-1 = unlimited). Mirrors
// src/components/pricing/tiers.js (kept in lockstep).
const PLAN_CREDITS = { free: 2, solo: 20, pro: 100, practice: -1 }

// plan + interval -> env var holding the Stripe price ID.
const PRICE_ENV_KEYS = {
  solo: { monthly: 'STRIPE_PRICE_SOLO_MONTHLY', annual: 'STRIPE_PRICE_SOLO_ANNUAL' },
  pro: { monthly: 'STRIPE_PRICE_PRO_MONTHLY', annual: 'STRIPE_PRICE_PRO_ANNUAL' },
  practice: { monthly: 'STRIPE_PRICE_PRACTICE_MONTHLY', annual: 'STRIPE_PRICE_PRACTICE_ANNUAL' },
}

/** Resolve the Stripe price ID for a plan + interval, or null if unset. */
function priceIdFor(plan, interval = 'monthly') {
  const key = PRICE_ENV_KEYS[plan] && PRICE_ENV_KEYS[plan][interval]
  return key ? process.env[key] || null : null
}

/** Reverse-lookup the plan id from a Stripe price ID (for webhook grants). */
function planFromPriceId(priceId) {
  for (const [plan, intervals] of Object.entries(PRICE_ENV_KEYS)) {
    for (const interval of Object.keys(intervals)) {
      if (process.env[intervals[interval]] && process.env[intervals[interval]] === priceId) {
        return { plan, interval }
      }
    }
  }
  return null
}

function creditsForPlan(plan) {
  return Object.prototype.hasOwnProperty.call(PLAN_CREDITS, plan) ? PLAN_CREDITS[plan] : 0
}

module.exports = { PLAN_CREDITS, PRICE_ENV_KEYS, priceIdFor, planFromPriceId, creditsForPlan }
