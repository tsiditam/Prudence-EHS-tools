/**
 * scripts/setup-stripe-products.ts
 *
 * Idempotently creates the AtmosFlow Stripe products and recurring
 * prices for the four-tier rollout. Solo / Pro / Practice — monthly
 * and annual variants. The Free tier is NOT a Stripe product; it lives
 * in the profiles table only.
 *
 * Idempotent semantics:
 *   • Product lookup is by exact `name` match against `stripe.products.list`.
 *   • If the product exists, its metadata is UPDATED in place.
 *   • If a recurring price with matching unit_amount + interval already
 *     exists for the product, it is reused; otherwise a new price is
 *     created. (Stripe doesn't allow updating an existing price's
 *     amount; you must create a new one and migrate subscriptions.)
 *
 * Output: writes the resolved price IDs to stdout AND emits a shell
 * snippet of `STRIPE_PRICE_*` env vars suitable for pasting into the
 * Vercel project settings.
 *
 * Required env:
 *   STRIPE_SECRET_KEY — sk_test_… for test mode (preferred for first
 *                       run), sk_live_… for production.
 *
 * Refuses to run with sk_live_ unless --confirm-live is also passed.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe-products.ts
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/setup-stripe-products.ts --confirm-live
 */

import Stripe from 'stripe'

interface TierSpec {
  tier: 'solo' | 'pro' | 'practice'
  productName: string
  description: string
  creditsPerMonth: number
  monthlyCents: number
  annualCents: number
}

const TIERS: TierSpec[] = [
  { tier: 'solo',     productName: 'AtmosFlow Solo',     description: 'For independent assessors',     creditsPerMonth: 50,  monthlyCents: 12_900, annualCents: 129_000 },
  { tier: 'pro',      productName: 'AtmosFlow Pro',      description: 'For active consulting work',    creditsPerMonth: 200, monthlyCents: 32_900, annualCents: 329_000 },
  { tier: 'practice', productName: 'AtmosFlow Practice', description: 'For small consulting practices', creditsPerMonth: 500, monthlyCents: 74_900, annualCents: 749_000 },
]

interface PriceRecord {
  tier: string
  period: 'monthly' | 'annual'
  priceId: string
  productId: string
}

async function findProduct(stripe: Stripe, name: string): Promise<Stripe.Product | null> {
  // Stripe's API doesn't expose name search; we list and filter.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.name === name) return product
  }
  return null
}

async function findRecurringPrice(
  stripe: Stripe,
  productId: string,
  amount: number,
  interval: 'month' | 'year',
): Promise<Stripe.Price | null> {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (
      price.unit_amount === amount &&
      price.recurring?.interval === interval &&
      price.currency === 'usd'
    ) {
      return price
    }
  }
  return null
}

async function ensureProduct(stripe: Stripe, spec: TierSpec): Promise<Stripe.Product> {
  const existing = await findProduct(stripe, spec.productName)
  const metadata = {
    tier: spec.tier,
    credits_per_month: String(spec.creditsPerMonth),
    rollout: 'four_tier_2026',
  }
  if (existing) {
    console.log(`  ✓ product exists: ${spec.productName} (${existing.id}) — updating metadata`)
    return stripe.products.update(existing.id, { description: spec.description, metadata })
  }
  console.log(`  + creating product: ${spec.productName}`)
  return stripe.products.create({ name: spec.productName, description: spec.description, metadata })
}

async function ensurePrice(
  stripe: Stripe,
  product: Stripe.Product,
  spec: TierSpec,
  period: 'monthly' | 'annual',
): Promise<PriceRecord> {
  const interval: 'month' | 'year' = period === 'monthly' ? 'month' : 'year'
  const amount = period === 'monthly' ? spec.monthlyCents : spec.annualCents

  const existing = await findRecurringPrice(stripe, product.id, amount, interval)
  if (existing) {
    console.log(`    ✓ ${period} price exists: ${existing.id} ($${(amount / 100).toFixed(2)})`)
    return { tier: spec.tier, period, priceId: existing.id, productId: product.id }
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amount,
    recurring: { interval },
    metadata: {
      tier: spec.tier,
      billing_period: period,
      credits_per_month: String(spec.creditsPerMonth),
    },
  })
  console.log(`    + created ${period} price: ${price.id} ($${(amount / 100).toFixed(2)})`)
  return { tier: spec.tier, period, priceId: price.id, productId: product.id }
}

export async function setupStripeProducts(): Promise<{ records: PriceRecord[]; envSnippet: string }> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  const isLive = key.startsWith('sk_live_')
  if (isLive && !process.argv.includes('--confirm-live')) {
    throw new Error('Refusing to run against live Stripe without --confirm-live')
  }

  const stripe = new Stripe(key, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion })
  const records: PriceRecord[] = []

  for (const spec of TIERS) {
    console.log(`\nTier: ${spec.tier}`)
    const product = await ensureProduct(stripe, spec)
    records.push(await ensurePrice(stripe, product, spec, 'monthly'))
    records.push(await ensurePrice(stripe, product, spec, 'annual'))
  }

  const envName = (r: PriceRecord) => `STRIPE_PRICE_${r.tier.toUpperCase()}_${r.period.toUpperCase()}`
  const envSnippet = records.map(r => `${envName(r)}=${r.priceId}`).join('\n')

  return { records, envSnippet }
}

if (process.argv[1] && process.argv[1].endsWith('setup-stripe-products.ts')) {
  setupStripeProducts()
    .then(({ envSnippet }) => {
      console.log('\n─── Add these to Vercel project env ───\n')
      console.log(envSnippet)
      console.log('\nDone.\n')
    })
    .catch(err => {
      console.error('setup failed:', err && (err.message || err))
      process.exit(1)
    })
}
