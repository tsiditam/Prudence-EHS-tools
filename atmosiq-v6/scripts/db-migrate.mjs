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
 *
 * A migration file is `^\d{3,}_<name>.sql` under supabase/migrations/.
 * The two un-numbered helper files in that directory
 * (apply-012-013.sql, backfill-missing-profiles.sql) are NOT migrations
 * and are deliberately ignored.
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs            # apply pending
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs --dry-run  # list pending, apply nothing
 *   SUPABASE_DB_URL=postgres://… node scripts/db-migrate.mjs --baseline # record all files as applied, run nothing
 *
 * --baseline is the one-time bootstrap for a database that is already
 * up to date but has no ledger yet (exactly our production state after
 * the manual catch-up). It marks every current file as applied WITHOUT
 * executing it, so the next normal run only applies genuinely new files.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations'
)

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    text PRIMARY KEY,
    name       text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
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

/** Read the migrations dir → sorted [{ version, name, path }]. */
export async function listMigrationFiles(dir = MIGRATIONS_DIR) {
  const entries = await fs.readdir(dir)
  return entries
    .filter(isMigrationFile)
    .map(name => ({ version: parseVersion(name), name, path: path.join(dir, name) }))
    .sort((a, b) => Number(a.version) - Number(b.version))
}

/** Files whose version is not yet in the applied set, in order. */
export function computePending(files, appliedVersions) {
  const applied = appliedVersions instanceof Set ? appliedVersions : new Set(appliedVersions)
  return files.filter(f => !applied.has(f.version))
}

// ── Runner (DB side) ────────────────────────────────────────────────

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const baseline = args.has('--baseline')

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

  // pg is imported here, not at module scope, so the pure helpers above
  // stay importable (and testable) without the dependency installed.
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }, // Supabase terminates TLS at the pooler
  })
  await client.connect()

  try {
    await client.query(LEDGER_DDL)
    const { rows } = await client.query('SELECT version FROM public.schema_migrations')
    const applied = new Set(rows.map(r => r.version))
    const pending = computePending(files, applied)

    if (baseline) {
      for (const f of files) {
        await client.query(
          `INSERT INTO public.schema_migrations (version, name)
             VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
          [f.version, f.name]
        )
      }
      console.log(`[db-migrate] baseline: recorded ${files.length} migration(s) as applied (none executed)`)
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
