# RegLens

AI-assisted EHS compliance review, readiness checks, corrective action plans,
and citation response worksheets. Vite + React PWA with Vercel serverless
functions and Supabase (auth, Postgres, storage).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser + Vercel | Supabase project (public) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel only | JWT verification, rate limiting, credit grants |
| `ANTHROPIC_API_KEY` | Vercel only | AI proxy |
| `CLAUDE_MODEL` | Vercel, optional | Override the pinned model (default `claude-sonnet-4-6`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Vercel only | Checkout + webhook |
| `STRIPE_PRICE_TIER_1..4` | Vercel, optional | Use dashboard prices instead of inline amounts |
| `APP_BASE_URL` | Vercel | Public origin for Stripe redirects |

Create `.env.local` with the two `VITE_` values for local development.

## Local development

```bash
cd reglens            # always run npm from this directory (monorepo)
npm install
npm run dev           # http://localhost:3002
npm test              # vitest: scoring engine, citation registry, HTML escaping
npm run build
```

## Database

Migrations live in `supabase/migrations/` and are applied in order in the
Supabase SQL editor (001 → 004). Migration 004 is required for the current
client: it creates profiles via a trigger on `auth.users`, adds the
`consume_credit` / `grant_credits` functions, and removes the client's
ability to write credit columns or purchase rows.

To make an account an admin (no credits consumed, payment gates bypassed):

```sql
update public.user_profiles set is_admin = true where email = 'you@example.com';
```

## Payments

- `/api/checkout` creates a Stripe Checkout session (one-time payment). The
  buyer is taken from the verified Supabase JWT.
- `/api/stripe-webhook` grants credits on `checkout.session.completed`.
  Register it in the Stripe dashboard and set `STRIPE_WEBHOOK_SECRET`.
  Deliveries are idempotent via `stripe_webhook_events`.
- Tiers: 1 = $49 / 1 review, 2 = $199 / 5 reviews, 3 = $499 / 15 reviews,
  4 = $149 / 1 citation response.

## AI proxy

`/api/claude` verifies the Supabase JWT, rate-limits per user, pins the
model server-side (`CLAUDE_MODEL`, default `claude-sonnet-4-6`), caps
`max_tokens`, and forwards `system`, `messages`, and `output_config`.
Compliance reviews send the document inside `<document>` tags with a
structured-output JSON schema, and review up to 120,000 characters.

## Layout

```
api/                 Vercel functions (CommonJS)
  _lib/auth.js       JWT verification, rate limiting, service-role helpers
src/App.jsx          Application (single component; see docs for roadmap)
src/lib/scoring.js   Deterministic scoring + citation registry (unit tested)
src/lib/escape.js    HTML escaping for report exporters
supabase/migrations  Schema, RLS, functions
docs/                Scoring methodology white paper
tests/               Vitest unit tests
```
