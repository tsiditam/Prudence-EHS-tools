# Production Readiness — Group A

This document indexes the seven hardening deliverables that landed in the
production-readiness pass. Each section is short and action-oriented; the
authoritative source is the code and migrations cited.

Acceptance gate: `npm run accept:prod-ready`. The runner exits 0 only
when every criterion in `scripts/acceptance/prod-ready.json` passes.

---

## §1 — Stripe webhook idempotency

**Why.** Stripe retries delivery 2–5x. Without an idempotency gate, the
same `evt_xxx` event processed multiple times multi-grants credits.

**What landed.**
- `supabase/migrations/006_stripe_webhook_events.sql` — `stripe_webhook_events`
  table + `claim_stripe_event(event_id, event_type)` plpgsql function.
  The function returns `TRUE` if the caller atomically claimed the row,
  `FALSE` if another retry already owned it (unique-violation swallowed).
- `api/webhook.js` calls `claim_stripe_event` immediately after signature
  verification. On `FALSE`, returns 200 with `{ status: 'already_processed' }`.
  On any business-logic error, the claim row is deleted so a Stripe retry
  can re-process — partial-state is impossible.
- `tests/api/webhook-idempotency.test.ts` — pins the contract: same event
  twice → credits once; subscription update twice → state once; new event
  after duplicate processed normally; bad signature → 400; non-POST → 405.

**Operational notes.**
- The claim row's `result` jsonb is updated to `{ status, credits, plan, ... }`
  after successful processing. Useful for debugging "did this event run?"
  by SQL query.
- Old rows can be pruned by `processed_at` after, say, 90 days. No automation
  in this pass; add a cron later if the table grows large.

---

## §2 — Account deletion (full PII purge)

**Why.** GDPR Art. 17 + CCPA §1798.105 require actual erasure, not a
`deleted_at` flag.

**What landed.**
- `supabase/migrations/007_deletion_audit.sql` — `deletion_audit` table.
  Stores SHA-256 hash of `user_id`, `deleted_at`, `entities_purged`,
  `initiated_by`. **No PII is ever stored** here. UPDATE/DELETE revoked.
- `api/delete-account.js` purges in this FK-safe order:
  `assessments` → `credits_ledger` → `purchases` → `analytics_events`
  → `narrative_generations` → `early_access_signups` (by email)
  → `profiles` → Stripe (sub cancel + customer.del) → `auth.users`
  → `deletion_audit` row.
- Returns `200 { status: 'deleted', entities_purged: [...] }`.
- `tests/api/delete-account.test.ts` — 9 tests; covers happy path,
  Stripe cancellation, hash format, 401 (unauth), 401 (bad JWT), 403
  (body.user_id ≠ JWT user), 405 (non-POST), `initiated_by` override.

**Operational notes.**
- The endpoint accepts an optional `body.initiated_by` of `'user' | 'admin'
  | 'gdpr_request'` — the audit row reflects who triggered the deletion.
  Default is `'user'`.
- A `body.user_id` may be supplied for admin tooling, but it must match
  the JWT subject — otherwise 403. The same endpoint cannot be abused
  to delete someone else's account.

---

## §3 — Password reset verification

**Why.** Magic-link reset is invisible until a user reports it broken.
A nightly verification catches Supabase email-config drift.

**What landed.**
- `lib/password-reset.ts` — wrapper exposing `requestPasswordReset`,
  `setNewPassword`, `verifyLoginWithPassword`. Dependency-injected
  Supabase client, easy to test.
- `scripts/verify-password-reset.ts` — end-to-end script: creates a
  test user via admin API, triggers reset, generates the recovery link
  via `admin.generateLink`, sets a new password using the recovery
  session, verifies new password works and old is rejected, deletes
  the test user. Exit 0 on full pass, 1 on any step failure.
- `tests/api/password-reset.test.ts` — 9 unit tests pinning the wrapper
  contract and the round-trip "old password no longer works" property.

**Operational notes.**
- The script runs in CI nightly via the §6 smoke-test workflow when
  wired — the smoke test does the full signup → checkout → narrative →
  delete cycle; password reset is verified by `scripts/verify-password-reset.ts`
  on the same schedule (run separately, same secrets).

---

## §4 — Narrative AI rate limit + cost tracking

**Why.** Each narrative call costs ~$0.045. A burst of 500 generations
on a 500-credit account is $22.50 in API spend. Steady state is fine,
but burst patterns can outrun subscription revenue.

**What landed.**
- `supabase/migrations/008_narrative_generations.sql` — `narrative_generations`
  table; one row per call with `input_tokens`, `output_tokens`,
  `estimated_cost_usd`. Indexed on `(user_id, generated_at DESC)`.
- `api/narrative.js`:
  - Now requires authentication (401 without JWT).
  - Counts rows in 60s and 24h rolling windows for the user.
  - **10 generations / 60s** — burst protection.
  - **100 generations / 24h** — daily ceiling.
  - **5 generations / 24h for free tier** — overrides credit balance.
  - On hit: 429 with `Retry-After` header and a structured error body.
  - Captures `usage.input_tokens` and `usage.output_tokens` from the
    Anthropic response; computes cost using $3/M input + $15/M output.
- `src/engines/narrative.js` (client) attaches the JWT to the request
  so the server can attribute per-user.
- `tests/api/narrative-rate-limit.test.ts` — 8 tests including the
  cost-calculation invariant.

**Operational notes (override for VIPs).**
To raise a customer's daily limit, the cleanest path is to flag the
profile (e.g. `profiles.narrative_daily_override INT`) and have the
handler honor it. Not implemented in this pass — flag the work as a
follow-up. For one-off needs today, manually bump
`PER_DAY_LIMIT` per-user via a where-clause carve-out in the handler;
revert when done.

---

## §5 — Sentry integration

**Why.** Production errors today only surface when a user emails
support. Sentry is the canonical real-time error firehose.

**What landed.**
- `lib/sentry.ts` (server) — initializes `@sentry/node` with the
  `beforeSend` PII scrub. Called from `server/index.js`.
- `lib/sentry-client.ts` (client) — initializes `@sentry/react`.
  Called from `src/main.jsx` at SPA bootstrap.
- `docs/SENTRY.md` — full runbook for env vars, source map upload via
  `@sentry/cli`, PII scrubbing rationale, "verifying it works".
- Sample rates: 100% errors, 10% performance traces.
- `event.user` is reduced to `{ id }` only; email/username/ip dropped.
- `event.request.headers` strips `cookie` and `authorization`.

**Operational notes.**
- Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (client) on Vercel.
- Source maps: add the `@sentry/cli` upload step to the build script
  when ready. Stub instructions in `docs/SENTRY.md`.
- When `SENTRY_DSN` is unset (local dev, tests), `initSentryServer`
  and `initSentryClient` are no-ops.

---

## §6 — Production smoke test

**Why.** Catches breakage from infrastructure drift (Supabase schema
changes, Stripe API version changes, deploy regressions).

**What landed.**
- `scripts/smoke-test-production.ts` — runs the signup → checkout
  → assessment → narrative → delete-account flow against the live
  production environment. **Stripe is in TEST MODE only**; the script
  refuses to run if `STRIPE_TEST_SECRET_KEY` doesn't start with
  `sk_test_`. Production Stripe is never hit.
- `.github/workflows/smoke-test.yml` — daily cron at 06:00 UTC plus
  manual `workflow_dispatch`. Slack webhook + email alerts on failure.
- `tests/scripts/smoke-test.test.ts` — verifies the script loads and
  the production-key guard exists.

**Operational notes.**
- Required GitHub secrets: `SMOKE_TEST_BASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_TEST_SECRET_KEY`,
  `SMOKE_TEST_ALERT_EMAIL`, `SLACK_WEBHOOK_URL`, `RESEND_API_KEY`.
- Test account email format: `smoke-test-{ts}@prudenceehs.com`. Make
  sure that mailbox exists or accepts (the script doesn't poll for
  email arrival — uses admin APIs instead).
- Alert routing falls back gracefully: Slack tried first, then email.

---

## §7 — Engine merge readiness (diagnostic, read-only)

**Why.** Production engine is at v2.3. v2.4–v2.6 work exists in
branches. This script answers "is merging straightforward, or a 2-day
reconciliation?" without modifying any state.

**What landed.**
- `scripts/engine-merge-readiness.ts` — for each branch matching
  `feature/v2.{4,5,6}*`, `v2.{4,5,6}*`, or `claude/v2[456]*`:
  1. Dry-run merge (then `--abort`); count conflicts.
  2. Checkout, `npm ci`, `npm test`; capture pass/fail.
  3. Look for `scripts/acceptance/v2.X.json` on the branch.
  4. Rate complexity: `clean` / `minor_conflicts` / `major_conflicts`
     / `blocked`.
- Output: `/tmp/engine-merge-readiness.md`.
- The original branch and any uncommitted state are restored in a
  finally block. The script is read-only by construction.

**Operational notes.**
- Run before scheduling engine merge sessions:
  `npx tsx scripts/engine-merge-readiness.ts`.
- Output is the input to deciding "merge sequentially in 30 minutes"
  vs "this needs reconciliation work first."

**Important — what the diagnostic does NOT do, by design.**
The script reports whether each branch contains a `scripts/acceptance/v2.X.json`
config but does **not** execute it. Running acceptance against a detached
HEAD with stashed working-tree state is exactly the failure mode that
caused earlier "shipped in name only" merges, so the diagnostic
deliberately stops at presence-check.

**Run acceptance in the merge session, not in the diagnostic.** When you
do `git checkout claude/v2X-…` to merge a branch, the working tree is
clean and the branch is properly checked out — that's the right moment
to run `npm run accept:v2.X` and require exit 0 before the merge commit.
The merge prompt should make this step explicit. The diagnostic exists
to surface state; the merge session changes state. Keep the
responsibilities separate.

The `--with-tests` flag opts into running each branch's test suite, but
this is off by default because it mutates `node_modules` (via `npm ci`
on the foreign branch's lockfile) and is the step most likely to leave
the user confused if the script is interrupted. For pre-merge
verification, run tests in the merge session against the cleanly
checked-out branch — same rationale as acceptance.

---

## How to add new criteria

`scripts/acceptance/prod-ready.json` is the single source of truth for
"is this ready?" Add a criterion when you land a new piece of
production infrastructure, with these rules:
- Use a `grep_matches` check for code-presence assertions; pattern is
  a JS regex.
- Use `file_exists` for documentation, scripts, and CI workflows.
- Use `file_min_size` for substantive scripts to catch the
  "I created an empty file to pass acceptance" failure mode.
- Use `npm_script_passes` sparingly — they're slow because they spawn
  npm. Reserve for typecheck / test / lint / acceptance gates.

The runner is `scripts/acceptance-check.mjs`. Add new check types
there if needed; keep the schema additive.
