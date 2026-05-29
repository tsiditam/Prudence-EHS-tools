/**
 * scripts/cron-calibration-expiry.ts
 *
 * Daily scan of public.profiles. For each profile that has at least
 * one instrument with a calibration date AND has not opted out:
 *   • Evaluate getCalibrationBannerState for IAQ and PID meters.
 *   • When kind ∈ {expiring, expired}, enqueue a corresponding
 *     calibration.{kind} email via enqueueCalibrationReminder.
 *
 * Idempotency lives in the trigger function (cancel + skip-if-covered
 * by cal_date) — this script can re-run as many times per day as the
 * cron schedule and never duplicate-send.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Reads email_preferences.calibration_expiry per-profile; defaults
 * to TRUE on existing rows via migration 019.
 */

import { createClient } from '@supabase/supabase-js'
import {
  getCalibrationBannerState,
  type CalibrationBannerState,
} from '../lib/calibration/banner-state'
import {
  enqueueCalibrationReminder,
  type CalibrationKind,
} from '../lib/email-triggers'

const BATCH_SIZE = 500

export interface CronCalibrationResult {
  ok: boolean
  scanned: number
  enqueued: number
  canceled: number
  skipped_existing: number
  skipped_opt_out: number
  errors: string[]
}

interface ProfileRow {
  id: string
  iaq_meter: string | null
  iaq_cal_date: string | null
  pid_meter: string | null
  pid_cal_date: string | null
  email_preferences: { calibration_expiry?: boolean } | null
}

const INSTRUMENTS: ReadonlyArray<{
  key: 'iaq' | 'pid'
  meterColumn: keyof ProfileRow
  calDateColumn: keyof ProfileRow
}> = [
  { key: 'iaq', meterColumn: 'iaq_meter', calDateColumn: 'iaq_cal_date' },
  { key: 'pid', meterColumn: 'pid_meter', calDateColumn: 'pid_cal_date' },
]

export async function runCalibrationExpiryScan(
  now: Date = new Date(),
): Promise<CronCalibrationResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return {
      ok: false, scanned: 0, enqueued: 0, canceled: 0,
      skipped_existing: 0, skipped_opt_out: 0,
      errors: ['SUPABASE_URL / SERVICE_ROLE_KEY not set'],
    }
  }
  const supabase = createClient(url, key)
  const errors: string[] = []
  let enqueued = 0
  let canceled = 0
  let skipped_existing = 0
  let skipped_opt_out = 0

  // Page through profiles that have at least one cal_date set.
  // The partial index profiles_iaq_cal_date_idx (migration 020)
  // keeps this query cheap as the user base grows.
  let scanned = 0
  let from = 0
  // We intentionally don't filter the SELECT to "expiring soon" rows —
  // the date arithmetic happens in JS using getCalibrationBannerState
  // so the cron and the dashboard banner read the same logic.
  // For very large tables, swap to a server-side filter on
  // iaq_cal_date <= NOW() - (CAL_VALIDITY_DAYS - CAL_WARN_DAYS) days.
  for (;;) {
    const to = from + BATCH_SIZE - 1
    const { data, error } = await supabase
      .from('profiles')
      .select('id, iaq_meter, iaq_cal_date, pid_meter, pid_cal_date, email_preferences')
      .range(from, to)
    if (error) {
      errors.push(`profiles select failed: ${error.message}`)
      return { ok: false, scanned, enqueued, canceled, skipped_existing, skipped_opt_out, errors }
    }
    const rows = (data || []) as ProfileRow[]
    if (rows.length === 0) break

    for (const profile of rows) {
      scanned++
      const optOut = profile.email_preferences?.calibration_expiry === false
      if (optOut) {
        skipped_opt_out++
        continue
      }

      for (const inst of INSTRUMENTS) {
        const meter = profile[inst.meterColumn] as string | null
        const calDate = profile[inst.calDateColumn] as string | null
        if (!meter || !calDate) continue
        let state: CalibrationBannerState | null
        try {
          state = getCalibrationBannerState(meter, calDate, now)
        } catch (err) {
          errors.push(`profile=${profile.id} ${inst.key}: banner-state threw: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
        if (!state) continue
        if (state.kind !== 'expiring' && state.kind !== 'expired') continue
        const kind: CalibrationKind = state.kind
        try {
          const r = await enqueueCalibrationReminder(supabase as never, {
            user_id: profile.id,
            instrument_key: inst.key,
            meter,
            cal_date: calDate,
            kind,
            days_to_expiry: state.daysToExpiry ?? 0,
          })
          enqueued += r.enqueued
          canceled += r.canceled
          if (r.skipped) skipped_existing++
        } catch (err) {
          errors.push(`profile=${profile.id} ${inst.key} kind=${kind}: enqueue failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    if (rows.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  return {
    ok: true,
    scanned, enqueued, canceled, skipped_existing, skipped_opt_out,
    errors,
  }
}

if (process.argv[1] && process.argv[1].endsWith('cron-calibration-expiry.ts')) {
  runCalibrationExpiryScan()
    .then(r => {
      console.log('[calibration-expiry]', JSON.stringify(r))
      process.exit(r.ok ? 0 : 1)
    })
    .catch(err => {
      console.error('unhandled:', err)
      process.exit(1)
    })
}
