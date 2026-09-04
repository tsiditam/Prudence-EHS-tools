/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * db-migrate — idempotent forward-only migration runner.
 *
 * Why this exists: production drifted badly from the migration files
 * (011, 016–021 were never applied), which silently broke the Report
 * Templates and Sites panels — the API queried tables that didn't
 * exist and 500'd. Migrations were being applied by hand, so anything
 * that wasn't run by a human went missing. This runner closes that gap:
 * it tracks what's applied in a `public.schema_migrations` ledger and
 * applies anything pending, in order, each in its own transaction.
 *
 * It is intentionally small and dependency-light. The only runtime
 * dependency (`pg`) is imported dynamically inside main() so the pure
 * planning helpers below can be unit-tested without a database.
 *
 * Ledger: `public.schema_migrations (version text pk, name, applied_at)`.
 * This is OUR ledger, in the `public` schema — deliberately distinct
 * from the Supabase CLI's `supabase_migrations.schema_migrations`, which
 * this project never adopted consistently (it recorded timestamp
 * versions for 014/015 only). One source of truth, under our control.
 * The ledger has RLS enabled and every privilege revoked from the
 * API-exposed roles (anon / authenticated): the runner connects as the
 * database owner, and nobody else has any business reading or forging
 * ledger rows (audit 2026-09, H1).
 *
 * A migration file is `^\d{3,}_<name>.sql` under supabase/migrations/
 * (000_base_schema.sql included). The two un-numbered helper files in
 * that directory (apply-012-013.sql, backfill-missing-profiles.sql) are
 * NOT migrations and are deliberately ignored. Two files sharing a
 * version prefix is a hard error — one of them would silently never run.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs            # apply pending
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs --dry-run  # list pending, apply nothing
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs --baseline --baseline-through=022
 *
 * --baseline is the one-time bootstrap for a database that is already
 * up to date but has no ledger yet (exactly our production state after
 * the manual catch-up). It marks every file up to and including
 * --baseline-through as applied WITHOUT executing it, so the next normal
 * run only applies genuinely new files. It refuses to run against a
 * database whose ledger is non-empty: on a ledgered database the same
 * command would mark every unapplied file as applied and skip it forever.
 *
 * TLS: when SUPABASE_DB_CA holds the project's CA certificate (PEM, from
 * Supabase → Project Settings → Database → SSL), the server certificate
 * is verified against it. Without it the runner still connects but does
 * not verify the certificate, and says so.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations'
)

export const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON TABLE public.schema_migrations FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON TABLE public.schema_migrations FROM authenticated;
    END IF;
  END
  $$;
`

// ── Pure planning helpers (unit-tested without a DB) ────────────────

/** A migration file is `NNN_name.sql` (3+ leading digits). Helper
 *  files like apply-012-013.sql / backfill-missing-profiles.sql are not. */
export function isMigrationFile(name) {
  return /^\d{3,}_.+\.sql$/.test(name)
}

/** The numeric prefix, kept as the literal string ('001', '022') so the
 *  ledger key matches the filename exactly. Null for non-migrations. */
export function parseVersion(name) {
  const m = /^(\d{3,})_/.exec(name)
  return m ? m[1] : null
}

/** Versions carried by more than one file → [{ version, names }]. */
export function findDuplicateVersions(files) {
  const byVersion = new Map()
  for (const f of files) {
    if (!byVersion.has(f.version)) byVersion.set(f.version, [])
    byVersion.get(f.version).push(f.name)
  }
  return [...byVersion.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([version, names]) => ({ version, names: names.slice().sort() }))
}

/** Read the migrations dir → sorted [{ version, name, path }].
 *  Throws when two files share a version prefix. */
export async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await fs.readdir(dir)
  const files = entries
    .filter(isMigrationFile)
    .map(name => ({ version: parseVersion(name), name, path: path.join(dir, name) }))
    .sort((a, b) => Number(a.version) - Number(b.version))
  const dupes = findDuplicateVersions(files)
  if (dupes.length) {
    const detail = dupes.map(d => `${d.version}: ${d.names.join(', ')}`).join('; ')
    throw new Error(`duplicate migration version(s) — ${detail}`)
  }
  return files
}

/** Files whose version is not yet in the applied set, in order. */
export function computePending(files, appliedVersions) {
  const applied = appliedVersions instanceof Set ? appliedVersions : new Set(appliedVersions)
  return files.filter(f => !applied.has(f.version))
}

/** CLI flags → { dryRun, baseline, baselineThrough }. Throws on a
 *  --baseline without a well-formed --baseline-through=NNN. */
export function parseArgs(argv) {
  const args = argv.slice()
  const out = { dryRun: args.includes('--dry-run'), baseline: args.includes('--baseline'), baselineThrough: null }
  const through = args.find(a => a.startsWith('--baseline-through'))
  if (through) {
    const m = /^--baseline-through=(\d{3,})$/.exec(through)
    if (!m) throw new Error('--baseline-through must be given as --baseline-through=NNN (a migration version, e.g. 022)')
    out.baselineThrough = m[1]
  }
  if (out.baseline && !out.baselineThrough) {
    throw new Error('--baseline requires --baseline-through=NNN: the last migration version already present in the database')
  }
  if (out.baselineThrough && !out.baseline) {
    throw new Error('--baseline-through only makes sense together with --baseline')
  }
  return out
}

/** The files a baseline records. Refuses a non-empty ledger and an
 *  unknown --baseline-through version. */
export function planBaseline(files, appliedVersions, through) {
  const applied = appliedVersions instanceof Set ? appliedVersions : new Set(appliedVersions)
  if (applied.size > 0) {
    throw new Error(
      `refusing to baseline: the ledger already holds ${applied.size} version(s). ` +
      'Baseline is for a database with NO ledger; on a ledgered database it would mark ' +
      'every pending migration as applied without running it. Use a normal run instead.'
    )
  }
  if (!files.some(f => f.version === through)) {
    throw new Error(`--baseline-through=${through} does not match any migration file`)
  }
  return files.filter(f => Number(f.version) <= Number(through))
}

/** pg `ssl` option for the connection. Verified when a CA is supplied;
 *  otherwise the legacy unverified mode, with a warning to print. */
export function resolveSsl(env = process.env) {
  const ca = env.SUPABASE_DB_CA
  if (ca && ca.trim()) {
    return { ssl: { rejectUnauthorized: true, ca: ca.trim() }, warning: null }
  }
  return {
    ssl: { rejectUnauthorized: false },
    warning: '[db-migrate] WARNING: SUPABASE_DB_CA is not set — the database certificate is NOT verified. ' +
      'Set SUPABASE_DB_CA to the project CA (Supabase → Project Settings → Database → SSL) to verify it.',
  }
}

// ── Runner (DB side) ────────────────────────────────────────────────

async function main() {
  const { dryRun, baseline, baselineThrough } = parseArgs(process.argv.slice(2))

  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!connectionString) {
    console.error('[db-migrate] SUPABASE_DB_URL (or DATABASE_URL) is required')
    process.exit(1)
  }

  const files = await listMigrationFiles()
  if (files.length === 0) {
    console.log('[db-migrate] no migration files found')
    return
  }

  const { ssl, warning } = resolveSsl(process.env)
  if (warning) console.warn(warning)

  // pg is imported here, not at module scope, so the pure helpers above
  // stay importable (and testable) without the dependency installed.
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString, ssl })
  await client.connect()

  try {
    await client.query(LEDGER_DDL)
    const { rows } = await client.query('SELECT version FROM public.schema_migrations')
    const applied = new Set(rows.map(r => r.version))
    const pending = computePending(files, applied)

    if (baseline) {
      const toRecord = planBaseline(files, applied, baselineThrough)
      for (const f of toRecord) {
        await client.query(
          `INSERT INTO public.schema_migrations (version, name)
             VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
          [f.version, f.name]
        )
      }
      console.log(`[db-migrate] baseline: recorded ${toRecord.length} migration(s) through ${baselineThrough} as applied (none executed)`)
      return
    }

    if (pending.length === 0) {
      console.log(`[db-migrate] up to date — ${applied.size} migration(s) already applied`)
      return
    }

    console.log(`[db-migrate] ${pending.length} pending: ${pending.map(p => p.version).join(', ')}`)
    if (dryRun) {
      console.log('[db-migrate] --dry-run: nothing applied')
      return
    }

    for (const f of pending) {
      const sql = await fs.readFile(f.path, 'utf8')
      process.stdout.write(`[db-migrate] applying ${f.name} … `)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO public.schema_migrations (version, name) VALUES ($1, $2)',
          [f.version, f.name]
        )
        await client.query('COMMIT')
        console.log('ok')
      } catch (err) {
        await client.query('ROLLBACK')
        console.log('FAILED')
        console.error(`[db-migrate] ${f.name} failed and was rolled back:`, err && err.message)
        process.exit(1)
      }
    }
    console.log(`[db-migrate] done — applied ${pending.length} migration(s)`)
  } finally {
    await client.end()
  }
}

// Only run when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('[db-migrate] fatal:', err && err.message)
    process.exit(1)
  })
}
