# Environment variables

Every variable read by `api/`, `lib/`, `scripts/`, `server/` and
`vite.config.js` (`grep -rn 'process.env\.\|import.meta.env\.'`), grouped by
who reads it. `.env.example` carries the same list in file form;
`scripts/check-env.mjs` (`npm run check:env`) reports which required server
variables are missing and is run at container boot by `server/index.js`.

Vite bakes `VITE_*` into the client bundle at build time; everything else is
read from `process.env` at request time. Never put a server secret behind a
`VITE_` prefix.

## Client / public (build time, shipped to the browser)

| Variable | Read by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/utils/supabase*.js`; server fallback for `SUPABASE_URL` in every handler | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `src/utils/supabase*.js`; `api/credits.js`, `api/audit.js`, `api/report-pdf.js` (JWT verification) | Supabase anon (publishable) key |
| `VITE_SENTRY_DSN` | `lib/sentry-client.ts` | Browser Sentry DSN; unset = client Sentry off |
| `VITE_GIT_COMMIT_SHA` | `lib/sentry-client.ts` | Release tag for client Sentry events |
| `VITE_BILLING_MODE` | `src/utils/subscriptionState.js` | `beta` (default) or `live`; flips paid-plan gating on |

## Server (runtime, required)

| Variable | Read by | Purpose |
|---|---|---|
| `SUPABASE_URL` | every `api/**` handler (falls back to `VITE_SUPABASE_URL`) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | every `api/**` handler, `scripts/cron-*.ts`, `scripts/verify-password-reset.ts` | Service-role key — server only, never `VITE_` |
| `ANTHROPIC_API_KEY` | `api/narrative.js`, `api/inline-ai.js`, `api/inline-complete.js`, `api/pre-review-semantic.js`, `api/field-assistant.ts`, `api/photo-analyze.js`, `api/marketing-agent/chat.js` | Claude API key for every AI route |
| `CRON_SECRET` | `api/_cron-auth.ts` (the five `cron-*` routes), `api/reset-credits.js` | Bearer token the scheduler must send; unset = 503 (fail closed) |

## Stripe

| Variable | Read by | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | `api/checkout.js`, `api/webhook.js`, `api/delete-account.js`, `api/customer-portal.ts` | Secret key (`sk_live_` in production) |
| `STRIPE_WEBHOOK_SECRET` | `api/webhook.js` | Signing secret for `/api/webhook` |
| `STRIPE_PRICE_SOLO_MONTHLY` | `api/checkout.js`, `lib/stripe-prices.ts` | Price id |
| `STRIPE_PRICE_SOLO_ANNUAL` | same | Price id |
| `STRIPE_PRICE_PRO_MONTHLY` | same | Price id |
| `STRIPE_PRICE_PRO_ANNUAL` | same | Price id |
| `STRIPE_PRICE_PRACTICE_MONTHLY` | same | Price id |
| `STRIPE_PRICE_PRACTICE_ANNUAL` | same | Price id |

## Email

| Variable | Read by | Purpose |
|---|---|---|
| `RESEND_API_KEY` | `api/early-access.js`, `api/peer-review.ts`, `api/peer-review-respond.ts`, `api/marketing-agent/chat.js`, `scripts/cron-email-queue-processor.ts`, smoke-test alerts | Resend API key |
| `RESEND_FROM_ADDRESS` | `api/peer-review*.ts`, `scripts/cron-email-queue-processor.ts` | From address; defaults inside each caller |

## Cron / admin / entitlement

| Variable | Read by | Purpose |
|---|---|---|
| `ADMIN_SECRET` | `api/admin.js` | Bearer secret for `/api/admin` |
| `UNLIMITED_USAGE_EMAILS` | `lib/unlimited-usage.js` | Comma-separated allowlist that bypasses AI rate limits |

## Observability

| Variable | Read by | Purpose |
|---|---|---|
| `SENTRY_DSN` | `lib/sentry.ts` | Server Sentry DSN; unset = no-op |
| `VERCEL_GIT_COMMIT_SHA` | `lib/sentry.ts`, `vite.config.js`, `server/index.js` | Release tag (set by Vercel) |
| `GIT_COMMIT_SHA` | `vite.config.js`, `server/index.js` | Release tag outside Vercel (CI, Docker) |
| `GIT_COMMIT` | `lib/sentry.ts` | Older fallback for the release tag |
| `VERCEL_ENV` | `lib/sentry.ts` | `production` / `preview` / `development` |
| `NODE_ENV` | `lib/sentry.ts` | Environment fallback; the container image sets `production` |
| `PORT` | `server/index.js` | Container listen port (default 8080) |

## Scripts only (never set on the deployment)

| Variable | Read by | Purpose |
|---|---|---|
| `SUPABASE_DB_URL` | `scripts/db-migrate.mjs` (`.github/workflows/db-migrate.yml`) | Postgres connection string for migrations |
| `DATABASE_URL` | `scripts/db-migrate.mjs` | Fallback for `SUPABASE_DB_URL` |
| `SMOKE_TEST_BASE_URL` | `scripts/smoke-test-production.ts` | Deployment to probe (default `https://atmosflow.app`) |
| `STRIPE_TEST_SECRET_KEY` | `scripts/smoke-test-production.ts` | Must start with `sk_test_`; production Stripe is never hit |
| `SMOKE_TEST_ALERT_EMAIL` | `scripts/smoke-test-production.ts` | Failure alert recipient (via Resend) |
| `SLACK_WEBHOOK_URL` | `scripts/smoke-test-production.ts` | Failure alert channel |
| `SUPABASE_REDIRECT_URL` | `scripts/verify-password-reset.ts` | Redirect used when exercising the reset flow |
| `PASSWORD_RESET_TEST_EMAIL_SEED` | `scripts/verify-password-reset.ts` | Seed for the throwaway account |
