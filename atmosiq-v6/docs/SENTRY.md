# Sentry — Error Monitoring + PII Scrubbing

Sentry catches production runtime errors at the moment they happen, on
both server (Vercel serverless functions, Express container) and client
(SPA in iOS Safari, Chrome, etc.).

Source: `lib/sentry.ts` (server), `lib/sentry-client.ts` (client).

## What gets sent

| Field | Sent | Notes |
|---|---|---|
| Stack trace | Yes | The whole point. |
| Release SHA | Yes | `VERCEL_GIT_COMMIT_SHA` server, `VITE_GIT_COMMIT_SHA` client. |
| Environment | Yes | `production` / `preview` / `development`. |
| User ID | Yes | UUID, not PII. Set per-request from the JWT subject. |
| Email / name / firm / address / phone | **No** | Stripped by the `beforeSend` hook. |
| Cookies / Authorization headers | **No** | Stripped by the `beforeSend` hook. |
| Request body (PII fields) | **No** | Recursively scrubbed by `scrubPii()`. |
| Performance traces | 10% | `tracesSampleRate: 0.1`. |
| Errors | 100% | `sampleRate: 1.0`. |

## Privacy: PII scrubbing

Two layers of defense:

1. **Code-level** — `lib/sentry.ts` and `lib/sentry-client.ts` define a
   `beforeSend` hook that recursively walks event payloads and replaces
   any field whose key matches the PII allowlist with `[scrubbed]`. The
   allowlist (`PII_FIELDS`) currently includes: `email`, `name`, `firm`,
   `phone`, `address`, `street`, `city`, `zip`, `postal_code`. The
   `event.user` field is reduced to `{ id }` only — email/username/ip
   are dropped.
2. **Project-level** — the Sentry project must have **"Prevent storing
   of IP addresses"** enabled and **"Data Scrubbing"** configured to
   strip the same fields. Configure in the Sentry dashboard:
   `Settings → Security & Privacy`.

Both layers must be in place. The code-level layer is the authoritative
defense; the project-level layer is belt-and-suspenders for the case
where someone (or a future contributor) bypasses our wrapper.

## Required env vars

### Vercel project (server-side)

| Var | Source |
|---|---|
| `SENTRY_DSN` | Sentry → Settings → Client Keys (DSN). Server DSN. |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens. Used by source map upload. |
| `SENTRY_ORG` | Sentry org slug. |
| `SENTRY_PROJECT` | Sentry project slug. |
| `VERCEL_GIT_COMMIT_SHA` | Auto-set by Vercel. |

### Client bundle (build time)

Vite bakes `VITE_*` into the bundle at build time:

| Var | Source |
|---|---|
| `VITE_SENTRY_DSN` | Same DSN, exposed for the browser bundle. |
| `VITE_GIT_COMMIT_SHA` | Set in CI via `--build-arg` or Vercel env. |

## Source map upload

Sentry needs source maps to symbolicate stack traces back to original
TypeScript / JSX. The Vercel build step uploads them after `vite build`:

```bash
npx @sentry/cli sourcemaps inject ./dist
npx @sentry/cli sourcemaps upload ./dist \
  --org "$SENTRY_ORG" \
  --project "$SENTRY_PROJECT" \
  --release "$VERCEL_GIT_COMMIT_SHA"
```

Add this to `vercel.json` or the `build` npm script when ready to wire up.

## Verifying it works

1. **Server**: trigger an error in `/api/credits` (e.g. set
   `SUPABASE_SERVICE_ROLE_KEY=invalid`, then call the endpoint). The
   error should appear in Sentry → Issues within ~30s.
2. **Client**: in the browser console, run `throw new Error('sentry-test-1')`.
   Should appear in Sentry within ~30s.
3. **PII scrub**: trigger an error from a request that includes an email
   or name in the body. In Sentry, the event payload should show
   `[scrubbed]` for those fields.

## Why beforeSend, not just project scrubbing

Project-level scrubbing happens after the data hits Sentry's ingest
servers — meaning the data was transmitted in clear over the wire. For a
platform that may handle assessor/customer PII subject to subpoena or
audit, "stripped server-side after transit" is materially weaker than
"never left the application." The `beforeSend` hook is the
hard-perimeter; the project setting is defense in depth.

## When to skip Sentry

If `SENTRY_DSN` is unset, `initSentryServer()` and `initSentryClient()`
are no-ops. Local development and CI do not need a DSN. Tests should
never write to a real Sentry project — set `SENTRY_DSN=""` in `.env.test`.
