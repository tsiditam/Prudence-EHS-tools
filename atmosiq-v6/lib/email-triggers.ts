/**
 * Email-trigger orchestration: enqueue and cancel rows in email_queue
 * in response to product events (signup, first assessment completed,
 * subscription canceled).
 *
 * Triggers are pure functions over a SupabaseLike interface so they
 * test without hitting a real Supabase. The production caller is the
 * /api/audit (or other event-emitter) endpoint, which calls the
 * trigger after recording the event.
 */

import { templatesForPlan, getTemplate } from './email-sequences'

export interface SupabaseLike {
  from: (table: string) => any
}

export interface SignupEvent {
  user_id: string
  plan: 'free' | 'solo' | 'pro' | 'practice'
  signup_at: Date
}

export interface AssessmentCompletedEvent {
  user_id: string
  plan: 'free' | 'solo' | 'pro' | 'practice'
  completed_at: Date
}

interface QueueRowInput {
  user_id: string
  template_id: string
  scheduled_for: string
}

export async function enqueueSignupSequence(
  supabase: SupabaseLike,
  event: SignupEvent,
): Promise<{ enqueued: number; template_ids: string[] }> {
  const templates = templatesForPlan(event.plan)
  const rows: QueueRowInput[] = templates.map(t => ({
    user_id: event.user_id,
    template_id: t.id,
    scheduled_for: new Date(event.signup_at.getTime() + t.delayMs).toISOString(),
  }))
  if (rows.length === 0) return { enqueued: 0, template_ids: [] }

  const { error } = await supabase.from('email_queue').insert(rows)
  if (error) throw new Error(`enqueueSignupSequence insert failed: ${error.message}`)

  return { enqueued: rows.length, template_ids: rows.map(r => r.template_id) }
}

/**
 * Called when a user finalizes their first assessment.
 *   • Cancels any unsent template with cancelOnMilestone='first_assessment_completed'
 *     for this user.
 *   • For free tier: enqueues the success/upgrade email immediately.
 */
export async function onAssessmentCompleted(
  supabase: SupabaseLike,
  event: AssessmentCompletedEvent,
): Promise<{ canceled: number; enqueued: string[] }> {
  // 1) Cancel queued templates that opt out on this milestone.
  const milestone = 'first_assessment_completed'
  const cancelable = ['free.sample', 'free.activation']
    .map(id => getTemplate(id))
    .filter((t): t is NonNullable<ReturnType<typeof getTemplate>> => !!t && t.cancelOnMilestone === milestone)
    .map(t => t.id)

  let canceled = 0
  if (cancelable.length > 0) {
    const { error: cancelErr, data } = await supabase
      .from('email_queue')
      .update({ canceled_at: new Date().toISOString(), cancel_reason: milestone })
      .eq('user_id', event.user_id)
      .in('template_id', cancelable)
      .is('sent_at', null)
      .is('canceled_at', null)
      .select('id')
    if (cancelErr) throw new Error(`onAssessmentCompleted cancel failed: ${cancelErr.message}`)
    canceled = (data && data.length) || 0
  }

  // 2) For free tier, enqueue the success template immediately.
  const enqueued: string[] = []
  if (event.plan === 'free') {
    const successTpl = getTemplate('free.success')
    if (successTpl) {
      const { error: insErr } = await supabase.from('email_queue').insert({
        user_id: event.user_id,
        template_id: successTpl.id,
        scheduled_for: event.completed_at.toISOString(),
      })
      if (insErr) throw new Error(`onAssessmentCompleted enqueue success failed: ${insErr.message}`)
      enqueued.push(successTpl.id)
    }
  }

  return { canceled, enqueued }
}

/**
 * TODO: enqueueWeReSorrySequence on subscription_canceled — out of scope
 * for Group C. Wire when the cancellation-recovery copy is approved.
 */
export async function onSubscriptionCanceled(
  _supabase: SupabaseLike,
  _event: { user_id: string; plan: string; canceled_at: Date },
): Promise<{ enqueued: number }> {
  // Intentional no-op. See TODO above.
  return { enqueued: 0 }
}

// ─── Calibration expiry reminder (habit-loop PR 2) ─────────────────

export type CalibrationKind = 'expiring' | 'expired'

export interface CalibrationReminderEvent {
  user_id: string
  /** Stable identifier for the instrument slot — 'iaq' | 'pid'. */
  instrument_key: string
  /** Human-readable meter label (e.g. "Graywolf IQ-610"). */
  meter: string
  /** Cal date the reminder is computed against. Identifies the cycle. */
  cal_date: string
  /** State.kind from getCalibrationBannerState. */
  kind: CalibrationKind
  /** Days to expiry at the time the reminder is computed (negative when expired). */
  days_to_expiry: number
}

/**
 * Schedule a calibration-expiring or calibration-expired email.
 *
 * Idempotency model:
 *   • Skips entirely when a row already exists for (user_id,
 *     template_id, payload.instrument_key, payload.cal_date) — sent
 *     OR queued. So the daily cron firing again the next day is a
 *     no-op once the reminder has gone out for THIS cal cycle.
 *   • When a row exists for the same (user_id, instrument_key) but
 *     with a STALE cal_date (the user re-calibrated since the prior
 *     reminder), the stale unsent row is cancelled. The fresh cycle
 *     can then enqueue its own first reminder cleanly.
 *
 * Returns { canceled, enqueued } so the caller can log progress.
 * `enqueued: 0` is the no-op-because-already-sent path — not an error.
 */
export async function enqueueCalibrationReminder(
  supabase: SupabaseLike,
  event: CalibrationReminderEvent,
): Promise<{ canceled: number; enqueued: number; skipped: boolean }> {
  if (!event.user_id || !event.instrument_key || !event.meter || !event.cal_date) {
    throw new Error('enqueueCalibrationReminder: missing required fields')
  }
  if (event.kind !== 'expiring' && event.kind !== 'expired') {
    throw new Error(`enqueueCalibrationReminder: invalid kind ${event.kind}`)
  }
  const tpl = getTemplate('calibration.' + event.kind)
  if (!tpl) {
    throw new Error(`enqueueCalibrationReminder: template calibration.${event.kind} not registered`)
  }

  // Pull all queue rows of this template for this user. Filter
  // payload-side so the SQL stays simple (no JSONB predicates).
  const { data: priorRows, error: selErr } = await supabase
    .from('email_queue')
    .select('id, sent_at, canceled_at, payload')
    .eq('user_id', event.user_id)
    .eq('template_id', tpl.id)
  if (selErr) {
    throw new Error(`enqueueCalibrationReminder select failed: ${selErr.message}`)
  }

  type Row = { id: number; sent_at: string | null; canceled_at: string | null; payload?: { instrument_key?: string; cal_date?: string } }
  const rows = (priorRows || []) as Row[]
  // Sent or queued row matching this exact cal_date → already covered.
  const alreadyCovered = rows.some(r =>
    r.payload?.instrument_key === event.instrument_key &&
    r.payload?.cal_date === event.cal_date &&
    r.canceled_at == null,
  )
  if (alreadyCovered) {
    return { canceled: 0, enqueued: 0, skipped: true }
  }

  // Stale unsent rows for the same instrument → cancel.
  const staleIds: number[] = []
  for (const r of rows) {
    if (
      r.payload?.instrument_key === event.instrument_key &&
      r.payload?.cal_date !== event.cal_date &&
      r.sent_at == null &&
      r.canceled_at == null
    ) {
      staleIds.push(r.id)
    }
  }
  let canceled = 0
  if (staleIds.length > 0) {
    const { error: cancelErr } = await supabase
      .from('email_queue')
      .update({ canceled_at: new Date().toISOString(), cancel_reason: 'cal_date_advanced' })
      .in('id', staleIds)
    if (cancelErr) {
      throw new Error(`enqueueCalibrationReminder cancel failed: ${cancelErr.message}`)
    }
    canceled = staleIds.length
  }

  // Schedule immediately — the cron is the gating clock, not scheduled_for.
  const { error: insErr } = await supabase.from('email_queue').insert({
    user_id: event.user_id,
    template_id: tpl.id,
    scheduled_for: new Date().toISOString(),
    payload: {
      instrument_key: event.instrument_key,
      meter: event.meter,
      cal_date: event.cal_date,
      kind: event.kind,
      days_to_expiry: event.days_to_expiry,
    },
  })
  if (insErr) {
    throw new Error(`enqueueCalibrationReminder insert failed: ${insErr.message}`)
  }
  return { canceled, enqueued: 1, skipped: false }
}

// ─── Re-assessment reminder (habit-loop PR 1) ──────────────────────

export interface ReassessmentReminderEvent {
  user_id: string
  site_id: string
  site_name: string
  /** When the reminder email should fire (typically last_finalized_at + interval). */
  due_at: Date
}

/**
 * Schedule a `reassessment.reminder` email for a saved site.
 *
 * Idempotent across re-finalizations of the same site: any unsent
 * prior reminder row for `(user_id, site_id)` is cancelled, then a
 * single new row is inserted. Re-finalizing the same site moves the
 * reminder rather than stacking it.
 *
 * The payload (site_name, site_id, due_at) is read at render time by
 * the `reassessment.reminder` template — see email_queue.payload
 * (migration 018) + the render(ctx, payload) signature.
 */
export async function enqueueReassessmentReminder(
  supabase: SupabaseLike,
  event: ReassessmentReminderEvent,
): Promise<{ canceled: number; enqueued: number }> {
  if (!event.user_id || !event.site_id || !event.site_name) {
    throw new Error('enqueueReassessmentReminder: missing user_id / site_id / site_name')
  }
  const tpl = getTemplate('reassessment.reminder')
  if (!tpl) {
    throw new Error('enqueueReassessmentReminder: reassessment.reminder template not registered')
  }

  // 1) Cancel any prior unsent reminder for THIS site so we never
  //    stack two reminders. Filter on the site_id stored in payload
  //    so reminders for OTHER sites are untouched.
  const { data: priorRows, error: selErr } = await supabase
    .from('email_queue')
    .select('id, payload')
    .eq('user_id', event.user_id)
    .eq('template_id', tpl.id)
    .is('sent_at', null)
    .is('canceled_at', null)
  if (selErr) {
    throw new Error(`enqueueReassessmentReminder select failed: ${selErr.message}`)
  }
  let canceled = 0
  const matchingIds: Array<number | string> = []
  for (const row of (priorRows || []) as Array<{ id: number; payload?: { site_id?: string } }>) {
    if (row.payload && row.payload.site_id === event.site_id) {
      matchingIds.push(row.id)
    }
  }
  if (matchingIds.length > 0) {
    const { error: cancelErr } = await supabase
      .from('email_queue')
      .update({ canceled_at: new Date().toISOString(), cancel_reason: 'reassessment_reschedule' })
      .in('id', matchingIds)
    if (cancelErr) {
      throw new Error(`enqueueReassessmentReminder cancel failed: ${cancelErr.message}`)
    }
    canceled = matchingIds.length
  }

  // 2) Insert the new reminder row scheduled for the next due date.
  const { error: insErr } = await supabase.from('email_queue').insert({
    user_id: event.user_id,
    template_id: tpl.id,
    scheduled_for: event.due_at.toISOString(),
    payload: {
      site_id: event.site_id,
      site_name: event.site_name,
      due_at: event.due_at.toISOString(),
    },
  })
  if (insErr) {
    throw new Error(`enqueueReassessmentReminder insert failed: ${insErr.message}`)
  }

  return { canceled, enqueued: 1 }
}
