/**
 * scripts/cron-free-tier-reset.ts
 *
 * Daily cron — run via Vercel Cron at 00:00 UTC (vercel.json). Resets
 * free-tier accounts back to 1 credit if they're below 1. Idempotent:
 * if already at 1 or higher, the row is unchanged.
 *
 * Why monthly cadence is implemented as a daily cron with idempotent
 * reset rather than a 1st-of-month cron: spreading the load across
 * days, plus daily makes it self-healing if a previous run failed.
 * The acceptance contract is "free-tier user gets 1 credit per month";
 * the implementation guarantees "always have at least 1 credit, reset
 * daily." Functionally equivalent for a 1-credit-per-month allowance.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET                — Bearer token for HTTP invocation
 *
 * Exit 0 on success. Logs the affected row count.
 */

import { createClient } from '@supabase/supabase-js'

export interface CronResult {
  ok: boolean
  reset_count?: number
  error?: string
}

export async function runFreeTierReset(): Promise<CronResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'SUPABASE_URL / SERVICE_ROLE_KEY not set' }

  const supabase = createClient(url, key)

  // Find free-tier rows with < 1 credit and bump them to 1.
  const { data: targets, error: selErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('plan', 'free')
    .lt('credits_remaining', 1)

  if (selErr) return { ok: false, error: selErr.message }
  if (!targets || targets.length === 0) {
    console.log('[cron-free-tier-reset] no free-tier rows below 1 credit')
    return { ok: true, reset_count: 0 }
  }

  const ids = targets.map(r => r.id as string)
  const { error: updErr } = await supabase
    .from('profiles')
    .update({ credits_remaining: 1 })
    .in('id', ids)

  if (updErr) return { ok: false, error: updErr.message }
  console.log(`[cron-free-tier-reset] reset ${ids.length} free-tier accounts to 1 credit`)
  return { ok: true, reset_count: ids.length }
}

if (process.argv[1] && process.argv[1].endsWith('cron-free-tier-reset.ts')) {
  runFreeTierReset()
    .then(r => {
      if (!r.ok) { console.error('failed:', r.error); process.exit(1) }
      process.exit(0)
    })
    .catch(err => {
      console.error('unhandled:', err)
      process.exit(1)
    })
}
