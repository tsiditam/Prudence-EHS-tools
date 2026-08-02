/**
 * Migration 027 — report lifecycle.
 *
 * The DB side runs against real Postgres in CI. What is pinned here is
 * the set of properties that, if violated, would be discovered only after
 * the migration had already run against production data:
 *
 *   • ADDITIVE ONLY. `assessments.status` is read by six call sites in
 *     supabaseStorage.js to split drafts from reports. Dropping or
 *     retyping it — or any other column — breaks the dashboard, the
 *     history view and the full-sync index simultaneously.
 *   • The backfill maps complete → final and draft → draft, and marks
 *     nothing as professionally reviewed. Backfilling a review that never
 *     happened would fabricate an approval in an audit trail.
 *   • The enums are constrained in the database, not only in the client.
 *   • The backfill is idempotent, so a re-run cannot stomp a report that
 *     has since moved through the lifecycle.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import {
  REPORT_PROFILE_VALUES,
  REPORT_STATUS_VALUES,
} from '../../src/constants/reportLifecycle'

const FILE = path.resolve('supabase/migrations/027_report_lifecycle.sql')
const sql = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
/** Comment-free SQL, so prose in the header never satisfies an assertion. */
const code = sql.replace(/^\s*--.*$/gm, '')

describe('migration 027 exists and is wired into the sequence', () => {
  it('is present', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  it('does not collide with an existing migration number', () => {
    // 025 and 026 were already taken; picking a used number means one of
    // the two silently never runs.
    for (const n of ['025', '026']) {
      const clash = path.resolve(`supabase/migrations/${n}_report_lifecycle.sql`)
      expect(existsSync(clash), `${n} should not be this migration`).toBe(false)
    }
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

  it('leaves the legacy status column alone', () => {
    // Any write to `status` in a DDL position would be the regression.
    expect(code).not.toMatch(/ADD\s+COLUMN[^;]*\bstatus\b\s+TEXT/i)
    expect(code).not.toMatch(/SET\s+status\s*=/i)
  })

  it('adds every column with IF NOT EXISTS so a re-run is safe', () => {
    const adds = code.match(/ADD COLUMN[^,;]*/gi) || []
    expect(adds.length).toBeGreaterThan(0)
    for (const a of adds) {
      expect(a, `missing IF NOT EXISTS: ${a.trim()}`).toMatch(/IF NOT EXISTS/i)
    }
  })
})

describe('the columns the lifecycle needs', () => {
  const required = [
    'report_profile', 'report_status', 'reviewer_id',
    'review_date', 'approval_notes', 'approval_id', 'approved_version',
  ]

  it('adds all seven to assessments', () => {
    for (const col of required) {
      expect(code, `missing column ${col}`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i'))
    }
  })

  it('defaults new rows to a screening draft', () => {
    expect(code).toMatch(/report_profile\s+TEXT NOT NULL DEFAULT 'screening'/i)
    expect(code).toMatch(/report_status\s+TEXT NOT NULL DEFAULT 'draft'/i)
  })

  it('does not delete a reviewer’s approvals when the reviewer is deleted', () => {
    expect(code).toMatch(/reviewer_id\s+UUID REFERENCES public\.profiles\(id\) ON DELETE SET NULL/i)
    expect(code).not.toMatch(/reviewer_id[^,;]*ON DELETE CASCADE/i)
  })

  it('captures the reviewer identity a professional cover has to print', () => {
    for (const col of ['reviewer_credentials', 'reviewer_organization', 'approval_id']) {
      expect(code, `peer_reviews missing ${col}`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i'))
    }
  })
})

describe('enum constraints', () => {
  it('constrains both enums in the database', () => {
    expect(code).toMatch(/assessments_report_profile_chk/i)
    expect(code).toMatch(/assessments_report_status_chk/i)
  })

  it('lists exactly the values the client module defines', () => {
    // Drift between the CHECK and the constants is the failure mode:
    // the client offers a state the database rejects at write time.
    const profileChk = code.match(/report_profile IN \(([^)]+)\)/i)
    const statusChk = code.match(/report_status IN \(([^)]+)\)/i)
    expect(profileChk).not.toBeNull()
    expect(statusChk).not.toBeNull()

    const parse = (m: RegExpMatchArray | null) =>
      (m![1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, '')).sort()

    expect(parse(profileChk)).toEqual([...REPORT_PROFILE_VALUES].sort())
    expect(parse(statusChk)).toEqual([...REPORT_STATUS_VALUES].sort())
  })

  it('guards constraint creation so a re-run does not error', () => {
    expect(code).toMatch(/pg_constraint WHERE conname/i)
  })
})

describe('backfill', () => {
  it('maps complete → final and everything else → draft', () => {
    expect(code).toMatch(/CASE WHEN status = 'complete' THEN 'final' ELSE 'draft' END/i)
  })

  it('backfills every existing row as a screening assessment', () => {
    expect(code).toMatch(/SET report_profile = 'screening'/i)
  })

  it('never backfills a report as professionally reviewed', () => {
    // Those reports were issued with no recorded reviewer. Claiming
    // otherwise would invent an approval.
    const update = code.slice(code.search(/UPDATE public\.assessments/i))
    expect(update).not.toMatch(/'reviewed'/)
  })

  it('is idempotent — a re-run cannot stomp a report that has moved on', () => {
    const update = code.slice(code.search(/UPDATE public\.assessments/i))
    expect(update).toMatch(/WHERE report_status = 'draft'/i)
    expect(update).toMatch(/review_date IS NULL/i)
    expect(update).toMatch(/approval_id IS NULL/i)
  })
})

describe('query support', () => {
  it('indexes the dashboard filter and the reviewer queue', () => {
    expect(code).toMatch(/CREATE INDEX IF NOT EXISTS assessments_lifecycle_idx/i)
    expect(code).toMatch(/CREATE INDEX IF NOT EXISTS assessments_reviewer_idx/i)
  })
})
