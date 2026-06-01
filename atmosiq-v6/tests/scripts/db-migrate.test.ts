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
