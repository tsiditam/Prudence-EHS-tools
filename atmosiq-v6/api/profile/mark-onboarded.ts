/**
 * Vercel Serverless Function — /api/profile/mark-onboarded
 *
 * Called by the SPA after the user finalizes their first assessment OR
 * dismisses the onboarding tour. Sets either:
 *   { has_completed_first_assessment: true } (on assessment completion)
 *   { onboarding_dismissed_at: NOW() }       (on dismiss)
 *
 * Both fields suppress re-display of the FirstAssessmentTour component.
 *
 * Body: { action: 'completed' | 'dismissed' }
 * Response: 200 { ok: true } | 401 | 405
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface VercelLikeReq {
  method?: string
  headers?: Record<string, string | string[] | undefined>
  body?: { action?: string } | undefined
}
interface VercelLikeRes {
  status: (c: number) => VercelLikeRes
  json: (b: Record<string, unknown>) => VercelLikeRes
  end: () => VercelLikeRes
}

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

export async function handler(req: VercelLikeReq, res: VercelLikeRes) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = getSupabase()
  if (!supabase) return res.status(500).json({ error: 'Server not configured' })

  const auth = req.headers?.authorization
  const authHeader = Array.isArray(auth) ? auth[0] : auth
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' })

  const jwt = String(authHeader).replace(/^Bearer\s+/, '')
  const { data: userData, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !userData.user) return res.status(401).json({ error: 'Invalid token' })

  const action = req.body?.action ?? 'completed'
  let patch: Record<string, unknown>
  if (action === 'completed') {
    patch = { has_completed_first_assessment: true }
  } else if (action === 'dismissed') {
    patch = { onboarding_dismissed_at: new Date().toISOString() }
  } else {
    return res.status(400).json({ error: `unknown action: ${action}` })
  }

  const { error: updateErr } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userData.user.id)

  if (updateErr) return res.status(500).json({ error: 'Update failed', detail: updateErr.message })

  return res.status(200).json({ ok: true, action })
}

export default handler

export const __test = {
  setSupabase(mock: unknown) { _supabase = mock as SupabaseClient },
  resetSupabase() { _supabase = null },
}
