/**
 * Unit tests for scripts/db-migrate.mjs — the pure planning helpers.
 *
 * The DB side (main()) is exercised in CI against a real Postgres; here
 * we pin the logic that decides WHAT is a migration and WHICH ones are
 * pending — the part that, if wrong, would silently skip or double-apply
 * a migration. Everything tested here runs without a database (the `pg`
 * dependency is imported lazily inside main(), never at module scope).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isMigrationFile,
  parseVersion,
  listMigrationFiles,
  computePending,
} from '../../scripts/db-migrate.mjs'

describe('db-migrate: file recognition', () => {
  it('accepts NNN_name.sql migration files', () => {
    expect(isMigrationFile('001_analytics_events.sql')).toBe(true)
    expect(isMigrationFile('022_early_access_index_and_usage_analytics.sql')).toBe(true)
  })

  it('rejects the un-numbered helper files in the migrations dir', () => {
    expect(isMigrationFile('apply-012-013.sql')).toBe(false)
    expect(isMigrationFile('backfill-missing-profiles.sql')).toBe(false)
  })

  it('rejects non-sql and partial matches', () => {
    expect(isMigrationFile('001_analytics_events.txt')).toBe(false)
    expect(isMigrationFile('readme.sql')).toBe(false)
    expect(isMigrationFile('12_too_few_digits.sql')).toBe(false)
  })

  it('parses the literal numeric prefix (leading zeros preserved)', () => {
    expect(parseVersion('001_analytics_events.sql')).toBe('001')
    expect(parseVersion('022_early_access_index_and_usage_analytics.sql')).toBe('022')
    expect(parseVersion('apply-012-013.sql')).toBeNull()
  })
})

describe('db-migrate: pending computation', () => {
  const files = [
    { version: '001', name: '001_a.sql', path: '/x/001_a.sql' },
    { version: '002', name: '002_b.sql', path: '/x/002_b.sql' },
    { version: '003', name: '003_c.sql', path: '/x/003_c.sql' },
  ]

  it('returns files not in the applied set, in order', () => {
    const pending = computePending(files, new Set(['001']))
    expect(pending.map(f => f.version)).toEqual(['002', '003'])
  })

  it('returns nothing when everything is applied', () => {
    expect(computePending(files, new Set(['001', '002', '003']))).toEqual([])
  })

  it('accepts a plain array of applied versions', () => {
    expect(computePending(files, ['001', '002']).map(f => f.version)).toEqual(['003'])
  })

  it('treats an unknown applied version as a no-op (does not skip real files)', () => {
    // A version recorded in the ledger that no longer has a file must not
    // cause a real pending file to be skipped.
    expect(computePending(files, new Set(['999'])).map(f => f.version))
      .toEqual(['001', '002', '003'])
  })
})

describe('db-migrate: directory listing', () => {
  let dir: string
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbmig-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('lists only migration files, sorted numerically (not lexically)', async () => {
    await fs.writeFile(path.join(dir, '002_b.sql'), '')
    await fs.writeFile(path.join(dir, '010_j.sql'), '')
    await fs.writeFile(path.join(dir, '001_a.sql'), '')
    await fs.writeFile(path.join(dir, 'apply-012-013.sql'), '')
    await fs.writeFile(path.join(dir, 'backfill-missing-profiles.sql'), '')

    const files = await listMigrationFiles(dir)
    // 010 must sort after 002 (numeric), and helpers must be excluded.
    expect(files.map(f => f.version)).toEqual(['001', '002', '010'])
  })
})

// ── Audit 2026-09 remediations (H1, H2, "--baseline foot-gun", TLS) ──

import {
  LEDGER_DDL,
  findDuplicateVersions,
  parseArgs,
  planBaseline,
  resolveSsl,
} from '../../scripts/db-migrate.mjs'

describe('db-migrate: 000 base schema is a migration (H2)', () => {
  it('accepts 000_base_schema.sql and sorts it first', async () => {
    expect(isMigrationFile('000_base_schema.sql')).toBe(true)
    expect(parseVersion('000_base_schema.sql')).toBe('000')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbmig-'))
    try {
      await fs.writeFile(path.join(dir, '001_a.sql'), '')
      await fs.writeFile(path.join(dir, '000_base_schema.sql'), '')
      const files = await listMigrationFiles(dir)
      expect(files.map(f => f.version)).toEqual(['000', '001'])
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it('the real migrations directory lists 000 first and 034 last with no duplicates', async () => {
    const files = await listMigrationFiles()
    expect(files[0].name).toBe('000_base_schema.sql')
    expect(files.some(f => f.name === '034_report_immutability_and_conflicts.sql')).toBe(true)
    expect(findDuplicateVersions(files)).toEqual([])
  })
})

describe('db-migrate: ledger hardening (H1)', () => {
  it('enables RLS on schema_migrations and revokes anon / authenticated / PUBLIC', () => {
    expect(LEDGER_DDL).toMatch(/ALTER TABLE public\.schema_migrations ENABLE ROW LEVEL SECURITY/)
    expect(LEDGER_DDL).toMatch(/REVOKE ALL ON TABLE public\.schema_migrations FROM PUBLIC/)
    expect(LEDGER_DDL).toMatch(/REVOKE ALL ON TABLE public\.schema_migrations FROM anon/)
    expect(LEDGER_DDL).toMatch(/REVOKE ALL ON TABLE public\.schema_migrations FROM authenticated/)
  })

  it('guards the role revokes so a plain Postgres without those roles still bootstraps', () => {
    expect(LEDGER_DDL).toMatch(/pg_roles WHERE rolname = 'anon'/)
    expect(LEDGER_DDL).toMatch(/pg_roles WHERE rolname = 'authenticated'/)
  })
})

describe('db-migrate: duplicate version prefixes are a hard error', () => {
  it('findDuplicateVersions reports every clashing version', () => {
    const dupes = findDuplicateVersions([
      { version: '027', name: '027_a.sql' },
      { version: '027', name: '027_b.sql' },
      { version: '028', name: '028_c.sql' },
    ])
    expect(dupes).toEqual([{ version: '027', names: ['027_a.sql', '027_b.sql'] }])
  })

  it('listMigrationFiles throws instead of silently dropping one file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dbmig-'))
    try {
      await fs.writeFile(path.join(dir, '027_a.sql'), '')
      await fs.writeFile(path.join(dir, '027_b.sql'), '')
      await expect(listMigrationFiles(dir)).rejects.toThrow(/duplicate migration version.*027/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('db-migrate: --baseline is guarded', () => {
  const files = [
    { version: '000', name: '000_a.sql', path: '/x/000_a.sql' },
    { version: '001', name: '001_b.sql', path: '/x/001_b.sql' },
    { version: '022', name: '022_c.sql', path: '/x/022_c.sql' },
    { version: '023', name: '023_d.sql', path: '/x/023_d.sql' },
  ]

  it('parseArgs requires --baseline-through=NNN alongside --baseline', () => {
    expect(() => parseArgs(['--baseline'])).toThrow(/--baseline-through/)
    expect(() => parseArgs(['--baseline', '--baseline-through'])).toThrow(/--baseline-through=NNN/)
    expect(() => parseArgs(['--baseline', '--baseline-through=22'])).toThrow(/--baseline-through=NNN/)
    expect(parseArgs(['--baseline', '--baseline-through=022'])).toEqual({ dryRun: false, baseline: true, baselineThrough: '022' })
  })

  it('parseArgs rejects --baseline-through on its own and parses --dry-run', () => {
    expect(() => parseArgs(['--baseline-through=022'])).toThrow(/together with --baseline/)
    expect(parseArgs(['--dry-run'])).toEqual({ dryRun: true, baseline: false, baselineThrough: null })
    expect(parseArgs([])).toEqual({ dryRun: false, baseline: false, baselineThrough: null })
  })

  it('planBaseline refuses to run when the ledger is non-empty', () => {
    expect(() => planBaseline(files, new Set(['001']), '022')).toThrow(/refusing to baseline/)
  })

  it('planBaseline records only files up to and including --baseline-through', () => {
    expect(planBaseline(files, new Set(), '022').map(f => f.version)).toEqual(['000', '001', '022'])
  })

  it('planBaseline rejects a version that has no file', () => {
    expect(() => planBaseline(files, new Set(), '099')).toThrow(/does not match any migration file/)
  })
})

describe('db-migrate: TLS', () => {
  it('verifies the server certificate against SUPABASE_DB_CA when set', () => {
    const { ssl, warning } = resolveSsl({ SUPABASE_DB_CA: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n' })
    expect(ssl).toEqual({ rejectUnauthorized: true, ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----' })
    expect(warning).toBeNull()
  })

  it('keeps the unverified legacy mode with a warning when no CA is set', () => {
    const { ssl, warning } = resolveSsl({})
    expect(ssl).toEqual({ rejectUnauthorized: false })
    expect(warning).toMatch(/SUPABASE_DB_CA is not set/)
    expect(resolveSsl({ SUPABASE_DB_CA: '   ' }).warning).toMatch(/not set/)
  })
})
