/**
 * Vercel Serverless Function — /api/cron-portfolio-digest
 *
 * Quarterly cron handler (habit-loop PR 3). Runs on the 1st of
 * Jan / Apr / Jul / Oct at 13:00 UTC. Aggregates each eligible
 * user's prior-quarter audit_log activity into a digest stats
 * payload and enqueues a `portfolio.digest` email per user.
 *
 * CRON_SECRET-gated. Idempotent — re-runs on the same day are
 * no-ops because enqueuePortfolioDigest dedupes per (user, quarter).
 */

import { runPortfolioDigestEnqueue } from '../scripts/cron-portfolio-digest'

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

  const result = await runPortfolioDigestEnqueue()
  if (!result.ok) return res.status(500).json(result as unknown as Record<string, unknown>)
  return res.status(200).json(result as unknown as Record<string, unknown>)
}
