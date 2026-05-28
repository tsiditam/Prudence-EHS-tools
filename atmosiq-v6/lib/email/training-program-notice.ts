/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * One-shot 30-day notice email for the AI improvement program
 * (migration 015). Sent once per existing user when the policy
 * lands. Tracked via profiles.training_notice_sent_at so re-runs
 * don't re-spam.
 *
 * Triggered by a cron / admin script (not yet wired). The intent:
 *   1. SELECT id, email FROM profiles
 *      WHERE training_notice_sent_at IS NULL
 *        AND email_subscribed = true;
 *   2. For each row, push renderTrainingProgramNotice(...) into
 *      the existing email_queue table (migration 011).
 *   3. Stamp training_notice_sent_at = now() so a second run
 *      skips already-notified users.
 *
 * The renderer is exported separately from any send wiring so it
 * can be unit-tested without a Supabase or Resend dependency.
 */

export interface NoticeContext {
  email: string
  first_name?: string | null
  // ISO-8601 date the policy takes effect. Caller computes this
  // as "today + 30 days" or pulls from a published effective-date
  // constant so the email + the privacy page agree.
  effective_date: string
  // Absolute URL to the Settings → AI improvement program toggle.
  // Caller supplies (we don't hardcode the host here).
  settings_url: string
  // Absolute URL to the published privacy policy. Caller supplies.
  privacy_url: string
}

export interface RenderedNotice {
  subject: string
  body: string
  text: string
}

export function renderTrainingProgramNotice(ctx: NoticeContext): RenderedNotice {
  const name = ctx.first_name?.trim() || 'there'
  const subject = 'Heads up: AtmosFlow privacy policy update (30 days)'
  const body =
`Hi ${name},

We're updating our privacy policy to add an AI improvement program.

What changes
We collect anonymized excerpts of your AtmosFlow AI (Jasper) conversations to improve the assistant's accuracy on indoor air quality screening. Personal identifiers (name, email, firm, phone, address) are scrubbed before storage. Facility names are NOT scrubbed — they're part of the training context.

What is collected
- Question + answer pairs
- Assessment context at the time of the question (facility, zone, readings)
- Per-turn telemetry (model, response time, token counts)
- Thumbs-up / thumbs-down feedback you provide

Default + opt-out
The program is on by default. You can turn it off any time at:
${ctx.settings_url}

Turning it off stops future use of new conversations. It does not retroactively remove past contributions from completed training runs.

Effective date
${ctx.effective_date}

Read the full policy
${ctx.privacy_url}

Questions? Reply to this email.

— The AtmosFlow team
Prudence Safety & Environmental Consulting, LLC
`
  return { subject, body, text: body }
}
