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
