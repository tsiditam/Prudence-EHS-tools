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

export interface EmailTemplate {
  id: string
  /** When to enqueue, in ms after signup. 0 = immediate. */
  delayMs: number
  /** Cancel this template if the user reaches the named milestone first. */
  cancelOnMilestone?: 'first_assessment_completed'
  /** Only send to users still on the named plan when delivery time arrives. */
  requirePlanIs?: 'free' | 'paid'
  render: (ctx: UserContext) => RenderedEmail
}

const SIGNATURE = '— Tsidi\nPrudence Safety & Environmental Consulting, LLC'
const APP_URL = 'atmosiq.prudenceehs.com'
const SAMPLE_REPORT_URL = 'https://atmosiq.prudenceehs.com/sample-report.pdf'
const PRICING_URL = 'https://atmosiq.prudenceehs.com/#pricing'

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

// ─── Lookup ────────────────────────────────────────────────────────
const ALL_TEMPLATES: Record<string, EmailTemplate> = {}
for (const t of [...FREE_TIER_TEMPLATES, ...PAID_TIER_TEMPLATES]) {
  ALL_TEMPLATES[t.id] = t
}

export function getTemplate(id: string): EmailTemplate | null {
  return ALL_TEMPLATES[id] ?? null
}

export function templatesForPlan(plan: 'free' | 'solo' | 'pro' | 'practice'): EmailTemplate[] {
  if (plan === 'free') return FREE_TIER_TEMPLATES.filter(t => t.id !== 'free.success')
  return PAID_TIER_TEMPLATES
}
