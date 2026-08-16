/**
 * Shared CRON_SECRET gate for the scheduled endpoints.
 *
 * FAIL-CLOSED. The previous per-handler check was `if (secret) { ...compare }`
 * — which skipped the check entirely when CRON_SECRET was unset, leaving the
 * endpoint world-callable (with service-role DB access behind it). This helper
 * treats a missing secret as a misconfiguration (503), never an open door, and
 * uses a timing-safe comparison.
 *
 * `.ts` (not `.js`) so the `.ts` cron wrappers can import it without tripping
 * the api-graph `.js → .ts` import guardrail. The CommonJS `reset-credits.js`
 * inlines the same check rather than importing across that boundary.
 */
import { timingSafeEqual } from 'node:crypto'

interface ReqLike { headers?: Record<string, string | string[] | undefined> }
interface ResLike {
  status: (code: number) => ResLike
  json: (body: Record<string, unknown>) => ResLike
}

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // Length is compared first (leaks only the length, not content). timingSafeEqual
  // throws on unequal-length buffers, so this guard is required.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Enforce the shared cron secret. Returns true when the request may proceed;
 * when it returns false it has ALREADY written the response (503 if the secret
 * is unset, 401 if the bearer token doesn't match).
 */
export function requireCronSecret(req: ReqLike, res: ResLike): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' })
    return false
  }
  const auth = req.headers?.authorization
  const header = Array.isArray(auth) ? auth[0] : auth
  if (!header || !safeEqualStr(header, `Bearer ${secret}`)) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
