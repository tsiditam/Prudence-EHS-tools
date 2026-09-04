/**
 * Migrations 000 and 034 (audit 2026-09 §4: H2, H5, M4) and the
 * superseded supabase/schema.sql.
 *
 * The DB side runs against real Postgres in CI; pinned here are the
 * properties that would be discovered only after the file had already run
 * against production data.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { REPORT_STATUS } from '../../src/constants/reportLifecycle'

const readSql = (p: string) => {
  const f = path.resolve(p)
  return existsSync(f) ? readFileSync(f, 'utf8') : ''
}
/** Comment-free SQL, so prose in a header never satisfies an assertion. */
const strip = (sql: string) => sql.replace(/^\s*--.*$/gm, '')

const m034 = readSql('supabase/migrations/034_report_immutability_and_conflicts.sql')
const c034 = strip(m034)
const m000 = readSql('supabase/migrations/000_base_schema.sql')
const c000 = strip(m000)
const schema = readSql('supabase/schema.sql')

describe('migration 034 — columns', () => {
  it('exists', () => expect(m034.length).toBeGreaterThan(0))

  it('adds base_updated_at and finalized_at as nullable timestamptz, idempotently', () => {
    expect(c034).toMatch(/ADD COLUMN IF NOT EXISTS base_updated_at\s+timestamptz/)
    expect(c034).toMatch(/ADD COLUMN IF NOT EXISTS finalized_at\s+timestamptz/)
    expect(c034).not.toMatch(/base_updated_at\s+timestamptz\s+NOT NULL/i)
    expect(c034).not.toMatch(/finalized_at\s+timestamptz\s+NOT NULL/i)
  })

  it('backfills finalized_at only where it is null (re-runnable)', () => {
    expect(c034).toMatch(/SET finalized_at =[\s\S]*WHERE finalized_at IS NULL/)
  })

  it('is additive: drops no table, column or constraint and retypes nothing', () => {
    expect(c034).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i)
    expect(c034).not.toMatch(/ALTER\s+COLUMN/i)
  })
})

describe('migration 034 — multi-device conflict check (H5)', () => {
  it('raises when a non-null base_updated_at disagrees with the stored updated_at', () => {
    expect(c034).toMatch(/NEW\.base_updated_at IS NOT NULL/)
    expect(c034).toMatch(/OLD\.updated_at <> NEW\.base_updated_at/)
    expect(c034).toMatch(/RAISE EXCEPTION 'ATMOSFLOW_CONFLICT[\s\S]*?USING ERRCODE = 'check_violation'/)
  })

  it('only compares on UPDATE and always clears the token so it never persists', () => {
    expect(c034).toMatch(/TG_OP = 'UPDATE'/)
    expect(c034).toMatch(/NEW\.base_updated_at := NULL/)
  })

  it('installs the trigger idempotently, before insert or update', () => {
    expect(c034).toMatch(/CREATE OR REPLACE FUNCTION public\.assessments_check_base_updated_at\(\)/)
    expect(c034).toMatch(/DROP TRIGGER IF EXISTS assessments_check_base_updated_at ON public\.assessments/)
    expect(c034).toMatch(/CREATE TRIGGER assessments_check_base_updated_at\s+BEFORE INSERT OR UPDATE ON public\.assessments/)
  })
})

describe('migration 034 — issued reports are immutable (M4)', () => {
  it('guards on the 027 status vocabulary', () => {
    expect(REPORT_STATUS.REVIEWED).toBe('reviewed')
    expect(REPORT_STATUS.FINAL).toBe('final')
    expect(REPORT_STATUS.DRAFT).toBe('draft')
    expect(c034).toMatch(/OLD\.report_status IN \('reviewed', 'final'\)/)
    expect(c034).toMatch(/NEW\.report_status IS DISTINCT FROM 'draft'/)
  })

  it('rejects changes to payload, photos, zones and composite', () => {
    for (const col of ['payload', 'photos', 'zones', 'composite']) {
      expect(c034).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`))
    }
    expect(c034).toMatch(/RAISE EXCEPTION 'ATMOSFLOW_IMMUTABLE[\s\S]*?USING ERRCODE = 'check_violation'/)
  })

  it('installs the trigger idempotently, before update only', () => {
    expect(c034).toMatch(/CREATE OR REPLACE FUNCTION public\.assessments_guard_issued_report\(\)/)
    expect(c034).toMatch(/DROP TRIGGER IF EXISTS assessments_guard_issued_report ON public\.assessments/)
    expect(c034).toMatch(/CREATE TRIGGER assessments_guard_issued_report\s+BEFORE UPDATE ON public\.assessments/)
  })

  it('pins search_path and closes the RPC surface on both trigger functions (linter 0011 / 0028)', () => {
    expect((c034.match(/SET search_path = ''/g) || []).length).toBe(2)
    expect(c034).toMatch(/REVOKE EXECUTE ON FUNCTION public\.assessments_check_base_updated_at\(\) FROM PUBLIC, anon, authenticated/)
    expect(c034).toMatch(/REVOKE EXECUTE ON FUNCTION public\.assessments_guard_issued_report\(\) FROM PUBLIC, anon, authenticated/)
  })
})

describe('migration 000 — fresh-database bootstrap (H2)', () => {
  it('exists and creates only the profiles base (no assessments, no storage bucket)', () => {
    expect(m000.length).toBeGreaterThan(0)
    expect(c000).toMatch(/create table if not exists public\.profiles/i)
    expect(c000).not.toMatch(/create table[^;]*assessments/i)
    expect(c000).not.toMatch(/storage\.buckets|storage\.objects/i)
  })

  it('is idempotent: guarded policies, replaceable function, guarded trigger', () => {
    expect(c000).toMatch(/alter table public\.profiles enable row level security/i)
    const creates = (c000.match(/create policy/gi) || []).length
    const drops = (c000.match(/drop policy if exists/gi) || []).length
    expect(creates).toBeGreaterThan(0)
    expect(drops).toBe(creates)
    expect(c000).toMatch(/create or replace function public\.update_updated_at\(\)/i)
    expect(c000).toMatch(/set search_path = ''/i)
    expect(c000).toMatch(/drop trigger if exists profiles_updated_at on public\.profiles/i)
  })

  it('carries every profiles column migration 002 assumes', () => {
    for (const col of ['id uuid primary key', 'name text not null', 'created_at timestamptz', 'updated_at timestamptz']) {
      expect(c000).toContain(col)
    }
  })
})

describe('supabase/schema.sql is superseded', () => {
  it('no longer creates assessments (uuid id) or the photo bucket, and points at 000 / 014', () => {
    expect(strip(schema).trim()).toBe('')
    expect(schema).toMatch(/000_base_schema\.sql/)
    expect(schema).toMatch(/014_assessments_table\.sql/)
    expect(schema).toMatch(/SUPERSEDED/i)
  })
})
