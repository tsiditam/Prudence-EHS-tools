/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Pricing tiers for HydroScan. PLACEHOLDER price points + monthly report
 * credits — confirm real figures before launch (the Stripe price IDs are read
 * from env via lib/stripe-prices.js, so changing numbers here is copy-only).
 * One report generation = one credit.
 */

export const TIERS = [
  {
    id: 'free',
    name: 'Free',
    blurb: 'Try HydroScan',
    priceMonthly: 0,
    priceAnnual: 0,
    credits: 2,
    features: [
      '2 report credits / month',
      'Full compliance & PFAS screening engine',
      'Smart Sampler field assessment',
      'Marlow AI — 10 questions / day',
    ],
  },
  {
    id: 'solo',
    name: 'Solo',
    blurb: 'Independent water assessors',
    priceMonthly: 39,
    priceAnnual: 390,
    credits: 20,
    features: [
      '20 report credits / month',
      'DOCX report drafting',
      'Marlow AI — unlimited',
      'Causal-chain & sampling-plan engine',
      'Chain-of-custody generator',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    blurb: 'Active environmental consulting',
    priceMonthly: 99,
    priceAnnual: 990,
    credits: 100,
    recommended: true,
    features: [
      '100 report credits / month',
      'Everything in Solo',
      'Custom report templates',
      'State-limit overlays & LSI corrosion index',
      'Priority support',
    ],
  },
  {
    id: 'practice',
    name: 'Practice',
    blurb: 'Small consulting practices',
    priceMonthly: 249,
    priceAnnual: 2490,
    credits: -1, // unlimited
    features: [
      'Unlimited report credits',
      'Everything in Pro',
      'Team workspace (coming soon)',
      'White-label report branding',
    ],
  },
]

export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t]))

/** Monthly report-credit grant for a plan (-1 = unlimited). */
export function creditsForPlan(planId) {
  return TIER_BY_ID[planId]?.credits ?? 0
}
