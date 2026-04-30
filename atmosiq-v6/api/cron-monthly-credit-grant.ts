/**
 * Vercel Serverless Function — /api/cron-monthly-credit-grant
 *
 * Monthly Vercel cron handler. Grants per-tier credits to ACTIVE annual
 * subscribers. Idempotent at the user level via the credits_ledger
 * reference_id (`monthly-grant-YYYY-MM`).
 *
 * Wired in vercel.json under "crons".
 */

import { runMonthlyCreditGrant } from '../scripts/cron-monthly-credit-grant'

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

  const result = await runMonthlyCreditGrant()
  if (!result.ok) return res.status(500).json(result as unknown as Record<string, unknown>)
  return res.status(200).json(result as unknown as Record<string, unknown>)
}
