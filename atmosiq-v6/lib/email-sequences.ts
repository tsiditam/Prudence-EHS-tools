/**
 * Email sequence definitions for AtmosFlow's onboarding flows.
 *
 * Two sequences:
 *   • free-tier-onboarding (4 emails over 5 days)
 *   • paid-tier-onboarding (3 emails over 14 days)
 *
 * Each template renders to { subject, body } given a UserContext.
 * Templates are plain-text by design — higher inbox-reach, no
 * tracking pixels, no rendering surprises across mail clients.
 *
 * Triggering logic lives in lib/email-triggers.ts (consumes these).
 * Delivery happens via scripts/cron-email-queue-processor.ts which
 * drains the email_queue table every 15 minutes.
 */

export interface UserContext {
  user_id: string
  email: string
  first_name: string | null
  plan: 'free' | 'solo' | 'pro' | 'practice'
}

export interface RenderedEmail {
  subject: string
  body: string
  /** Plain-text alt — same content for now; HTML version is a follow-up. */
  text: string
}

/**
 * Optional per-row payload threaded through the email_queue table
 * (migration 018) and into render(). Used by event-scheduled
 * templates (e.g. `reassessment.reminder`) that need per-instance
 * data the static `UserContext` doesn't carry. Templates that don't
 * need a payload simply ignore the second arg.
 */
export type EmailPayload = Readonly<Record<string, unknown>>

export interface EmailTemplate {
  id: string
  /** When to enqueue, in ms after signup. 0 = immediate. */
  delayMs: number
  /** Cancel this template if the user reaches the named milestone first. */
  cancelOnMilestone?: 'first_assessment_completed'
  /** Only send to users still on the named plan when delivery time arrives. */
  requirePlanIs?: 'free' | 'paid'
  render: (ctx: UserContext, payload?: EmailPayload) => RenderedEmail
}

const SIGNATURE = '— Tsidi\nPrudence Safety & Environmental Consulting, LLC'
const APP_URL = 'atmosflow.net'
const SAMPLE_REPORT_URL = 'https://atmosflow.net/sample-report.pdf'
const PRICING_URL = 'https://atmosflow.net/#pricing'

function firstName(ctx: UserContext): string {
  return ctx.first_name?.trim() || 'there'
}

const ONE_DAY = 24 * 60 * 60 * 1000

// ─── Free-tier sequence (4 emails) ──────────────────────────────────
export const FREE_TIER_TEMPLATES: EmailTemplate[] = [
  {
    id: 'free.welcome',
    delayMs: 0,
    render: (ctx) => {
      const subject = 'Welcome to AtmosFlow — your first assessment in 10 minutes'
      const body = `Hi ${firstName(ctx)},

Welcome to AtmosFlow. You're set up with one free assessment
this month — enough to run a real walkthrough and see what the
output looks like.

Here's how to get started:

1. Open the app: ${APP_URL}
2. Tap "Start assessment"
3. Walk through the guided flow
4. Tap "Finalize" when done

You'll have a draft report ready to download as a Word document.

If you get stuck, reply to this email. I read every message.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'free.sample',
    delayMs: 2 * ONE_DAY,
    cancelOnMilestone: 'first_assessment_completed',
    requirePlanIs: 'free',
    render: (ctx) => {
      const subject = 'Here’s what an AtmosFlow report looks like'
      const body = `Hi ${firstName(ctx)},

Quick check-in. If you haven't run your first assessment yet,
here's a sample report so you can see what AtmosFlow produces:

${SAMPLE_REPORT_URL}

The sample is from a real assessment of a 3-floor commercial
building. Notice how every finding includes:

- The exact regulatory threshold it was measured against
- The instrument's stated accuracy
- A "limitations of this finding" sublist
- A recommended action with a standard reference

That's the CIH-defensibility layer. AI never invents findings
or sets thresholds.

Want to try it on a real building? Open the app:
${APP_URL}

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'free.activation',
    delayMs: 5 * ONE_DAY,
    cancelOnMilestone: 'first_assessment_completed',
    requirePlanIs: 'free',
    render: (ctx) => {
      const subject = 'Your free credit resets next month — use it now'
      const body = `Hi ${firstName(ctx)},

Your free assessment credit is sitting there. It resets on
the 1st of next month, but you can use it any time before then.

The fastest way to test AtmosFlow is to run a 5-zone office
walkthrough on your own building or a building you have access
to. It takes about 10 minutes and you'll have a draft report
to compare against your usual deliverable.

If something's blocking you, reply and tell me what.

${APP_URL}

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  // free.success is enqueued reactively by email-triggers when
  // assessment_completed fires for a free-tier user. Not on the timed
  // schedule.
  {
    id: 'free.success',
    delayMs: 0,
    render: (ctx) => {
      const subject = 'Nice work on your first AtmosFlow assessment'
      const body = `Hi ${firstName(ctx)},

You finalized your first assessment. The draft report is
saved in your account.

If AtmosFlow is useful, you can upgrade to a paid plan and
get more assessment credits per month:

Solo: $129/month for 50 assessments
Pro: $329/month for 200 assessments
Practice: $749/month for 500 assessments

Save 17% with annual billing.

Upgrade: ${PRICING_URL}

If something's not working or could be better, reply and
tell me. I'm building this for people like you.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
]

// ─── Paid-tier sequence (3 emails) ──────────────────────────────────
export const PAID_TIER_TEMPLATES: EmailTemplate[] = [
  {
    id: 'paid.welcome',
    delayMs: 0,
    render: (ctx) => {
      const tierLabel = ctx.plan === 'solo' ? 'Solo' : ctx.plan === 'pro' ? 'Pro' : 'Practice'
      const credits = ctx.plan === 'solo' ? 50 : ctx.plan === 'pro' ? 200 : 500
      const subject = `Welcome to AtmosFlow ${tierLabel} — let’s get your first report out`
      const body = `Hi ${firstName(ctx)},

Welcome to AtmosFlow ${tierLabel}. You have ${credits} assessment
credits this month. Most consultants get their first month's
value back on a single report.

Here's how to start:

1. Open the app: ${APP_URL}
2. Tap "Start assessment"
3. Walk through the guided flow
4. Tap "Finalize" when done — you'll have a CIH-defensible
   draft report ready to download.

If something's blocking you in the first 30 minutes, reply
to this email. I read every one.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'paid.tips',
    delayMs: 3 * ONE_DAY,
    render: (ctx) => {
      const subject = 'Three ways to get more out of AtmosFlow'
      const body = `Hi ${firstName(ctx)},

Three things power users do that make AtmosFlow faster:

1. Use zones for multi-room buildings.
   Add one zone per room you assess. Each zone keeps its own
   readings and findings. Composite scores roll up across zones.

2. Capture photos as evidence.
   Tap the camera icon on any zone to attach a photo. Photos
   appear in the report appendix with their zone and timestamp.

3. Use the synthesis interpretation to draft executive summaries.
   The synthesis section pulls together cross-zone patterns
   (e.g. "all three west-facing zones have low CO₂ — mechanical
   imbalance"). Copy-paste it into your client's executive summary.

Anything else you'd like documented? Reply with a question.

${APP_URL}

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'paid.feedback',
    delayMs: 14 * ONE_DAY,
    render: (ctx) => {
      const subject = 'Quick favor — what’s working and what isn’t?'
      const body = `Hi ${firstName(ctx)},

You've been using AtmosFlow for two weeks. I'd love to know:

1. What's working? (One thing that surprised you in a good way.)
2. What's slow? (One thing that takes longer than it should.)
3. What would you build next if you were me?

Reply directly to this email. I read every response and your
answers shape what gets built next month.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
]

// ─── Event-scheduled templates (habit-loop PR 1+) ──────────────────
// These don't participate in templatesForPlan() — they're enqueued
// directly by trigger functions in response to product events
// (finalize-assessment, etc.), not at signup. delayMs is unused
// because the row's scheduled_for is computed by the trigger.

export const EVENT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'reassessment.reminder',
    delayMs: 0,
    render: (ctx, payload) => {
      // Payload threaded through email_queue.payload (migration 018).
      const siteName = (payload && typeof payload.site_name === 'string')
        ? payload.site_name
        : 'one of your sites'
      const siteId = (payload && typeof payload.site_id === 'string') ? payload.site_id : ''
      // Format the due date the email is sent FOR (matches scheduled_for
      // in most cases). Fallback to today if missing.
      const dueIso = (payload && typeof payload.due_at === 'string') ? payload.due_at : null
      const dueDate = dueIso ? new Date(dueIso) : new Date()
      const dueLabel = isNaN(dueDate.getTime())
        ? ''
        : dueDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      const startUrl = siteId
        ? `https://${APP_URL}/?start=site&id=${encodeURIComponent(siteId)}`
        : `https://${APP_URL}/`

      const subject = `Re-assessment due at ${siteName}`
      const body = `Hi ${firstName(ctx)},

A reminder from AtmosFlow: ${siteName} is due for re-assessment${dueLabel ? ` (${dueLabel})` : ''}.

Start a re-assessment with the previous building profile already
filled in — most consultants finish a follow-up walkthrough in
20 minutes:

${startUrl}

Re-assessment intervals are typically annual for most occupied
buildings; adjust the cadence per site in Settings → Sites if your
site warrants quarterly or post-event review.

Not the right time? You can pause reminders for this site in
Settings → Sites, or turn off re-assessment emails entirely in
Settings → Email Preferences.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  // ── Calibration expiry (habit-loop PR 2) ─────────────────────────
  // Two-stage reminders driven by scripts/cron-calibration-expiry.ts
  // scanning public.profiles daily. The cron picks ONE email per
  // (user, instrument, cal_date, kind) so re-runs after first
  // delivery are no-ops; re-calibrating advances cal_date and starts
  // a fresh cycle.
  {
    id: 'calibration.expiring',
    delayMs: 0,
    render: (ctx, payload) => {
      const meter = (payload && typeof payload.meter === 'string') ? payload.meter : 'your instrument'
      const days = (payload && typeof payload.days_to_expiry === 'number') ? payload.days_to_expiry : null
      const subject = `${meter} calibration expires soon — schedule recalibration`
      const window = (days != null && days > 0) ? `in ${days} day${days === 1 ? '' : 's'}` : 'soon'
      const body = `Hi ${firstName(ctx)},

A heads up: ${meter} is recorded as expiring ${window}.

AtmosFlow flags assessments where the primary instrument is out of
calibration. Re-cal now (or send it out) so your upcoming
assessments stay CIH-defensible without an "Out of calibration"
banner on the cover page.

After re-cal, update the date in Settings → Profile → Instruments
so AtmosFlow knows the new validity window.

You can turn off these reminders any time in Settings → Profile →
Email Preferences.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  // ── Peer review (habit-loop PR 4) ────────────────────────────────
  // Transactional — sent synchronously by /api/peer-review.ts (NOT
  // drained from email_queue). Templates live here so the rendering
  // logic stays in one place; the API endpoint calls getTemplate +
  // render then sends via Resend directly.
  //
  // peer_review.request — to the REVIEWER (not necessarily an
  //   AtmosFlow user). Includes the magic-link URL + DOCX attachment.
  // peer_review.completed — to the ASSESSOR, after the reviewer
  //   responds. Status + notes summary.
  {
    id: 'peer_review.request',
    delayMs: 0,
    render: (_ctx, payload) => {
      // Note: ctx.first_name here is the REVIEWER (whose name we know
      // from the form), NOT the assessor; the API endpoint constructs
      // a minimal UserContext for the reviewer with their name.
      const p = (payload || {}) as Record<string, unknown>
      const assessor = typeof p.assessor_name === 'string' ? p.assessor_name : 'an AtmosFlow user'
      const reviewer = typeof p.reviewer_name === 'string' ? p.reviewer_name : 'colleague'
      const facility = typeof p.facility_name === 'string' && p.facility_name ? p.facility_name : 'an IAQ assessment'
      const message = typeof p.message === 'string' && p.message.trim() ? p.message.trim() : ''
      const respondUrl = typeof p.respond_url === 'string' ? p.respond_url : `https://${APP_URL}/`
      const subject = `Peer review requested: ${facility}`
      const messageBlock = message ? `\n${assessor} included a note:\n\n  ${message}\n` : ''
      const body = `Hi ${reviewer},

${assessor} sent you an AtmosFlow IAQ assessment for peer review.

Facility: ${facility}
${messageBlock}
The report is attached to this email as a Word document. When you've
reviewed it, please open this link to record your response (approve,
request changes, or comment):

${respondUrl}

The link expires in 30 days. No AtmosFlow account is required —
the link is single-purpose and only records your review status +
optional notes.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'peer_review.completed',
    delayMs: 0,
    render: (ctx, payload) => {
      const p = (payload || {}) as Record<string, unknown>
      const reviewer = typeof p.reviewer_name === 'string' ? p.reviewer_name : 'Your reviewer'
      const facility = typeof p.facility_name === 'string' && p.facility_name ? p.facility_name : 'your assessment'
      const status = typeof p.status === 'string' ? p.status : 'commented'
      const notes = typeof p.notes === 'string' && p.notes.trim() ? p.notes.trim() : ''
      const statusLabel = status === 'approved' ? 'Approved'
        : status === 'changes_requested' ? 'Requested changes'
        : 'Comment'
      const subject = `${reviewer} reviewed ${facility} — ${statusLabel}`
      const notesBlock = notes ? `\nReviewer notes:\n\n  ${notes}\n` : ''
      const body = `Hi ${firstName(ctx)},

${reviewer} responded to your peer review request.

Facility:  ${facility}
Response:  ${statusLabel}
${notesBlock}
You can see this review (and any other pending reviews) in the
peer reviews list on the report's results screen.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  // ── Sampling results outstanding (habit-loop PR 5) ───────────────
  // Fires N days after finalize when the engine generated a sampling
  // plan but no lab results have been attached yet. Cancelled
  // automatically when /api/events sees a lab_results_attached event.
  {
    id: 'sampling_results.reminder',
    delayMs: 0,
    render: (ctx, payload) => {
      const p = (payload || {}) as Record<string, unknown>
      const facility = (typeof p.facility_name === 'string' && p.facility_name) ? p.facility_name : 'your assessment'
      const planSize = typeof p.sampling_plan_size === 'number' ? p.sampling_plan_size : 0
      const methodLine = planSize > 0
        ? `${planSize} sampling method${planSize === 1 ? '' : 's'}`
        : 'sampling methods'
      const subject = `Lab results still pending — ${facility}`
      const body = `Hi ${firstName(ctx)},

Your AtmosFlow assessment for ${facility} included ${methodLine}
in the sampling plan. The deliverable carries those
recommendations forward; once the lab returns analytical results,
attaching the CSV closes the loop and the report includes the
results appendix.

Open AtmosFlow → the report's Lab Results tab → import the CSV.

If you've already attached the results, ignore this message —
AtmosFlow only knows what it sees on the assessment record.

You can turn off these reminders any time in Settings → Profile
→ Email Preferences.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  // ── Portfolio digest (habit-loop PR 3) ───────────────────────────
  // Quarterly summary email driven by scripts/cron-portfolio-digest.ts.
  // Stats are the user's OWN audit_log totals — no cohort comparison
  // (per the Hook audit's screening-only constraint). Variability is
  // user-corpus-driven, which is the defensible form of "variable
  // reward" per Eyal's framework for B2B / professional audiences.
  {
    id: 'portfolio.digest',
    delayMs: 0,
    render: (ctx, payload) => {
      const stats = (payload || {}) as Record<string, unknown>
      const qLabel = typeof stats.quarter_label === 'string' ? stats.quarter_label : 'this quarter'
      const priorLabel = typeof stats.prior_label === 'string' ? stats.prior_label : 'last quarter'
      const finalized = typeof stats.assessments_finalized === 'number' ? stats.assessments_finalized : 0
      const finalizedPrior = typeof stats.assessments_finalized_prior === 'number' ? stats.assessments_finalized_prior : 0
      const delta = typeof stats.delta_finalized === 'number' ? stats.delta_finalized : (finalized - finalizedPrior)
      const reports = typeof stats.reports_exported === 'number' ? stats.reports_exported : 0
      const sites = typeof stats.distinct_sites === 'number' ? stats.distinct_sites : 0

      // Delta phrasing — factual, no judgment.
      let deltaLine: string
      if (finalizedPrior === 0 && finalized > 0) {
        deltaLine = `${finalized} more than ${priorLabel} (no assessments recorded that quarter).`
      } else if (delta > 0) {
        deltaLine = `${delta} more than ${priorLabel} (${finalizedPrior}).`
      } else if (delta < 0) {
        deltaLine = `${Math.abs(delta)} fewer than ${priorLabel} (${finalizedPrior}).`
      } else {
        deltaLine = `Same as ${priorLabel} (${finalizedPrior}).`
      }

      const subject = `Your ${qLabel} on AtmosFlow — ${finalized} assessment${finalized === 1 ? '' : 's'}`
      const sitesLine = sites > 0
        ? `Sites assessed:        ${sites}\n`
        : ''
      const body = `Hi ${firstName(ctx)},

Your ${qLabel} on AtmosFlow:

Assessments finalized: ${finalized}
${sitesLine}Reports exported:      ${reports}

${deltaLine}

These are your own totals — no benchmarks, no cohort comparison.
Use them however helps your practice. If a number looks off,
reply to this email and tell me; it usually means the engine
didn't see something you finalized.

Turn off these quarterly digests any time in Settings → Profile →
Email Preferences.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
  {
    id: 'calibration.expired',
    delayMs: 0,
    render: (ctx, payload) => {
      const meter = (payload && typeof payload.meter === 'string') ? payload.meter : 'your instrument'
      const days = (payload && typeof payload.days_to_expiry === 'number') ? Math.abs(payload.days_to_expiry) : null
      const subject = `${meter} calibration has expired`
      const sinceFragment = (days != null && days > 0) ? ` (${days} day${days === 1 ? '' : 's'} ago)` : ''
      const body = `Hi ${firstName(ctx)},

${meter} is recorded as expired${sinceFragment}.

Findings derived from an out-of-calibration instrument carry a
"qualitative-only" caveat through every part of the deliverable —
that's the conservative behavior built into AtmosFlow's
defensibility layer. Re-cal before your next walkthrough to
remove the caveat.

After re-cal, update the date in Settings → Profile → Instruments.

If this is wrong (cal happened but the date wasn't logged), just
update the date in your profile and AtmosFlow will recompute.

${SIGNATURE}`
      return { subject, body, text: body }
    },
  },
]

// ─── Lookup ────────────────────────────────────────────────────────
const ALL_TEMPLATES: Record<string, EmailTemplate> = {}
for (const t of [...FREE_TIER_TEMPLATES, ...PAID_TIER_TEMPLATES, ...EVENT_TEMPLATES]) {
  ALL_TEMPLATES[t.id] = t
}

export function getTemplate(id: string): EmailTemplate | null {
  return ALL_TEMPLATES[id] ?? null
}

export function templatesForPlan(plan: 'free' | 'solo' | 'pro' | 'practice'): EmailTemplate[] {
  if (plan === 'free') return FREE_TIER_TEMPLATES.filter(t => t.id !== 'free.success')
  return PAID_TIER_TEMPLATES
}
