# Database migrations

How AtmosFlow's Supabase schema changes get to production.

## TL;DR

- Migrations are plain SQL files in `atmosiq-v6/supabase/migrations/`,
  named `NNN_description.sql` (e.g. `022_early_access_index_and_usage_analytics.sql`).
- **Merging a migration file to `main` applies it automatically.** The
  `.github/workflows/db-migrate.yml` workflow (repo root) runs the
  migration runner against the production database.
- Locally / ad hoc: `npm run db:migrate` (apply) or
  `npm run db:migrate:status` (list pending, apply nothing).

## Why this exists

Migrations used to be applied by hand. Anything a human didn't run went
missing: in mid-2026, migrations **011 and 016–021** were never applied
to production, so the API queried tables that didn't exist
(`report_templates`, `sites`, `email_queue`, `peer_reviews`, …) and the
Report Templates and Sites panels 500'd in the field. The runner closes
that gap — `main` is now the source of truth for the schema.

## The runner — `scripts/db-migrate.mjs`

Forward-only and idempotent. It keeps its own ledger,
`public.schema_migrations (version, name, applied_at)`, applies any file
whose version isn't in the ledger, in numeric order, **each migration in
its own transaction**, and records it on success. A failure rolls that
migration back and exits non-zero (later migrations don't run).

> The ledger is deliberately separate from the Supabase CLI's
> `supabase_migrations.schema_migrations`. This project never adopted the
> CLI consistently (it recorded timestamp versions for 014/015 only), so
> the runner owns one ledger we control, in the `public` schema.

Only `^\d{3,}_*.sql` files are migrations (`000_base_schema.sql`
included). The two helper files in the directory (`apply-012-013.sql`,
`backfill-missing-profiles.sql`) are ignored. **Two files sharing a
version prefix is a hard error** — the runner refuses to start rather
than silently skipping one of them.

The ledger table has RLS enabled and every privilege revoked from
`PUBLIC`, `anon` and `authenticated` (re-asserted on every run). Only the
database owner the runner connects as can read or write it; PostgREST
callers cannot see, forge or delete ledger rows.

Modes:

| Command | Effect |
|---|---|
| `npm run db:migrate` | Apply all pending migrations |
| `npm run db:migrate:status` | List pending, apply nothing (`--dry-run`) |
| `node scripts/db-migrate.mjs --baseline --baseline-through=NNN` | Record files `000…NNN` as applied **without running them** |

### `--baseline` (guarded)

`--baseline` is the one-time bootstrap for a database that's already up to
date but has **no ledger**. It is deliberately hard to run by accident:

- It **requires `--baseline-through=NNN`** — the last migration version
  already present in the database. Only files up to and including that
  version are recorded; anything later stays pending and is applied by the
  next normal run.
- It **refuses to run when the ledger is non-empty.** On a ledgered
  database the old form marked every unapplied file as applied and skipped
  it forever — exactly the drift the runner exists to prevent.
- `--baseline-through` must name a version that exists as a file.

Production was baselined at version `022` when the runner shipped, so the
next run only applies `023+`.

### Fresh database (branches, staging, disaster recovery)

`000_base_schema.sql` carries the `profiles` table and the
`update_updated_at()` helper that used to live only in the un-ledgered
`supabase/schema.sql`, so a fresh database builds end to end with
`npm run db:migrate` — no manual SQL Editor step first. `schema.sql` is
kept as a pointer only; do not run it by hand (its `assessments` table
used a `uuid` id and conflicted with migration 014's `text` id).

## CI workflow

`.github/workflows/db-migrate.yml` (at the **repo root** — GitHub only
reads workflows from there, not from `atmosiq-v6/.github/`):

- Triggers on push to `main` touching `atmosiq-v6/supabase/migrations/**`.
- `workflow_dispatch` allows a manual run with mode `apply` / `dry-run` /
  `baseline`.
- A `concurrency` group prevents two migration jobs racing the same DB.

### Required secret

Set one repository secret:

- **`SUPABASE_DB_URL`** — Postgres connection string for the atmosflow
  project. Supabase dashboard → Project Settings → Database → Connection
  string → **URI**, with the database password filled in. Use the
  **session pooler** URI for CI.

Without it the workflow fails fast with a clear message.

### TLS verification — `SUPABASE_DB_CA`

Set a second secret, **`SUPABASE_DB_CA`**, to the project's CA
certificate (PEM text; Supabase dashboard → Project Settings → Database →
**SSL** → download certificate). When present the runner connects with
`ssl: { rejectUnauthorized: true, ca }` and verifies the server
certificate. Without it the runner keeps the legacy unverified mode
(`rejectUnauthorized: false`) and prints a warning on every run — the
production job should not be running that way.

### Baseline from the workflow

The `baseline` dispatch mode needs the `--baseline-through` version. The
workflow must pass it through (an input `baseline_through`, required when
`mode` is `baseline`) — see the "Workflow" note in the audit remediation
handoff; the runner rejects a bare `--baseline`.

## Authoring a new migration

1. Add `supabase/migrations/NNN_description.sql` (next number in sequence).
2. Make it **idempotent** — `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE
   POLICY`, `CREATE INDEX IF NOT EXISTS`. Re-running must be safe.
3. No `CREATE INDEX CONCURRENTLY` — the runner wraps each migration in a
   transaction, and `CONCURRENTLY` can't run inside one.
4. Open a PR. On merge to `main`, the workflow applies it.
5. Verify in the Supabase dashboard, or re-run the workflow in `dry-run`
   mode to confirm nothing is pending.
