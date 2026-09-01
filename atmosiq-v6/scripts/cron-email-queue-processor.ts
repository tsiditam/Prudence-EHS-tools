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
import { getTemplate, type UserContext } from '../lib/email-sequences.js'

const FROM = process.env.RESEND_FROM_ADDRESS || 'support@prudenceehs.com'
const RESEND_API = 'https://api.resend.com/emails'
// Drain more per 15-minute tick than the old 100 (400/hr) so a daily reminder
// burst across a large user base doesn't back up for hours. maxDuration is set
// to 120s for this function in vercel.json, comfortably covering 200 throttled
// sends.
const BATCH_SIZE = 200
// Proactively stay under Resend's per-second send limit (~10/s on paid tiers)
// rather than bursting into a 429. ~9 sends/sec.
const DEFAULT_SEND_INTERVAL_MS = 110

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((res) => setTimeout(res, ms)) : Promise.resolve())

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
  /** Per-row data for event-scheduled templates. Migration 018. */
  payload?: Record<string, unknown> | null
}

interface ProfileRow {
  id: string
  name?: string | null
  plan?: string
}

export async function runEmailQueueProcessor(
  now: Date = new Date(),
  opts: { sendIntervalMs?: number; batchSize?: number } = {},
): Promise<ProcessorResult> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!url || !key) return { ok: false, scanned: 0, sent: 0, skipped: 0, errors: ['SUPABASE_URL / SERVICE_ROLE_KEY not set'] }

  const supabase = createClient(url, key)
  const errors: string[] = []
  const batchSize = opts.batchSize ?? BATCH_SIZE
  const sendIntervalMs = opts.sendIntervalMs ?? DEFAULT_SEND_INTERVAL_MS

  // Fetch up to batchSize due rows.
  const { data: dueRows, error: selErr } = await supabase
    .from('email_queue')
    .select('id, user_id, template_id, payload')
    .lte('scheduled_for', now.toISOString())
    .is('sent_at', null)
    .is('canceled_at', null)
    .order('scheduled_for', { ascending: true })
    .limit(batchSize)

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
  let realSends = 0

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
    // Migration 018: per-row payload threaded into render() for
    // event-scheduled templates (e.g. reassessment.reminder).
    // Pre-migration rows have no payload column; default to {} so
    // existing templates keep working unchanged.
    const payload = (row.payload && typeof row.payload === 'object')
      ? row.payload as Record<string, unknown>
      : {}
    const rendered = tpl.render(ctx, payload)

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

    // Throttle between real sends to stay under Resend's per-second cap.
    if (realSends > 0) await sleep(sendIntervalMs)
    realSends++

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
      // Rate limited: stop the batch rather than hammering. The remaining rows
      // still have sent_at IS NULL, so the next 15-minute tick drains them —
      // this is idempotent backoff, not a lost email.
      if (resp.status === 429) {
        const retryAfter = resp.headers?.get?.('retry-after')
        skipped++
        errors.push(`row=${row.id}: resend 429 (rate limited)${retryAfter ? `, retry-after=${retryAfter}s` : ''}; backing off — ${rows.length - realSends} row(s) deferred to next run`)
        break
      }
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
