# HydroScan — Environment Variables

Copy these into `.env` for local dev and into the Vercel project settings for
deploys. Never commit real secrets. (The repo's `.env.example` is the canonical
template; this doc mirrors it in a reviewable, non-secret form.)

## Supabase (client)
| Key | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL, exposed to the SPA |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key, exposed to the SPA |

## Supabase (server / serverless functions)
| Key | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL for `/api/*` functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only; never exposed to the client) |

## Anthropic — Marlow AI assistant
| Key | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key powering the streaming water-quality assistant |

## Stripe — billing (Phase 6)
| Key | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `STRIPE_PRICE_SOLO_MONTHLY` / `_ANNUAL` | Price IDs — Solo tier |
| `STRIPE_PRICE_PRO_MONTHLY` / `_ANNUAL` | Price IDs — Pro tier |
| `STRIPE_PRICE_PRACTICE_MONTHLY` / `_ANNUAL` | Price IDs — Practice tier |

## Misc
| Key | Purpose |
|---|---|
| `UNLIMITED_USAGE_EMAILS` | Comma-separated internal/admin emails granted unlimited usage |
| `SENTRY_DSN` | Optional — server error monitoring. Unset disables Sentry. |
