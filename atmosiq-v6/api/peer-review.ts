/**
 * Vercel Serverless Function — /api/peer-review
 *
 * Assessor-side endpoint for the peer review flow (habit-loop PR 4).
 * Three actions on one handler:
 *
 *   POST { action: 'send', report_id, facility_name, reviewer_name,
 *          reviewer_email, message?, docx_base64, file_name }
 *     Inserts a peer_reviews row, sends the request email to the
 *     reviewer (with the DOCX attached) via Resend SYNCHRONOUSLY,
 *     and emits a peer_review_requested event for analytics.
 *     → 200 { id, status, expires_at } | 400 / 401 / 413 / 500
 *
 *   POST { action: 'list' }
 *     → 200 { reviews: PeerReview[] } sorted by created_at desc.
 *
 *   POST { action: 'cancel', id }
 *     UPDATEs status='canceled'. Idempotent — already-reviewed rows
 *     are not flipped back.
 *     → 200 { ok: true }
 *
 * Auth: same Bearer-token pattern as /api/report-templates and
 * /api/sites. RLS on public.peer_reviews enforces ownership as a
 * second layer.
 *
 * Resend send is SYNCHRONOUS (not enqueued) because peer review
 * is a transactional action the user expects to fire immediately
 * when they tap "Send for review". The email_queue + cron path
 * would introduce a 15-minute delay that breaks user expectation.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTemplate, type UserContext } from '../lib/email-sequences.js'
import { canTransition, resolveLifecycle } from '../src/constants/reportLifecycle.js'

const APP_URL = process.env.RESEND_FROM_ADDRESS ? 'atmosflow.net' : 'atmosflow.net'
const FROM = process.env.RESEND_FROM_ADDRESS || 'support@prudenceehs.com'
const RESEND_API = 'https://api.resend.com/emails'

const MAX_MESSAGE_LEN = 2000
const MAX_NAME_LEN = 200
const MAX_EMAIL_LEN = 254
// Attachment cap. The DOCX now arrives via Storage (not the request body),
// so the ~4.5 MB Vercel body limit no longer applies. This cap keeps the
// outbound Resend email comfortably under its ~40 MB total-size limit once
// the attachment is base64-encoded (~+33%).
const MAX_DOCX_BYTES = 20 * 1024 * 1024
const ATTACHMENT_BUCKET = 'peer-review-attachments'

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
interface ActionBody {
  action?: unknown
  report_id?: unknown
  facility_name?: unknown
  reviewer_name?: unknown
  reviewer_email?: unknown
  message?: unknown
  docx_path?: unknown
  docx_base64?: unknown
  file_name?: unknown
  id?: unknown
}

type Res = import('http').ServerResponse & {
  status: (n: number) => Res
  json: (body: unknown) => void
}
type Req = import('http').IncomingMessage & {
  body?: ActionBody | string
  headers: Record<string, string | string[] | undefined>
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.slice(0, max)
}

function isValidEmail(s: string): boolean {
  // Lightweight gate — Resend's own validation is authoritative.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const authHeader = req.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    res.status(401).json({ error: 'not_authenticated' })
    return
  }
  let body: ActionBody
  if (typeof req.body === 'string') {
    try { body = JSON.parse(req.body) as ActionBody }
    catch { res.status(400).json({ error: 'bad_input' }); return }
  } else {
    body = (req.body || {}) as ActionBody
  }
  const action = typeof body.action === 'string' ? body.action : ''
  if (!['send', 'list', 'cancel'].includes(action)) {
    res.status(400).json({ error: 'bad_action' })
    return
  }
  const supabase = getSupabase()
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    res.status(401).json({ error: 'invalid_token' })
    return
  }
  if (action === 'list')   return handleList(supabase, user.id, res)
  if (action === 'cancel') return handleCancel(supabase, user.id, body, res)
  if (action === 'send')   return handleSend(supabase, user, body, res)
}

async function handleList(
  supabase: SupabaseClient,
  userId: string,
  res: Res,
) {
  const { data, error } = await supabase
    .from('peer_reviews')
    // Never expose `token` in the list response — it's a magic-link
    // secret that only belongs in the outbound email.
    .select('id, assessor_id, report_id, facility_name, reviewer_name, reviewer_email, message, status, reviewer_notes, expires_at, reviewed_at, created_at, updated_at')
    .eq('assessor_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    res.status(500).json({ error: 'query_failed', message: error.message })
    return
  }
  res.status(200).json({ reviews: data || [] })
}

async function handleCancel(
  supabase: SupabaseClient,
  userId: string,
  body: ActionBody,
  res: Res,
) {
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) { res.status(400).json({ error: 'id_required' }); return }
  const { error } = await supabase
    .from('peer_reviews')
    .update({ status: 'canceled' })
    .eq('id', id)
    .eq('assessor_id', userId)
    .eq('status', 'pending')  // never flip already-reviewed rows
  if (error) {
    res.status(500).json({ error: 'update_failed', message: error.message })
    return
  }
  res.status(200).json({ ok: true })
}

async function handleSend(
  supabase: SupabaseClient,
  authUser: { id: string; email?: string },
  body: ActionBody,
  res: Res,
) {
  // ── Validate input ───────────────────────────────────────────────
  const reportId = clampStr(body.report_id, 128)
  const facilityName = clampStr(body.facility_name, MAX_NAME_LEN)
  const reviewerName = clampStr(body.reviewer_name, MAX_NAME_LEN)
  const reviewerEmail = clampStr(body.reviewer_email, MAX_EMAIL_LEN)
  const message = clampStr(body.message, MAX_MESSAGE_LEN)
  const fileName = clampStr(body.file_name, MAX_NAME_LEN) || 'AtmosFlow-Report.docx'
  const docxPath = clampStr(body.docx_path, 512)
  const base64Legacy = typeof body.docx_base64 === 'string' ? body.docx_base64 : ''

  if (!reportId)     { res.status(400).json({ error: 'report_id_required' }); return }
  if (!reviewerName) { res.status(400).json({ error: 'reviewer_name_required' }); return }
  if (!reviewerEmail) { res.status(400).json({ error: 'reviewer_email_required' }); return }
  if (!isValidEmail(reviewerEmail)) { res.status(400).json({ error: 'reviewer_email_invalid' }); return }
  if (!docxPath && !base64Legacy) { res.status(400).json({ error: 'docx_required' }); return }

  // Resolve the DOCX to a base64 attachment. Preferred path: the client
  // uploaded it to Storage and passed the path, so it never touched the
  // request body (which Vercel caps at ~4.5 MB). Legacy path: an older
  // client still inlined docx_base64 — accept it for backward compat.
  let stripped: string
  if (docxPath) {
    // The service-role client bypasses RLS, so enforce ownership here:
    // the path must live under the caller's own {user_id}/ prefix.
    if (!docxPath.startsWith(`${authUser.id}/`)) {
      res.status(403).json({ error: 'forbidden_path' })
      return
    }
    const { data: dl, error: dlErr } = await supabase.storage.from(ATTACHMENT_BUCKET).download(docxPath)
    if (dlErr || !dl) {
      console.error('[peer-review] storage download failed:', dlErr?.message)
      res.status(500).json({ error: 'storage_download_failed' })
      return
    }
    stripped = Buffer.from(await dl.arrayBuffer()).toString('base64')
  } else {
    // Strip a data: URL prefix if the (legacy) client included one.
    stripped = base64Legacy.replace(/^data:[^;]+;base64,/, '')
  }

  // base64 → bytes ≈ stripped.length * 3 / 4
  const approxBytes = Math.floor(stripped.length * 3 / 4)
  if (approxBytes > MAX_DOCX_BYTES) {
    if (docxPath) await supabase.storage.from(ATTACHMENT_BUCKET).remove([docxPath]).catch(() => {})
    res.status(413).json({ error: 'docx_too_large', max_bytes: MAX_DOCX_BYTES })
    return
  }

  // ── Fetch the assessor's name from profiles for the email body ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', authUser.id)
    .maybeSingle()
  const assessorName = (profile as { name?: string } | null)?.name?.trim() || authUser.email || 'an AtmosFlow user'

  // ── Insert the peer_reviews row ─────────────────────────────────
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  const { data: inserted, error: insertErr } = await supabase
    .from('peer_reviews')
    .insert({
      assessor_id: authUser.id,
      report_id: reportId,
      facility_name: facilityName,
      reviewer_name: reviewerName,
      reviewer_email: reviewerEmail,
      message: message,
      expires_at: expiresAt,
    })
    .select('id, token, expires_at, status')
    .single()
  if (insertErr || !inserted) {
    res.status(500).json({ error: 'insert_failed', message: insertErr?.message || 'no_row' })
    return
  }
  type Inserted = { id: string; token: string; expires_at: string; status: string }
  const row = inserted as Inserted

  // Sending for review IS the draft → in_review transition. Without this
  // the report would sit at Draft while a reviewer held it, and the
  // approval could never advance it: draft → reviewed is not a legal
  // single step, by design (a report cannot be reviewed before it has
  // been sent). Best-effort and non-fatal — the review request has been
  // created and the email is about to go out; failing the send because a
  // status column did not move would be the wrong trade.
  try {
    const { data: asmt } = await supabase
      .from('assessments')
      .select('report_profile, report_status, status')
      .eq('id', reportId)
      .maybeSingle()
    const current = resolveLifecycle((asmt || {}) as Record<string, unknown>)
    if (canTransition(current.profile, current.status, 'in_review').ok) {
      await supabase
        .from('assessments')
        .update({ report_status: 'in_review' })
        .eq('id', reportId)
    }
  } catch {
    // Non-fatal — see above.
  }

  // ── Build the email + send via Resend ───────────────────────────
  const respondUrl = `https://${APP_URL}/?review_token=${encodeURIComponent(row.token)}`
  const tpl = getTemplate('peer_review.request')
  if (!tpl) {
    res.status(500).json({ error: 'template_missing' })
    return
  }
  const reviewerCtx: UserContext = {
    user_id: row.id,
    email: reviewerEmail,
    first_name: reviewerName.split(/\s+/)[0] || reviewerName,
    plan: 'free',
  }
  const rendered = tpl.render(reviewerCtx, {
    assessor_name: assessorName,
    reviewer_name: reviewerName,
    facility_name: facilityName || null,
    message: message || null,
    respond_url: respondUrl,
  })

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const resp = await _fetchFn(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [reviewerEmail],
          reply_to: authUser.email || undefined,
          subject: rendered.subject,
          text: rendered.text,
          attachments: [
            { filename: fileName, content: stripped },
          ],
        }),
      })
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        console.error('[peer-review] resend non-2xx:', resp.status, errBody.slice(0, 200))
        // The row is still inserted; we just couldn't deliver. The
        // assessor can re-send via list view (separate cancel + send).
      }
    } catch (err) {
      console.error('[peer-review] resend threw:', err instanceof Error ? err.message : err)
    }
  }

  // The attachment has been delivered to Resend; the Storage copy is
  // transient, so remove it. Best-effort — a leftover object is harmless
  // (owner-only, and re-sending rebuilds + re-uploads a fresh one).
  if (docxPath) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([docxPath]).catch(() => {})
  }

  res.status(200).json({
    id: row.id,
    status: row.status,
    expires_at: row.expires_at,
  })
}

export default handler

// Test injection points — same convention as api/sites.ts.
export const __test = {
  MAX_DOCX_BYTES,
  MAX_MESSAGE_LEN,
  setSupabase(client: SupabaseClient | null) { _supabaseClient = client },
  setFetch(fn: typeof fetch) { _fetchFn = fn },
  reset() { _supabaseClient = null; _fetchFn = fetch },
}
