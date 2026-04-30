/**
 * scripts/cron-monthly-credit-grant.ts
 *
 * Monthly cron — run via Vercel Cron on the 1st of each month at 00:00
 * UTC. For each ACTIVE annual subscriber, grants the monthly credit
 * allotment for their tier.
 *
 * This exists because Stripe only fires `invoice.paid` events ANNUALLY
 * for annual subscriptions, so the webhook can't be the source of
 * monthly credit grants for annual customers. Monthly subscribers get
 * their credits via the existing Stripe webhook each month.
 *
 * Idempotency: the cron writes a credits_ledger row with
 * `reason: 'monthly_grant'` and `reference_id` of YYYY-MM. A unique
 * partial index (added in this migration if not already present)
 * prevents double-granting if the cron runs twice in the same month.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const TIER_CREDITS: Record<string, number> = {
  solo: 50,
  pro: 200,
  practice: 500,
}

export interface CronResult {
  ok: boolean
  granted_count?: number
  total_credits?: number
  error?: string
  skipped_already_granted?: number
}

export async function runMonthlyCreditGrant(now: Date = new Date()): Promise<CronResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'SUPABASE_URL / SERVICE_ROLE_KEY not set' }

  const supabase = createClient(url, key)
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const referenceId = `monthly-grant-${monthKey}`

  const { data: subs, error: selErr } = await supabase
    .from('profiles')
    .select('id, plan, credits_remaining')
    .eq('billing_period', 'annual')
    .eq('subscription_status', 'active')
    .in('plan', ['solo', 'pro', 'practice'])

  if (selErr) return { ok: false, error: selErr.message }
  if (!subs || subs.length === 0) {
    return { ok: true, granted_count: 0, total_credits: 0 }
  }

  let granted = 0
  let skipped = 0
  let totalCredits = 0

  for (const sub of subs) {
    const grant = TIER_CREDITS[sub.plan as string] ?? 0
    if (grant === 0) continue

    // Skip if this user already received this month's grant.
    const { data: existing } = await supabase
      .from('credits_ledger')
      .select('id')
      .eq('user_id', sub.id)
      .eq('reference_id', referenceId)
      .limit(1)

    if (existing && existing.length > 0) {
      skipped++
      continue
    }

    const newBalance = (sub.credits_remaining || 0) + grant
    await supabase.from('profiles').update({ credits_remaining: newBalance }).eq('id', sub.id)
    await supabase.from('credits_ledger').insert({
      user_id: sub.id,
      amount: grant,
      reason: 'monthly_grant',
      reference_id: referenceId,
      balance_after: newBalance,
    })
    granted++
    totalCredits += grant
  }

  console.log(`[cron-monthly-credit-grant] granted to ${granted} annual subscribers (${totalCredits} credits); skipped ${skipped} already-granted`)
  return { ok: true, granted_count: granted, total_credits: totalCredits, skipped_already_granted: skipped }
}

if (process.argv[1] && process.argv[1].endsWith('cron-monthly-credit-grant.ts')) {
  runMonthlyCreditGrant()
    .then(r => {
      if (!r.ok) { console.error('failed:', r.error); process.exit(1) }
      process.exit(0)
    })
    .catch(err => {
      console.error('unhandled:', err)
      process.exit(1)
    })
}
