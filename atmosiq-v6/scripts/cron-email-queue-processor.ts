/**
 * scripts/cron-email-queue-processor.ts
 *
 * Drains the email_queue table every 15 minutes. For each row where
 * scheduled_for <= NOW() AND sent_at IS NULL AND canceled_at IS NULL:
 *   1. Look up the user's email + first_name from profiles
 *   2. Render the template
 *   3. Send via Resend
 *   4. Mark sent_at and resend_message_id
 *
 * Idempotency: the SELECT filter on sent_at IS NULL means the same row
 * is never sent twice. The cron CAN run twice in the same window safely.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *               RESEND_FROM_ADDRESS (default support@prudenceehs.com)
 */

import { createClient } from '@supabase/supabase-js'
import { getTemplate, type UserContext } from '../lib/email-sequences'

const FROM = process.env.RESEND_FROM_ADDRESS || 'support@prudenceehs.com'
const RESEND_API = 'https://api.resend.com/emails'
const BATCH_SIZE = 100

export interface ProcessorResult {
  ok: boolean
  scanned: number
  sent: number
  skipped: number
  errors: string[]
}

interface QueueRow {
  id: number
  user_id: string
  template_id: string
}

interface ProfileRow {
  id: string
  name?: string | null
  plan?: string
}

export async function runEmailQueueProcessor(now: Date = new Date()): Promise<ProcessorResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!url || !key) return { ok: false, scanned: 0, sent: 0, skipped: 0, errors: ['SUPABASE_URL / SERVICE_ROLE_KEY not set'] }

  const supabase = createClient(url, key)
  const errors: string[] = []

  // Fetch up to BATCH_SIZE due rows.
  const { data: dueRows, error: selErr } = await supabase
    .from('email_queue')
    .select('id, user_id, template_id')
    .lte('scheduled_for', now.toISOString())
    .is('sent_at', null)
    .is('canceled_at', null)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE)

  if (selErr) return { ok: false, scanned: 0, sent: 0, skipped: 0, errors: [selErr.message] }
  if (!dueRows || dueRows.length === 0) {
    return { ok: true, scanned: 0, sent: 0, skipped: 0, errors: [] }
  }

  const rows = dueRows as QueueRow[]
  const userIds = Array.from(new Set(rows.map(r => r.user_id)))

  // Bulk-fetch profiles for the affected users + auth emails.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, plan')
    .in('id', userIds)
  const profilesById: Record<string, ProfileRow> = {}
  for (const p of (profiles || []) as ProfileRow[]) profilesById[p.id] = p

  // Auth emails come from auth.users via admin API.
  const emailsById: Record<string, string> = {}
  for (const id of userIds) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id)
      if (!error && data && data.user && data.user.email) {
        emailsById[id] = data.user.email
      }
    } catch {
      // Skip — email lookup failure is logged per row below.
    }
  }

  let sent = 0
  let skipped = 0

  for (const row of rows) {
    const tpl = getTemplate(row.template_id)
    const profile = profilesById[row.user_id]
    const email = emailsById[row.user_id]
    if (!tpl || !profile || !email) {
      skipped++
      errors.push(`row=${row.id}: missing template (${row.template_id}), profile, or auth email`)
      continue
    }

    const ctx: UserContext = {
      user_id: profile.id,
      email,
      first_name: profile.name?.split(/\s+/)[0] ?? null,
      plan: (profile.plan as UserContext['plan']) || 'free',
    }
    const rendered = tpl.render(ctx)

    if (!resendKey) {
      // Dry-run mode: mark as sent so the row drains but log a warning.
      await supabase.from('email_queue').update({
        sent_at: now.toISOString(),
        resend_message_id: 'dry-run-no-resend-key',
      }).eq('id', row.id)
      sent++
      errors.push(`row=${row.id}: RESEND_API_KEY not set; row marked sent (dry-run)`)
      continue
    }

    try {
      const resp = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: rendered.subject,
          text: rendered.text,
        }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        skipped++
        errors.push(`row=${row.id}: resend returned ${resp.status}: ${body.slice(0, 200)}`)
        continue
      }
      const data = await resp.json() as { id?: string }
      await supabase.from('email_queue').update({
        sent_at: now.toISOString(),
        resend_message_id: data.id ?? null,
      }).eq('id', row.id)
      sent++
    } catch (err) {
      skipped++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`row=${row.id}: send threw: ${msg}`)
    }
  }

  return { ok: true, scanned: rows.length, sent, skipped, errors }
}

if (process.argv[1] && process.argv[1].endsWith('cron-email-queue-processor.ts')) {
  runEmailQueueProcessor()
    .then(r => {
      console.log('[email-queue]', JSON.stringify(r))
      process.exit(r.ok ? 0 : 1)
    })
    .catch(err => {
      console.error('unhandled:', err)
      process.exit(1)
    })
}
