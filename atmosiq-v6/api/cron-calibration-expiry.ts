/**
 * Vercel Serverless Function — /api/cron-calibration-expiry
 *
 * Daily cron handler (habit-loop PR 2). Scans public.profiles for
 * instruments approaching or past calibration expiry and enqueues
 * calibration.expiring / calibration.expired emails into email_queue.
 * The standard cron-email-queue-processor drains them on its next
 * 15-minute tick.
 *
 * CRON_SECRET-gated. Idempotent — re-runs on the same day are no-ops
 * because the trigger function dedupes per (user, instrument, cal_date).
 */

import { runCalibrationExpiryScan } from '../scripts/cron-calibration-expiry'

interface VercelLikeReq {
  method?: string
  headers?: Record<string, string | string[] | undefined>
}
interface VercelLikeRes {
  status: (c: number) => VercelLikeRes
  json: (b: Record<string, unknown>) => VercelLikeRes
  end: () => VercelLikeRes
}

export default async function handler(req: VercelLikeReq, res: VercelLikeRes) {
  if (req.method && req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = req.headers?.authorization
    const header = Array.isArray(auth) ? auth[0] : auth
    if (header !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const result = await runCalibrationExpiryScan()
  if (!result.ok) return res.status(500).json(result as unknown as Record<string, unknown>)
  return res.status(200).json(result as unknown as Record<string, unknown>)
}
