/**
 * scripts/cron-portfolio-digest.ts
 *
 * Quarterly portfolio-digest enqueue (habit-loop PR 3).
 *
 * Runs from the Vercel cron entry api/cron-portfolio-digest.ts on
 * the first day of each quarter (schedule "0 13 1 1,4,7,10 *" in
 * vercel.json). The cron is idempotent: if it runs more than once
 * the same day (Vercel retries, manual invocation), enqueuePortfolioDigest
 * dedupes by (user_id, quarter_key) so the user only receives one
 * digest per quarter.
 *
 * Strategy:
 *   1. Compute the PRIOR quarter (since the cron fires on day 1 of
 *      the new quarter, "this quarter" from the user's perspective
 *      is the one that just ended).
 *   2. Page through public.profiles where:
 *        • email_preferences.portfolio_digest !== false
 *        • created_at <= start of prior quarter (i.e. account is
 *          at least 1 quarter old — we don't pester brand-new users)
 *   3. For each user: SELECT from audit_log the rows in
 *      [prior_quarter_start, current_quarter_start). Compute stats.
 *   4. Apply eligibility (≥ 2 assessments finalized). Enqueue.
 *
 * The cron does NOT send the email — cron-email-queue-processor
 * drains email_queue on its 15-minute tick, like every other email.
 */

import { createClient } from '@supabase/supabase-js'
import {
  computeDigestStats,
  currentQuarter,
  priorQuarter,
  isDigestEligible,
  type AuditRow,
} from '../lib/portfolio/digest-stats'
import { enqueuePortfolioDigest } from '../lib/email-triggers'

const BATCH_SIZE = 500
// Cap how many audit_log rows we pull per user — a power user with
// hundreds of events per quarter still fits comfortably under 1k.
const AUDIT_ROWS_PER_USER = 5000

export interface CronDigestResult {
  ok: boolean
  scanned: number
  enqueued: number
  skipped_ineligible: number
  skipped_opt_out: number
  skipped_existing: number
  errors: string[]
}

interface ProfileRow {
  id: string
  created_at: string
  email_preferences: { portfolio_digest?: boolean } | null
}

export async function runPortfolioDigestEnqueue(
  now: Date = new Date(),
): Promise<CronDigestResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return {
      ok: false, scanned: 0, enqueued: 0,
      skipped_ineligible: 0, skipped_opt_out: 0, skipped_existing: 0,
      errors: ['SUPABASE_URL / SERVICE_ROLE_KEY not set'],
    }
  }
  const supabase = createClient(url, key)
  const errors: string[] = []

  // The cron fires on the FIRST day of the new quarter. From the
  // user's perspective, "this quarter" in the digest means the
  // quarter that just ended — i.e. priorQuarter(currentQuarter(now)).
  const newQuarter = currentQuarter(now)
  const justEnded = priorQuarter(newQuarter)
  const yearBefore = priorQuarter(justEnded)
  const quarterKey = `${justEnded.start.getUTCFullYear()}-${justEnded.label.split(' ')[0]}`

  let scanned = 0
  let enqueued = 0
  let skippedIneligible = 0
  let skippedOptOut = 0
  let skippedExisting = 0

  let from = 0
  for (;;) {
    const to = from + BATCH_SIZE - 1
    const { data, error } = await supabase
      .from('profiles')
      .select('id, created_at, email_preferences')
      .lte('created_at', justEnded.start.toISOString())
      .range(from, to)
    if (error) {
      errors.push(`profiles select failed: ${error.message}`)
      return {
        ok: false, scanned, enqueued,
        skipped_ineligible: skippedIneligible,
        skipped_opt_out: skippedOptOut,
        skipped_existing: skippedExisting,
        errors,
      }
    }
    const rows = (data || []) as ProfileRow[]
    if (rows.length === 0) break

    for (const profile of rows) {
      scanned++
      const optOut = profile.email_preferences?.portfolio_digest === false
      if (optOut) {
        skippedOptOut++
        continue
      }

      // Pull this user's audit_log rows across BOTH quarters.
      const { data: auditRows, error: auditErr } = await supabase
        .from('audit_log')
        .select('action, created_at, target_id, details')
        .eq('actor_id', profile.id)
        .gte('created_at', yearBefore.start.toISOString())
        .lt('created_at', justEnded.end.toISOString())
        .order('created_at', { ascending: false })
        .limit(AUDIT_ROWS_PER_USER)
      if (auditErr) {
        errors.push(`audit_log select for ${profile.id} failed: ${auditErr.message}`)
        continue
      }
      const stats = computeDigestStats({
        rows: (auditRows || []) as AuditRow[],
        quarter: justEnded,
        prior: yearBefore,
        account_created_at: profile.created_at,
        now,
      })

      if (!isDigestEligible(stats)) {
        skippedIneligible++
        continue
      }

      try {
        const r = await enqueuePortfolioDigest(supabase as never, {
          user_id: profile.id,
          quarter_key: quarterKey,
          stats: stats as unknown as Record<string, unknown>,
        })
        if (r.skipped) skippedExisting++
        else enqueued += r.enqueued
      } catch (err) {
        errors.push(`enqueue for ${profile.id} failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (rows.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return {
    ok: true,
    scanned, enqueued,
    skipped_ineligible: skippedIneligible,
    skipped_opt_out: skippedOptOut,
    skipped_existing: skippedExisting,
    errors,
  }
}

if (process.argv[1] && process.argv[1].endsWith('cron-portfolio-digest.ts')) {
  runPortfolioDigestEnqueue()
    .then(r => {
      console.log('[portfolio-digest]', JSON.stringify(r))
      process.exit(r.ok ? 0 : 1)
    })
    .catch(err => {
      console.error('unhandled:', err)
      process.exit(1)
    })
}
