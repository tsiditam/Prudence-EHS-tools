---
name: atmosflow-habit-loop
description: Add a new habit-loop email to AtmosFlow following the Healer Hook constraint and the shared infrastructure landed in habit-loop PRs 1–5. Use this skill when adding a reminder, digest, or notification email triggered by a product event or schedule. Triggers on phrases like "add a new email reminder", "another habit loop", "follow-up email when X", "reminder for Y", "PR 6 habit loop", or similar requests to wire a new outbound email tied to user activity. Do NOT use for: transactional emails on the auth path (password reset, magic link signin — those have their own pipeline), or for adding the onboarding sequence (that's the FREE_TIER_TEMPLATES / PAID_TIER_TEMPLATES path in lib/email-sequences.ts).
---

# AtmosFlow habit-loop email skill

You're being invoked because someone wants to add a new outbound email
to AtmosFlow that's tied to user activity. This file codifies the
constraints + shared infrastructure that landed across habit-loop
PRs 1–5 (re-assessment reminder, calibration expiry, portfolio digest,
peer review, sampling-results-outstanding).

The goal is: ship a new loop that **objectively improves the user's
professional work product** without re-inventing the infrastructure
or breaking the screening-only positioning.

## 0. The Healer Hook constraint (in-scope vs. out)

AtmosFlow is a CIH-defensible IH tool, not a consumer engagement app.
The Nir Eyal Hook Model audit (earlier session, documented in
`scripts/acceptance/prod-ready.json`'s habit-loop criteria) found
that ONLY emails that pass this test are compatible with the product:

**Each loop iteration must objectively improve the user's professional
work product.** If the answer to "what does this email help the
assessor DO" is "feel engaged," it's out. If the answer is "complete
a real IH workflow step they'd otherwise drop," it's in.

### In-scope examples (the shipped loops)
- Re-assessment reminder per saved site (encodes IH annual cadence)
- Calibration-expiry warning (CIH-defensibility requirement)
- Quarterly portfolio digest of the user's OWN totals (no cohort)
- Peer review send + magic-link respond (IH peer review is a norm)
- Sampling-results-outstanding when CSV not yet uploaded

### Out-of-scope — refuse to build these
- Streaks / daily login counters → wrong cadence for IH project work
- Public leaderboards / "top consultants" → destroys screening-only positioning
- Push notifications with urgency / FOMO copy → unprofessional
- XP / badges / level-up animations → patronizing to a credentialed audience
- Variable score / randomized reward → engine is sacred (CLAUDE.md)
- Cohort comparison ("you're in the top 20%") → flagged in the audit as
  incompatible — the user can request portfolio-digest cohort framing
  only if they specifically override this constraint

If the request is in the second list, surface the audit's finding and
ask the user to confirm they want to override. Don't ship silently.

## 1. Pick the transport (queued+cron vs. transactional)

**Queued + cron** — for periodic / scheduled reminders.
- The reminder doesn't need to fire instantly.
- It benefits from idempotency (re-runs are safe).
- Examples shipped: PR 1 (reassessment), PR 2 (calibration expiry),
  PR 3 (quarterly digest), PR 5 (sampling-results).
- Wiring: enqueue into `public.email_queue` via a trigger function,
  let `scripts/cron-email-queue-processor.ts` drain it on the next
  15-minute tick.

**Transactional (synchronous Resend)** — for user-initiated actions
where the email is expected to land immediately.
- The user just clicked something; a queue delay breaks expectation.
- Example shipped: PR 4 (peer review send — assessor expects the
  reviewer to get the email NOW).
- Wiring: define the template in `lib/email-sequences.ts`, but call
  `getTemplate(id).render(ctx, payload)` + `fetch(RESEND_API, ...)`
  directly from the API endpoint. Bypass the queue.

If unsure, default to queued+cron. The 15-minute drain delay is
fine for almost everything.

## 2. Reusable infrastructure — do NOT reinvent

These already exist. Read them before writing new code.

| Surface | File | Why |
|---|---|---|
| Queue table | `supabase/migrations/011_email_queue.sql` | Already idempotent (sent_at filter) |
| Payload column | `supabase/migrations/018_email_queue_payload.sql` | Per-row jsonb threaded into render() |
| Opt-out flags | `supabase/migrations/019_profile_email_preferences.sql` | jsonb on profiles, default-on |
| Cron drain | `scripts/cron-email-queue-processor.ts` | Resend send + retry-safe |
| Template registry | `lib/email-sequences.ts` (EVENT_TEMPLATES array) | Add yours here |
| Trigger orchestration | `lib/email-triggers.ts` | Pattern: cancel-stale + insert |
| Event spine | `lib/events/types.ts` + `api/events.ts` | Allowlisted EventName + dispatcher |
| Cron entry pattern | `api/cron-*-processor.ts` | CRON_SECRET-gated Vercel handler |
| Settings opt-out toggle | `src/components/ProfileScreen.jsx` | Four toggles already; add yours next to them |

If you find yourself writing a new migration for a new email type,
stop and reconsider. The infrastructure is shared by design.

## 3. The checklist (queued + cron path)

Use this when you're adding a scheduled or event-triggered reminder.

### 3.1 — Template (`lib/email-sequences.ts`)
- Add to the `EVENT_TEMPLATES` array (NOT to `FREE_TIER_TEMPLATES` /
  `PAID_TIER_TEMPLATES` — those are the signup sequences).
- Render signature: `render: (ctx: UserContext, payload?: EmailPayload) => RenderedEmail`
- Standard structure for the body:
  - `Hi ${firstName(ctx)},`
  - 1–2 sentence factual statement of what changed / what's due
  - The professional action they should take (with deep link if applicable)
  - Closing: "You can turn off these reminders any time in Settings →
    Profile → Email Preferences."
  - `${SIGNATURE}`
- **Copy guidance:** factual, no engagement language. No "you're behind!"
  No "we miss you." No "X people …". State what's due, link to it, end.

### 3.2 — Trigger function (`lib/email-triggers.ts`)
- Signature: `async function enqueueXxxReminder(supabase: SupabaseLike, event: XxxEvent): Promise<{ canceled: number; enqueued: number }>`
- Idempotency model: **cancel-and-reschedule** keyed on a domain
  identifier in the payload (site_id for reassessment, report_id for
  sampling-results, (instrument_key, cal_date) for calibration).
- For periodic loops also add: `async function cancelXxxReminder(supabase, { user_id, domain_id })`
  for the cancellation event path (e.g. "user attached the lab CSV →
  cancel the pending reminder").
- Throw on missing required fields. Use `getTemplate(id)` to
  verify the template is registered.

### 3.3 — Event spine (`lib/events/types.ts` + `api/events.ts`)
- Add the new EventName to the union + `KNOWN_EVENTS` array.
- Extend `dispatchSideEffects` in `api/events.ts`:
  - Match on the event name
  - Pull `profiles.email_preferences` once at the top
  - Branch into your `dispatchXxx` helper
  - Wrap each side-effect in `try { … } catch (err) { console.error(...) }`
    — a failure must NEVER flip the 200 to a 500 (the audit_log row
    is already written).
- If the dispatch needs to be cancelled by a later event, add that
  cancellation branch too. Example: PR 5's `dispatchLabResultsAttached`
  calls `cancelSamplingResultsReminder`.

### 3.4 — Emit site (in the SPA)
- Find the React event that maps to the trigger (finalize, upload,
  delete, etc.).
- Add `emitEvent('your_event_name', { target_id, target_type, details: {...} })`
- `target_id` should be the canonical domain id (rpt-..., site-..., etc.)
- `details` carries the gating flags the dispatcher reads (e.g.
  `sampling_plan_size`, `lab_results_attached`).

### 3.5 — Opt-out flag
- Add the flag to the `email_preferences` JSONB shape in migration
  `019` (it's already there for the five shipped loops). For a NEW
  loop, add the flag with a default of `true` either:
  - To migration 019's default (if you control the migration timing), OR
  - In a NEW migration that does `ALTER TABLE profiles ALTER COLUMN
    email_preferences SET DEFAULT '<new shape>'::jsonb`. Existing rows
    just get the missing key treated as `true` by the dispatcher's
    `prefs?.xxx === false` check.
- Add a fourth/fifth/etc. checkbox to `ProfileScreen.jsx` alongside
  the existing four. Copy pattern: `<feature name> · <one-line cadence
  description>`.

### 3.6 — Acceptance criterion (`scripts/acceptance/prod-ready.json`)
- Add a new criterion with id `<FEATURE>-REMINDER` (or `-DIGEST`, etc.).
- Pattern (copy from `SAMPLING-RESULTS-REMINDER`):
  ```json
  {
    "id": "YOUR-FEATURE-REMINDER",
    "label": "<one-line description> (habit-loop PR <N>)",
    "checks": [
      { "type": "grep_matches", "pattern": "enqueueYourReminder", "paths": ["lib/email-triggers.ts"] },
      { "type": "grep_matches", "pattern": "your_template\\.id", "paths": ["lib/email-sequences.ts"] },
      { "type": "grep_matches", "pattern": "your_event_name", "paths": ["lib/events/types.ts", "api/events.ts"] },
      { "type": "grep_matches", "pattern": "your_pref_flag", "paths": ["src/components/ProfileScreen.jsx"] }
    ]
  }
  ```

### 3.7 — Tests
- `tests/lib/email-sequences.test.ts` — extend with:
  - Trigger required-fields throw cases
  - Happy path (inserts row with payload)
  - Idempotency (re-enqueue cancels prior)
  - Cross-domain isolation (other reports / sites untouched)
  - Template render with payload
  - Template fallback when payload missing
  - Template NOT in `templatesForPlan` (event-scheduled, not signup)
- `tests/api/events.test.ts` — extend with:
  - Happy-path dispatch (event → row inserted into email_queue mock)
  - Opt-out skip
  - Missing required gating field skip
  - Cancellation event correctly cancels the pending row

### 3.8 — If you need a cron (PR 2 / PR 3 style)
- Create `scripts/cron-your-thing.ts` that does the scan/aggregate
  and calls your trigger function per eligible user.
- Create `api/cron-your-thing.ts` — CRON_SECRET-gated Vercel entry
  delegating to the script.
- Add the schedule to `vercel.json`'s `crons` array.
- Test the script in `tests/scripts/cron-your-thing.test.ts` with
  the same `vi.mock('@supabase/supabase-js', ...)` pattern used in
  the existing cron tests.

## 4. The transactional path (PR 4 style)

Use this when the email must fire synchronously from a user action.

- Define the template in `lib/email-sequences.ts` as normal (same
  EVENT_TEMPLATES array, same render signature).
- In the API endpoint that processes the user action:
  1. Validate auth + input as usual.
  2. Persist whatever record the email refers to (peer_reviews row,
     etc.).
  3. Call `getTemplate(id).render(ctx, payload)` inline.
  4. POST to Resend via `fetch(RESEND_API_KEY)` with the rendered
     subject + text + attachments.
  5. Return 200 with the persisted record id. Failure to deliver
     does NOT flip the 200 — log it (the user can re-send from
     their list view).
- Add `__test.setFetch(fn)` to the endpoint's `__test` injection
  block so the tests can intercept the Resend call.

## 5. Common pitfalls (avoid these)

- **Don't use the queue for transactional sends.** 15-minute delay
  breaks the user's expectation that "I clicked Send → email went."
- **Don't bypass the queue for periodic sends.** You lose idempotency
  and you'll re-send on every cron tick.
- **Don't query audit_log to decide what to send.** The audit_log is
  for analytics + forensics. For state-driven decisions ("did the
  user attach lab results yet?"), read the assessment record OR the
  cancellation event that fires when state changes.
- **Don't put the magic-link token in the response body.** Tokens go
  in the outbound email only. The list view excludes the column.
- **Don't write a template that says "Hi there" without checking ctx.first_name.**
  Use the existing `firstName(ctx)` helper — it handles null.
- **Don't add a new opt-out without a new toggle in ProfileScreen.jsx.**
  The audit found that default-on without an opt-out path is what
  breaks the consent posture.
- **Don't import the cron-processor heavy deps from the trigger
  function.** Triggers are pure DB writes. The cron is the only place
  that touches Resend (for queued path).

## 6. End-to-end verification

After your changes, run:

```
cd atmosiq-v6
npm run typecheck
npm run lint
npm run test
npm run build
npm run accept:prod-ready
```

All five must be clean. The acceptance gate must include your new
criterion AND all 58 prior ones must continue to pass.

## 7. Reference — the five shipped loops

When in doubt, copy from the closest-matching shipped PR:

| Loop | Trigger style | Files to read |
|---|---|---|
| Re-assessment reminder | Event-driven (assessment_finalized) | `lib/email-triggers.ts` (enqueueReassessmentReminder), `api/events.ts` (dispatchAssessmentFinalized) |
| Calibration expiry | Daily cron scan | `scripts/cron-calibration-expiry.ts`, `lib/calibration/banner-state.ts` |
| Portfolio digest | Quarterly cron + audit_log aggregation | `scripts/cron-portfolio-digest.ts`, `lib/portfolio/digest-stats.ts` |
| Peer review | Transactional (Resend inline) | `api/peer-review.ts`, `api/peer-review-respond.ts` |
| Sampling-results | Event-driven (assessment_finalized + lab_results_attached) | `api/events.ts` (dispatchLabResultsAttached) |

## 8. What this skill does NOT cover

- Authoring new template COPY — that's a product/IH-language judgement
  call. Talk to Tsidi (the codebase author) for tone + content review
  before shipping copy that goes to real users.
- Adding cohort comparison / benchmark surfaces. Off-limits per the
  audit unless explicitly approved.
- Changing the signup onboarding sequence
  (`FREE_TIER_TEMPLATES` / `PAID_TIER_TEMPLATES`). That's a separate
  workflow with its own product gating.
- The five anti-patterns listed in Section 0. If asked for those,
  surface the audit's framing first.
