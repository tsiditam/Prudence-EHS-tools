/**
 * Vercel Serverless Function — /api/peer-review-respond
 *
 * Reviewer-side endpoint for the peer review flow (habit-loop PR 4).
 * The reviewer is NOT necessarily an AtmosFlow user; this endpoint
 * is publicly accessible, gated by a magic-link token only.
 *
 *   GET ?token=<uuid>
 *     Returns landing-view metadata so the public page can show
 *     context. Never exposes assessor_id, reviewer_email, or token.
 *     → 200 { view: PeerReviewLandingView }
 *       | 404 { error: 'invalid_token' }
 *       | 410 { error: 'expired' } | 409 { error: 'already_reviewed' }
 *
 *   POST { token, status, notes? }
 *     Records the reviewer's response. status ∈ {approved,
 *     changes_requested, commented}. Notes optional (capped 4000).
 *     Once accepted, sends the completion email to the assessor
 *     SYNCHRONOUSLY and emits a peer_review_completed event.
 *     → 200 { ok: true, status }
 *       | 400 { error: 'bad_status'|'bad_token' }
 *       | 404 { error: 'invalid_token' }
 *       | 410 { error: 'expired' } | 409 { error: 'already_reviewed' }
 *
 * Token validation runs under the service role so RLS doesn't
 * block reviewer access. Defensive: never trust the body to set
 * any field other than status + notes.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTemplate, type UserContext } from '../lib/email-sequences'

const APP_URL = 'atmosflow.net'
const FROM = process.env.RESEND_FROM_ADDRESS || 'support@prudenceehs.com'
const RESEND_API = 'https://api.resend.com/emails'

const MAX_NOTES_LEN = 4000
const ALLOWED_RESPONSE_STATUSES = new Set(['approved', 'changes_requested', 'commented'])

let _supabaseClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabaseClient) return _supabaseClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env not configured')
  _supabaseClient = createClient(url, key)
  return _supabaseClient
}

let _fetchFn: typeof fetch = fetch

interface PostBody {
  token?: unknown
  status?: unknown
  notes?: unknown
}
type Req = import('http').IncomingMessage & {
  method?: string
  url?: string
  body?: PostBody | string
  headers: Record<string, string | string[] | undefined>
}
type Res = import('http').ServerResponse & {
  status: (n: number) => Res
  json: (body: unknown) => void
}

function parseTokenFromUrl(url: string | undefined): string | null {
  if (!url) return null
  const q = url.indexOf('?')
  if (q < 0) return null
  const params = new URLSearchParams(url.slice(q + 1))
  const t = params.get('token')
  return t || null
}

async function handler(req: Req, res: Res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  res.status(405).json({ error: 'method_not_allowed' })
}

interface PeerReviewRow {
  id: string
  assessor_id: string
  facility_name: string | null
  reviewer_name: string
  reviewer_email: string
  message: string | null
  status: string
  expires_at: string
  reviewed_at: string | null
  created_at: string
}

async function handleGet(req: Req, res: Res) {
  const token = parseTokenFromUrl(req.url)
  if (!token) { res.status(400).json({ error: 'token_required' }); return }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('peer_reviews')
    .select('id, assessor_id, facility_name, reviewer_name, reviewer_email, message, status, expires_at, reviewed_at, created_at')
    .eq('token', token)
    .maybeSingle()
  if (error) {
    res.status(500).json({ error: 'query_failed' })
    return
  }
  if (!data) { res.status(404).json({ error: 'invalid_token' }); return }
  const row = data as PeerReviewRow
  if (new Date(row.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'expired' })
    return
  }
  if (row.reviewed_at || row.status === 'canceled') {
    res.status(409).json({ error: 'already_reviewed', status: row.status })
    return
  }
  // Look up the assessor's display name.
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', row.assessor_id)
    .maybeSingle()
  const assessorName = (profile as { name?: string } | null)?.name || 'AtmosFlow user'
  res.status(200).json({
    view: {
      assessor_name: assessorName,
      facility_name: row.facility_name,
      requested_at: row.created_at,
      expires_at: row.expires_at,
      message: row.message,
      status: row.status,
    },
  })
}

async function handlePost(req: Req, res: Res) {
  let body: PostBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as PostBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as PostBody
  }
  const token = typeof body.token === 'string' ? body.token : ''
  const status = typeof body.status === 'string' ? body.status : ''
  const rawNotes = typeof body.notes === 'string' ? body.notes : ''
  if (!token) { res.status(400).json({ error: 'token_required' }); return }
  if (!ALLOWED_RESPONSE_STATUSES.has(status)) {
    res.status(400).json({ error: 'bad_status' })
    return
  }
  const notes = rawNotes.trim().slice(0, MAX_NOTES_LEN) || null

  const supabase = getSupabase()
  const { data: existing, error: selErr } = await supabase
    .from('peer_reviews')
    .select('id, assessor_id, facility_name, reviewer_name, reviewer_email, message, status, expires_at, reviewed_at, created_at')
    .eq('token', token)
    .maybeSingle()
  if (selErr) { res.status(500).json({ error: 'query_failed' }); return }
  if (!existing) { res.status(404).json({ error: 'invalid_token' }); return }
  const row = existing as PeerReviewRow
  if (new Date(row.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'expired' })
    return
  }
  if (row.reviewed_at || row.status === 'canceled') {
    res.status(409).json({ error: 'already_reviewed' })
    return
  }

  // Update — only the columns the reviewer is allowed to set. RLS is
  // bypassed by the service role; we enforce the boundary in code.
  const now = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('peer_reviews')
    .update({ status, reviewer_notes: notes, reviewed_at: now })
    .eq('token', token)
  if (updErr) { res.status(500).json({ error: 'update_failed' }); return }

  // ── Notify the assessor synchronously via Resend ────────────────
  const { data: assessorProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', row.assessor_id)
    .maybeSingle()
  let assessorEmail: string | null = null
  try {
    const { data: { user: assessor } } = await supabase.auth.admin.getUserById(row.assessor_id)
    assessorEmail = assessor?.email || null
  } catch {
    // best-effort
  }

  if (assessorEmail) {
    const tpl = getTemplate('peer_review.completed')
    if (tpl) {
      const ctx: UserContext = {
        user_id: row.assessor_id,
        email: assessorEmail,
        first_name: (assessorProfile as { name?: string } | null)?.name?.split(/\s+/)[0] || null,
        plan: 'free',
      }
      const rendered = tpl.render(ctx, {
        reviewer_name: row.reviewer_name,
        facility_name: row.facility_name,
        status,
        notes,
      })
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        try {
          await _fetchFn(RESEND_API, {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: FROM,
              to: [assessorEmail],
              subject: rendered.subject,
              text: rendered.text,
            }),
          })
        } catch (err) {
          console.error('[peer-review-respond] resend threw:', err instanceof Error ? err.message : err)
        }
      }
    }
  }

  // Emit peer_review_completed into audit_log for analytics.
  try {
    await supabase.from('audit_log').insert({
      action: 'peer_review_completed',
      actor_id: row.assessor_id,
      actor_email: assessorEmail,
      target_type: 'peer_review',
      target_id: row.id,
      details: { status, has_notes: !!notes },
    })
  } catch {
    // best-effort
  }

  void APP_URL  // keep import-side-effect parity with /api/peer-review
  res.status(200).json({ ok: true, status })
}

export default handler

export const __test = {
  ALLOWED_RESPONSE_STATUSES,
  MAX_NOTES_LEN,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  setFetch(fn: typeof fetch) { _fetchFn = fn },
  reset() { _supabaseClient = null; _fetchFn = fetch },
}
