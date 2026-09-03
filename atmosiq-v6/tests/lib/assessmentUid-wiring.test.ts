/**
 * The uid is wired where it has to be, and cannot be clobbered on the way
 * back down from the cloud.
 *
 * `assessmentUid.test.ts` proves the derivation is pure. That is necessary
 * and not sufficient — a perfect derivation is worthless if finalize
 * re-derives instead of carrying, or if a cloud restore overwrites a stamped
 * uid with null. Both of those re-identify an assessment, and under
 * per-report pricing a re-identified assessment is one the customer has to
 * buy again.
 *
 * MobileApp.jsx is ~5000 lines and mounting it to test three object literals
 * is not proportionate, so the wiring assertions read the source — the same
 * technique `tests/api/free-tier-signup.test.ts` uses on `api/credits.js`.
 * The cloud round-trip is testable directly and is tested directly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  fromCloudRow,
  toPayload,
  OPTIONAL_ASSESSMENT_COLUMNS,
  isUndefinedColumnError,
  isUniqueViolationError,
} from '../../src/utils/supabaseStorage'

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')

describe('finalize carries the uid rather than re-deriving it', () => {
  const src = read('src/components/MobileApp.jsx')

  it('the finalize record carries an assessmentUid', () => {
    const report = src.match(/const report = \{ id:rid,[^\n]*/)?.[0]
    expect(report, 'the finalize literal moved — re-point this test').toBeTruthy()
    expect(report).toContain('assessmentUid')
  })

  it('and resolves it from the record being finalized, not from the new id', () => {
    // `rid` is a BRAND-NEW rpt- id on a first finalize. Deriving from it here
    // would hand the assessment a different identity at exactly the moment it
    // becomes a deliverable — the one transition the uid exists to survive.
    expect(src).toMatch(/viewRpt\?\.assessmentUid \|\| priorBody\.assessmentUid/)
    expect(src, 'finalize must not derive from rid').not.toMatch(
      /assessmentUid = ensureAssessmentUid\(\{ id: rid \}\)/,
    )
  })

  it('the draft autosave stamps one', () => {
    const draft = src.match(/const draft = \{ \.\.\.prev,[^\n]*/)?.[0]
    expect(draft).toBeTruthy()
    expect(draft).toContain('assessmentUid: ensureAssessmentUid(')
  })

  it('both re-open paths backfill rather than mint', () => {
    // resumeDraft and openReport. openReport is how a customer re-downloads a
    // report they already own; minting there bills them twice.
    const backfills = src.match(/assessmentUid: ensureAssessmentUid\(/g) || []
    expect(backfills.length, 'expected autosave + resumeDraft + openReport').toBeGreaterThanOrEqual(3)
    expect(src).toMatch(/if \(!rpt\.assessmentUid\)/)
    expect(src).toMatch(/if \(!d\.assessmentUid\)/)
  })
})

describe('the cloud round-trip preserves it', () => {
  it('rides up inside the payload', () => {
    const out = toPayload({ id: 'rpt-1', assessmentUid: 'u-1', photos: { a: [1] } } as never) as any
    expect(out.assessmentUid).toBe('u-1')
    expect(out.photos).toBeUndefined()
  })

  it('comes back down from the payload branch', () => {
    const back = fromCloudRow({
      id: 'rpt-1',
      payload: { id: 'rpt-1', assessmentUid: 'u-1', building: {} },
    } as never) as any
    expect(back.assessmentUid).toBe('u-1')
  })

  it('comes back down from a legacy row via the column', () => {
    const back = fromCloudRow({ id: 'rpt-1', assessment_uid: 'u-2' } as never) as any
    expect(back.assessmentUid).toBe('u-2')
  })

  it('a cloud row WITHOUT one does not blank a local uid', () => {
    // fromCloudRow's output is spread over the local copy. An unconditional
    // key would push undefined/null over a stamped uid — re-identifying an
    // assessment the customer may already have paid for. Same discipline the
    // calibration acknowledgement already uses.
    const back = fromCloudRow({ id: 'rpt-1' } as never) as any
    expect('assessmentUid' in back).toBe(false)

    const local = { id: 'rpt-1', assessmentUid: 'u-keep' }
    expect({ ...local, ...back }.assessmentUid).toBe('u-keep')
  })
})

describe('the migration is safe on a project that is behind', () => {
  const sql = read('supabase/migrations/032_assessment_uid.sql')
  const storage = read('src/utils/supabaseStorage.js')

  it('adds the column without requiring a backfill', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS assessment_uid uuid/)
    expect(sql, 'a SQL backfill would be a second implementation of deriveLegacyUid')
      .not.toMatch(/UPDATE public\.assessments SET assessment_uid/)
  })

  it('scopes uniqueness to the user, since the uid is client-minted', () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*\(user_id, assessment_uid\)/)
  })

  it('an unmigrated project still syncs — the column is dropped on an undefined-column error', () => {
    // Writing a column that does not exist must not break all syncing. The
    // drop is keyed on the Postgres code for "undefined column" (42703, or
    // PostgREST's schema-cache form PGRST204) and only ever removes the
    // optional set — never on "any error" (audit H3).
    expect(OPTIONAL_ASSESSMENT_COLUMNS).toContain('assessment_uid')
    expect(isUndefinedColumnError({ code: '42703', message: 'column "assessment_uid" of relation "assessments" does not exist' })).toBe(true)
    expect(isUndefinedColumnError({ code: 'PGRST204', message: "Could not find the 'assessment_uid' column" })).toBe(true)
    expect(storage).toMatch(/isUndefinedColumnError\(error\)[\s\S]*delete row\[col\]/)
  })

  it('a unique violation on the uid is NOT "fixed" by dropping the column', () => {
    // 23505 means a stale draft- row still carries this uid (the finalize
    // deleted the draft locally only). Dropping assessment_uid would make the
    // upsert "succeed" as an unidentified report; the stale draft row is
    // deleted and the write retried with the uid intact instead.
    expect(isUniqueViolationError({ code: '23505' })).toBe(true)
    expect(isUndefinedColumnError({ code: '23505' })).toBe(false)
    expect(storage).toMatch(/isUniqueViolationError\(error\)[\s\S]*\.like\('id', 'draft-%'\)/)
    const uniqueBranch = storage.slice(storage.indexOf('isUniqueViolationError(error) &&'))
    expect(uniqueBranch.slice(0, uniqueBranch.indexOf('return { ok: false, error }'))).not.toMatch(/delete row/)
  })
})
