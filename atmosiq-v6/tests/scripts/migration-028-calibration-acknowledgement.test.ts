/**
 * Migration 028 — calibration acknowledgement.
 *
 * The DB side runs against real Postgres in CI. What is pinned here is
 * the set of properties that, if violated, would only be discovered
 * after the migration had already run against production data:
 *
 *   • ADDITIVE ONLY, like 027. `assessments.status` and the lifecycle
 *     columns are read across the storage layer; dropping or retyping
 *     anything breaks the dashboard and history simultaneously.
 *   • NO BACKFILL. Every assessment finalized before this shipped was
 *     finalized with no acknowledgement recorded, because none was
 *     captured. Writing one now would fabricate a professional
 *     judgement in an audit trail — precisely the failure this column
 *     exists to prevent.
 *   • It does not collide with an existing migration number. A reused
 *     number means one of the two silently never runs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const FILE = path.resolve('supabase/migrations/028_calibration_acknowledgement.sql')
const sql = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
/** Comment-free SQL, so prose in the header never satisfies an assertion. */
const code = sql.replace(/^\s*--.*$/gm, '')

describe('migration 028 exists and is wired into the sequence', () => {
  it('is present', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('is the only migration numbered 028', () => {
    const clashes = readdirSync(path.resolve('supabase/migrations'))
      .filter((f) => f.startsWith('028') && f.endsWith('.sql'))
    expect(clashes).toEqual(['028_calibration_acknowledgement.sql'])
  })
})

describe('additive only', () => {
  it('drops nothing', () => {
    expect(code).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i)
  })

  it('retypes and renames nothing', () => {
    expect(code).not.toMatch(/ALTER\s+COLUMN/i)
    expect(code).not.toMatch(/RENAME/i)
  })

  it('touches neither the legacy status column nor the lifecycle columns', () => {
    expect(code).not.toMatch(/SET\s+status\s*=/i)
    expect(code).not.toMatch(/SET\s+report_status\s*=/i)
    expect(code).not.toMatch(/SET\s+report_profile\s*=/i)
  })

  it('adds the column with IF NOT EXISTS so a re-run is safe', () => {
    const adds = code.match(/ADD COLUMN[^,;]*/gi) || []
    expect(adds.length).toBeGreaterThan(0)
    for (const a of adds) {
      expect(a, `missing IF NOT EXISTS: ${a.trim()}`).toMatch(/IF NOT EXISTS/i)
    }
  })
})

describe('the column', () => {
  it('adds calibration_acknowledgement to assessments as jsonb', () => {
    expect(code).toMatch(/ALTER TABLE public\.assessments/i)
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS\s+calibration_acknowledgement\s+JSONB/i)
  })

  it('is nullable — NULL is the true statement for an unacknowledged assessment', () => {
    // Scoped to the ADD COLUMN clause: the partial index legitimately
    // says "IS NOT NULL", and a whole-file match would read that as a
    // column constraint.
    const add = (code.match(/ADD COLUMN IF NOT EXISTS\s+calibration_acknowledgement[^;]*/i) || [''])[0]
    expect(add).toBeTruthy()
    expect(add).not.toMatch(/NOT NULL/i)
  })

  it('documents itself in the database, not only in the repo', () => {
    expect(code).toMatch(/COMMENT ON COLUMN public\.assessments\.calibration_acknowledgement/i)
  })
})

describe('no backfill', () => {
  it('writes no rows at all', () => {
    expect(code).not.toMatch(/\bUPDATE\b/i)
    expect(code).not.toMatch(/\bINSERT\b/i)
  })

  it('invents no default acknowledgement', () => {
    expect(code).not.toMatch(/DEFAULT\s*'\{/i)
    expect(code).not.toMatch(/calibration_acknowledgement[^;]*DEFAULT/i)
  })
})

describe('query support', () => {
  it('indexes the "everything issued with an instrument exception" review query', () => {
    expect(code).toMatch(/CREATE INDEX IF NOT EXISTS assessments_calibration_ack_idx/i)
  })

  it('keeps the index partial so unacknowledged rows cost nothing', () => {
    expect(code).toMatch(/WHERE calibration_acknowledgement IS NOT NULL/i)
  })
})
