# Running AtmosFlow in a container

The container is FedRAMP-portability infrastructure: it lets AtmosFlow run
anywhere Docker runs (GovCloud, AWS App Runner, Azure Container Instances,
on-prem) without coupling to Vercel's serverless shape. The Vercel deploy
path remains the production default; the container is parallel
infrastructure.

Until the September 2026 audit this path could not boot: `server/index.js`
`require()`d a `.ts` file, the image did not contain `lib/`, `tsx` was
pruned by `npm ci --omit=dev`, and only 8 of the handlers were mounted.
What follows describes what exists now, and CI (`api-boot` job in
`.github/workflows/atmosflow-ci.yml`) runs `npm run bundle:api` on every PR
so it stays that way.

## Architecture

One process, one port. Express serves the built SPA from `dist/` and every
`/api/*` handler from `server/handlers/`.

```
api/**/*.{js,ts}  ──(scripts/bundle-api.mjs, esbuild)──►  server/handlers/**/*.mjs
lib/sentry.ts     ──(same)────────────────────────────►  server/handlers/_sentry.mjs
server/index.js   walks server/handlers/ and mounts each file as /api/<path>
```

- **Bundling.** `scripts/bundle-api.mjs` bundles each `api/**` entry
  (TypeScript included) with esbuild — `platform: node`, `format: esm`,
  `packages: external` — so what Node loads is exactly the module shape
  Vercel's runtime sees, with relative imports inlined and npm packages
  resolved from the image's production `node_modules`. `_`-prefixed files
  are helpers and are inlined, never emitted as routes. `server/handlers/`
  is a build product and is gitignored.
- **Route table = file tree.** `server/handlers/credits.mjs` → `/api/credits`;
  `server/handlers/profile/mark-onboarded.mjs` → `/api/profile/mark-onboarded`.
  There is no hand-kept list; a new `api/` file is a new route on the next
  image build.
- **All methods forwarded.** Each handler enforces its own method, auth and
  `CRON_SECRET` gate exactly as it does on Vercel (`api/_cron-auth.ts` is
  bundled into each cron handler). The five cron routes therefore answer
  `503` until `CRON_SECRET` is set and `401` without the bearer token;
  schedule them with any external cron that can send a header.
- **Body parsing is per route.** A handler exporting Vercel's
  `config.api.bodyParser = false` (the Stripe webhook) receives the raw bytes
  as a readable stream so signature verification works; everything else gets
  `express.json({ limit: '10mb' })`.
- **Health.** `GET /healthz` → `{ "ok": true, "sha": "<git sha>" }`, served
  only after every handler has been mounted. The Dockerfile `HEALTHCHECK`
  polls it.
- **Proxy.** `app.set('trust proxy', 1)` — one hop, for App Runner / ACI /
  an ingress that sets `X-Forwarded-*`.
- **Observability.** `server/handlers/_sentry.mjs` (bundled `lib/sentry.ts`)
  is imported at boot and `initSentryServer()` called; a no-op when
  `SENTRY_DSN` is unset.
- **Configuration check.** `scripts/check-env.mjs` runs at boot and logs the
  required server variables that are missing. It does not refuse to start —
  a container that serves the SPA is more useful than one that exits, and
  each handler already answers `500 { error: '... not configured' }` for its
  own secrets. Run `npm run check:env` to get a non-zero exit instead.

## Build-time vs runtime env

Vite bakes `VITE_*` variables into the client bundle at build time. The
build stage of the Dockerfile accepts them as `--build-arg`. Server-side
secrets are read at runtime from `process.env` and should be injected at
`docker run` time, never baked into the image. `.env.example` and
`docs/ENVIRONMENT.md` describe every variable; this table is the subset the
container path reads.

| Variable | Where read | When | Required |
|---|---|---|---|
| `VITE_SUPABASE_URL` | client (`src/utils/supabase*.js`); server fallback for `SUPABASE_URL` | build (+ runtime fallback) | yes |
| `VITE_SUPABASE_ANON_KEY` | client; server JWT verification in `api/credits.js`, `api/audit.js`, `api/report-pdf.js` | build + runtime | yes |
| `VITE_SENTRY_DSN` | client (`lib/sentry-client.ts`) | build | no |
| `VITE_BILLING_MODE` | client (`src/utils/subscriptionState.js`): `beta` (default) or `live` | build | no |
| `GIT_COMMIT_SHA` | `vite.config.js` (`__BUILD_SHA__`), `/healthz`, Sentry release | build + runtime | no |
| `SUPABASE_URL` | every handler (`api/**`) | runtime | yes (or `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | every handler | runtime | yes |
| `STRIPE_SECRET_KEY` | `api/checkout.js`, `api/webhook.js`, `api/delete-account.js`, `api/customer-portal.ts` | runtime | yes |
| `STRIPE_WEBHOOK_SECRET` | `api/webhook.js` | runtime | yes |
| `STRIPE_PRICE_{SOLO,PRO,PRACTICE}_{MONTHLY,ANNUAL}` | `api/checkout.js`, `lib/stripe-prices.ts` | runtime | for paid checkout |
| `ANTHROPIC_API_KEY` | `api/narrative.js`, `api/inline-ai.js`, `api/inline-complete.js`, `api/pre-review-semantic.js`, `api/field-assistant.ts`, `api/photo-analyze.js` | runtime | yes |
| `CRON_SECRET` | `api/_cron-auth.ts` (five `cron-*` routes), `api/reset-credits.js` | runtime | yes |
| `ADMIN_SECRET` | `api/admin.js` | runtime | for `/api/admin` |
| `RESEND_API_KEY` | `api/early-access.js`, `api/peer-review*.ts`, `api/marketing-agent/chat.js`, email queue | runtime | for email |
| `RESEND_FROM_ADDRESS` | `api/peer-review*.ts`, `scripts/cron-email-queue-processor.ts` | runtime | no (has default) |
| `UNLIMITED_USAGE_EMAILS` | `lib/unlimited-usage.js` | runtime | no |
| `SENTRY_DSN` | `lib/sentry.ts` via `_sentry.mjs` | runtime | no |
| `VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, `NODE_ENV` | `lib/sentry.ts` release/environment tags; `NODE_ENV=production` set by the image | runtime | no |
| `PORT` | `server/index.js` | runtime | no (default 8080) |

## Build

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="eyJ..." \
  --build-arg GIT_COMMIT_SHA="$(git rev-parse HEAD)" \
  -t atmosflow:latest atmosiq-v6
```

The builder stage runs `npm ci`, `npm run build`, then
`node scripts/bundle-api.mjs`. The runtime stage installs production
dependencies only and copies `dist/`, `server/` (with the bundled handlers),
`lib/` and `scripts/check-env.mjs`.

## Run

```bash
docker run --rm -p 8080:8080 \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  -e VITE_SUPABASE_ANON_KEY="eyJ..." \
  -e STRIPE_SECRET_KEY="sk_test_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e CRON_SECRET="..." \
  -e ADMIN_SECRET="..." \
  -e RESEND_API_KEY="re_..." \
  atmosflow:latest
```

Visit `http://localhost:8080`. The startup log lists every mounted route
and the result of the environment check.

## Smoke tests

```bash
# Health (also what the Docker HEALTHCHECK polls)
curl -s http://localhost:8080/healthz          # → {"ok":true,"sha":"..."}

# SPA loads
curl -fsS http://localhost:8080/ | head -1     # → <!DOCTYPE html>

# sw.js has no-cache headers
curl -sI http://localhost:8080/sw.js | grep -i cache-control

# /api responds (401 without auth is the correct answer)
curl -s http://localhost:8080/api/credits      # → {"error":"Not authenticated"}

# nested route is mounted
curl -s -X POST http://localhost:8080/api/profile/mark-onboarded   # → 401

# cron gate is closed
curl -s http://localhost:8080/api/cron-email-queue-processor       # → 401 (503 if CRON_SECRET unset)

# unknown /api path is a JSON 404, not the SPA shell
curl -s http://localhost:8080/api/nope         # → {"error":"Not found"}

# Stripe webhook signature verification (via stripe CLI)
stripe listen --forward-to localhost:8080/api/webhook
```

## Running outside Docker

```bash
npm run build
npm run bundle:api     # writes server/handlers/
npm run check:env      # lists missing server variables (exit 1 if any)
npm start              # node server/index.js
```

Server-side env vars must be set in the shell or via a `.env` loader.

## Verifying the path in CI

- `npm run accept:api-boot` (the `api_boot` acceptance check) bundles every
  `api/**` entry the same way and imports each output under plain Node,
  asserting the default export is a function. It runs on every PR.
- `npm run bundle:api` runs in the same CI job, so a handler that cannot be
  bundled fails the PR rather than the image build.
- `tests/scripts/bundle-api.test.ts` pins discovery, route mapping and the
  CJS `config` passthrough on fixture trees.

## What this earns toward FedRAMP

- Containerized deployment is a prerequisite for GovCloud-authorized compute
  (AWS GovCloud ECS/EKS, Azure Government AKS, on-prem Kubernetes).
- The Vercel-handler shape stays compatible — the same `api/**` files serve
  both Vercel and the container, so the portability layer has no separate
  code to maintain: only the bundling step and the Express shell.
- This change addresses zero FedRAMP controls on its own; it removes the
  infrastructure blocker that would otherwise force a rewrite during the
  ATO process.
