/**
 * Four-tier pricing data — single source of truth for the PricingSheet
 * UI. Keep prices in sync with lib/stripe-prices.ts. Display values are
 * dollars; Stripe stores cents.
 */

export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    credits: 1,
    monthly: 0,
    annual: 0,
    blurb: 'Try AtmosFlow',
    cta: 'Start Free',
  },
  {
    id: 'solo',
    name: 'Solo',
    credits: 50,
    monthly: 129,
    annual: 1290,
    blurb: 'Independent assessors',
    cta: 'Choose Solo',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 200,
    monthly: 329,
    annual: 3290,
    blurb: 'Active consulting work',
    cta: 'Choose Pro',
    popular: true,
  },
  {
    id: 'practice',
    name: 'Practice',
    credits: 500,
    monthly: 749,
    annual: 7490,
    blurb: 'Small consulting practices',
    cta: 'Choose Practice',
  },
]

export function tierByPlanId(id) {
  return TIERS.find(t => t.id === id) || null
}

export function formatUsd(amount) {
  if (amount === 0) return '$0'
  return `$${amount.toLocaleString('en-US')}`
}

export function annualSavingsPercent() {
  // Annual price is 10x monthly; full price would be 12x monthly.
  // (12 - 10) / 12 ≈ 16.67% → round to 17%.
  return 17
}
