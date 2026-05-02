/**
 * Vercel Serverless Function — /api/cron-email-queue-processor
 *
 * 15-minute cron handler. Drains due rows in email_queue and sends via
 * Resend. CRON_SECRET-gated.
 */

import { runEmailQueueProcessor } from '../scripts/cron-email-queue-processor'

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

  const result = await runEmailQueueProcessor()
  if (!result.ok) return res.status(500).json(result as unknown as Record<string, unknown>)
  return res.status(200).json(result as unknown as Record<string, unknown>)
}
