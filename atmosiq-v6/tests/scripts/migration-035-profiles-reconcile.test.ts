/**
 * Migration 035 — reconcile a drifted public.profiles.
 *
 * Production reported `PGRST204 Could not find the 'certs' column of
 * 'profiles' in the schema cache`. `certs` is in the BASE table
 * definition, so this is not a missing feature migration: the table
 * exists and is missing a column it was always supposed to have, and
 * `create table if not exists` in 000 cannot repair that — it no-ops the
 * whole statement once the table is there.
 *
 * Pinned here are the properties that would otherwise be discovered only
 * after the file had run against production: that every base column is
 * covered, that each statement is individually idempotent, and that the
 * migration never destroys or retypes anything.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const readSql = (p: string) => {
  const f = path.resolve(p)
  return existsSync(f) ? readFileSync(f, 'utf8') : ''
}
/** Comment-free SQL, so prose in a header never satisfies an assertion. */
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '')

const m035 = readSql('supabase/migrations/035_profiles_column_reconcile.sql')
const c035 = strip(m035)
const c000 = strip(readSql('supabase/migrations/000_base_schema.sql'))

/** The base profiles columns, read off 000 rather than restated here, so
 *  a column added to the base definition later cannot silently escape
 *  the reconcile. `id` is excluded: it is the primary key. */
function baseProfileColumns(): string[] {
  const block = /create table if not exists public\.profiles \(([\s\S]*?)\n\);/.exec(c000)
  if (!block) return []
  return block[1]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0])
    .filter((c) => c && c !== 'id' && /^[a-z_][a-z0-9_]*$/.test(c))
}

describe('migration 035 — profiles reconcile', () => {
  it('exists', () => expect(m035.length).toBeGreaterThan(0))

  it('covers every base profile column except the primary key', () => {
    const cols = baseProfileColumns()
    // Guard the guard: if the regex stops matching, this test must fail
    // rather than pass vacuously over an empty list.
    expect(cols.length).toBeGreaterThan(10)
    expect(cols).toContain('certs')
    for (const col of cols) {
      expect(
        new RegExp(`add column if not exists\\s+${col}\\b`, 'i').test(c035),
        `035 does not reconcile the '${col}' column`,
      ).toBe(true)
    }
  })

  it('never patches the primary key into a table that lacks it', () => {
    expect(/add column if not exists\s+id\b/i.test(c035)).toBe(false)
  })

  it('is idempotent: every statement guarded, re-runnable', () => {
    const statements = c035.split(';').map((s) => s.trim()).filter(Boolean)
    expect(statements.length).toBeGreaterThan(0)
    for (const st of statements) {
      expect(/add column if not exists/i.test(st), `unguarded statement: ${st}`).toBe(true)
    }
  })

  it('destroys nothing and retypes nothing', () => {
    expect(/drop\s+(column|table)/i.test(c035)).toBe(false)
    expect(/alter\s+column/i.test(c035)).toBe(false)
    expect(/\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i.test(c035)).toBe(false)
  })

  it('adds name without NOT NULL, which would fail on a populated table', () => {
    const nameStmt = /add column if not exists\s+name[^;]*/i.exec(c035)
    expect(nameStmt).toBeTruthy()
    expect(/not\s+null/i.test(nameStmt![0])).toBe(false)
  })
})
