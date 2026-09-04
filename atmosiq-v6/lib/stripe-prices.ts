/**
 * Stripe price IDs and tier metadata.
 *
 * The actual price IDs come from Stripe — populate the env vars on
 * Vercel after running `tsx scripts/setup-stripe-products.ts` against
 * the target Stripe account (test or live). Until populated, the
 * `price_xxx_unset` placeholders cause the checkout endpoint to refuse
 * to create a session, which is the safe failure mode.
 */

export type PlanTier = 'free' | 'solo' | 'pro' | 'practice'
export type BillingPeriod = 'monthly' | 'annual'

export const TIER_CREDITS: Record<PlanTier, number> = {
  free: 1,
  solo: 50,
  pro: 200,
  practice: 500,
}

// Display prices in cents (USD). Annual = 10x monthly (≈17% discount).
export const TIER_PRICE_CENTS: Record<Exclude<PlanTier, 'free'>, Record<BillingPeriod, number>> = {
  solo:     { monthly: 12_900,  annual: 129_000  },
  pro:      { monthly: 32_900,  annual: 329_000  },
  practice: { monthly: 74_900,  annual: 749_000  },
}

export const STRIPE_PRICE_IDS = {
  solo_monthly:     process.env.STRIPE_PRICE_SOLO_MONTHLY     ?? 'price_solo_monthly_unset',
  solo_annual:      process.env.STRIPE_PRICE_SOLO_ANNUAL      ?? 'price_solo_annual_unset',
  pro_monthly:      process.env.STRIPE_PRICE_PRO_MONTHLY      ?? 'price_pro_monthly_unset',
  pro_annual:       process.env.STRIPE_PRICE_PRO_ANNUAL       ?? 'price_pro_annual_unset',
  practice_monthly: process.env.STRIPE_PRICE_PRACTICE_MONTHLY ?? 'price_practice_monthly_unset',
  practice_annual:  process.env.STRIPE_PRICE_PRACTICE_ANNUAL  ?? 'price_practice_annual_unset',
} as const

export type PriceLookupKey = keyof typeof STRIPE_PRICE_IDS

export function priceKey(tier: PlanTier, period: BillingPeriod): PriceLookupKey | null {
  if (tier === 'free') return null
  return `${tier}_${period}` as PriceLookupKey
}

export function priceIdFor(tier: PlanTier, period: BillingPeriod): string | null {
  const key = priceKey(tier, period)
  if (!key) return null
  return STRIPE_PRICE_IDS[key]
}

export function isPriceConfigured(id: string | null): boolean {
  if (!id) return false
  return !id.endsWith('_unset')
}

// Env-key table for the reverse lookup. Duplicated (with a comment) in
// api/_stripe.js because the CommonJS webhook / checkout handlers cannot
// import this TypeScript module — keep the two tables identical.
const PRICE_ENV_KEYS: Record<PriceLookupKey, string> = {
  solo_monthly:     'STRIPE_PRICE_SOLO_MONTHLY',
  solo_annual:      'STRIPE_PRICE_SOLO_ANNUAL',
  pro_monthly:      'STRIPE_PRICE_PRO_MONTHLY',
  pro_annual:       'STRIPE_PRICE_PRO_ANNUAL',
  practice_monthly: 'STRIPE_PRICE_PRACTICE_MONTHLY',
  practice_annual:  'STRIPE_PRICE_PRACTICE_ANNUAL',
}

/**
 * Reverse lookup used by the Stripe webhook on customer.subscription.updated:
 * the subscription's price id → which tier / period it now is, so a plan
 * switch made in the Customer Portal (which changes only the Stripe price)
 * propagates to profiles.plan / billing_period / monthly_credit_limit.
 * Reads process.env at CALL time so a warm instance sees current config.
 */
export function planForPriceId(priceId: string | null | undefined): { plan: Exclude<PlanTier, 'free'>; billing_period: BillingPeriod } | null {
  if (!priceId) return null
  for (const [key, envKey] of Object.entries(PRICE_ENV_KEYS) as Array<[PriceLookupKey, string]>) {
    const configured = process.env[envKey]
    if (configured && !configured.endsWith('_unset') && configured === priceId) {
      const [plan, billing_period] = key.split('_') as [Exclude<PlanTier, 'free'>, BillingPeriod]
      return { plan, billing_period }
    }
  }
  return null
}

/** Monthly credit allotment for a plan; 0 for an unknown value. */
export function monthlyCreditsFor(plan: string | null | undefined): number {
  if (!plan) return 0
  return TIER_CREDITS[plan as PlanTier] ?? 0
}
