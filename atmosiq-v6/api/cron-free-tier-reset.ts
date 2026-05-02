/**
 * Vercel Serverless Function — /api/cron-free-tier-reset
 *
 * Daily Vercel cron handler. Bumps free-tier accounts back to 1 credit.
 * Idempotent at the row level (only rows with credits_remaining < 1 are
 * touched). Authenticated via CRON_SECRET.
 *
 * Wired in vercel.json under "crons".
 */

import { runFreeTierReset } from '../scripts/cron-free-tier-reset'

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

  const result = await runFreeTierReset()
  if (!result.ok) return res.status(500).json(result as unknown as Record<string, unknown>)
  return res.status(200).json(result as unknown as Record<string, unknown>)
}
