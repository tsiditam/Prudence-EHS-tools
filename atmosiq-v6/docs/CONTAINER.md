# Running AtmosFlow in a container

The container is FedRAMP-portability infrastructure: it lets AtmosFlow run
anywhere Docker runs (GovCloud, AWS App Runner, Azure Container Instances,
on-prem) without coupling to Vercel's serverless shape. The Vercel deploy
path remains the production default; the container is parallel infrastructure.

## Architecture

One process, one port. Express serves both the built SPA from `dist/` and
the eight `/api/*` handlers from `api/`. Stripe webhook verification gets
raw-body handling via a route registered before `express.json()`.

## Build-time vs runtime env

Vite bakes `VITE_*` variables into the client bundle at build time. The
build stage of the Dockerfile accepts them as `--build-arg`. Server-side
secrets (Stripe, Anthropic, Supabase service-role) are read at runtime
from `process.env` and should be injected at `docker run` time, never
baked into the image.

| Variable                     | Where used | When |
|------------------------------|------------|------|
| `VITE_SUPABASE_URL`          | client     | build |
| `VITE_SUPABASE_ANON_KEY`     | client     | build |
| `SUPABASE_URL`               | server     | runtime |
| `SUPABASE_SERVICE_ROLE_KEY`  | server     | runtime |
| `STRIPE_SECRET_KEY`          | server     | runtime |
| `STRIPE_WEBHOOK_SECRET`      | server     | runtime |
| `ANTHROPIC_API_KEY`          | server     | runtime |
| `ADMIN_SECRET`               | server     | runtime |
| `RESEND_API_KEY`             | server     | runtime |
| `PORT`                       | server     | runtime (default 8080) |

## Build

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="eyJ..." \
  -t atmosflow:latest .
```

## Run

```bash
docker run --rm -p 8080:8080 \
  -e SUPABASE_URL="https://your-project.supabase.co" \
  -e SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  -e STRIPE_SECRET_KEY="sk_test_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  -e ADMIN_SECRET="..." \
  -e RESEND_API_KEY="re_..." \
  atmosflow:latest
```

Visit `http://localhost:8080`.

## Smoke tests

```bash
# SPA loads
curl -fsS http://localhost:8080/ | head -1   # → <!DOCTYPE html>

# sw.js has no-cache headers
curl -sI http://localhost:8080/sw.js | grep -i cache-control

# /api responds (will return 401 without auth, which is correct)
curl -s http://localhost:8080/api/credits   # → {"error":"Not authenticated"}

# Stripe webhook signature verification (via stripe CLI)
stripe listen --forward-to localhost:8080/api/webhook
```

## Running outside Docker

```bash
npm run build
npm start   # node server/index.js
```

Server-side env vars must be set in the shell or via a `.env` loader.

## What this earns toward FedRAMP

- Containerized deployment is a prerequisite for GovCloud-authorized compute
  (AWS GovCloud ECS/EKS, Azure Government AKS, on-prem Kubernetes).
- The Vercel-handler shape stays compatible — the same `api/*.js` files
  serve both Vercel and the container, so we have no ongoing maintenance
  cost from this portability layer.
- This change addresses zero FedRAMP controls on its own; it removes the
  infrastructure blocker that would otherwise force a rewrite during the
  ATO process.
