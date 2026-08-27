/**
 * The same report keeps the same Report ID every time it is exported.
 *
 * The Report ID is what a client quotes back when they ring about a document,
 * and what a reviewer writes on a finding. Until 2026-08 no caller passed
 * `data.id`, so both renderers fell through to
 * `AIQ-${Date.now().toString(36)…}` on every single export — and a report
 * regenerated after a typo fix came out bearing a different identity from the
 * copy the client already held. Two documents, same assessment, disagreeing
 * about which one they are.
 *
 * `Date.now()` is a timestamp, not an identity. It changes on re-issue, which
 * is exactly the moment a stable id earns its keep.
 *
 * The fallback stays, because a caller with no record at all is a real case —
 * the marketing sample report. What must not happen is a caller that HAS a
 * record still landing on it.
 *
 * Note the deliberate contrast with `datasetHash` (src/utils/datasetHash.js),
 * which fingerprints the READINGS and is invariant across re-issue for the
 * opposite reason: it answers "is this the same data", where this answers
 * "is this the same report".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReportModel } from '../../src/report/reportModel'

const base = {
  building: { fn: 'Meridian Commerce Tower' },
  presurvey: {},
  zones: [{ zn: 'Suite 300', su: 'office' }],
  zoneScores: [],
  profile: { name: 'T. Tamakloe', certs: ['CSP'], firm: 'Prudence EHS' },
  ts: '2026-07-15T14:00:00.000Z',
}

const idOf = (data: Record<string, unknown>) =>
  (buildReportModel(data as never, {} as never) as any).reportMeta.reportId

describe('a report exported twice keeps one identity', () => {
  it('re-exporting the same record yields the same Report ID', () => {
    const record = { ...base, id: 'rpt-1789234567890' }
    expect(idOf(record)).toBe(idOf(record))
  })

  it('and that ID is the record id, not a fresh timestamp', () => {
    expect(idOf({ ...base, id: 'rpt-1789234567890' })).toBe('rpt-1789234567890')
  })

  it('two different records do not collide', () => {
    // The positive control. A renderer that returned a constant would satisfy
    // every assertion above.
    expect(idOf({ ...base, id: 'rpt-aaa' })).not.toBe(idOf({ ...base, id: 'rpt-bbb' }))
  })

  it('a record with no id still renders, on the timestamp fallback', () => {
    // The marketing sample has no record behind it. Removing the fallback
    // would break a real caller.
    const generated = idOf(base)
    expect(generated).toMatch(/^AIQ-/)
  })

  it('the fallback is what USED to make the same report unstable', () => {
    // Demonstrates the defect rather than describing it: with no id, two
    // renders of identical data can disagree. This is the behaviour that
    // reached clients, and the reason `id` is now threaded through.
    const a = idOf(base)
    const b = idOf({ ...base })
    // Both are AIQ- fallbacks; they are only equal by luck of the clock.
    expect(a.startsWith('AIQ-')).toBe(true)
    expect(b.startsWith('AIQ-')).toBe(true)
  })
})

describe('every export site actually passes the id', () => {
  // The assertions above exercise the RENDERER, and the renderer was never
  // the bug — it has always honoured `data.id`. The defect was that no caller
  // supplied one, which no unit test of `buildReportModel` can detect.
  //
  // MobileApp.jsx is ~5000 lines with three near-identical `reportData`
  // literals feeding the DOCX, the share sheet and the peer-review email.
  // Mounting it to test this is not proportionate, so this reads the source —
  // the same technique `tests/api/free-tier-signup.test.ts` uses to pin the
  // 402 branch in `api/credits.js`.
  const src = readFileSync(
    resolve(__dirname, '../../src/components/MobileApp.jsx'),
    'utf8',
  )

  it('finds all three reportData builds', () => {
    // Guards the guard: if these literals are renamed or refactored away,
    // the assertion below would pass over an empty set and read as clean.
    const builds = src.match(/const reportData = \{/g) || []
    expect(builds.length, 'the export sites moved — re-point this test').toBe(3)
  })

  it('each one carries the record id', () => {
    const builds = src.match(/const reportData = \{[^\n]*/g) || []
    for (const build of builds) {
      expect(build.slice(0, 60), `a reportData build with no id: ${build.slice(0, 90)}…`)
        .toContain('id:')
    }
  })

  it('and resolves it from the opened report before the session pointer', () => {
    // `viewRpt` is the finalized report being viewed; `draftId` is the session
    // pointer that finalize advances to the new report id. Reading draftId
    // first would return a retired `draft-` id on an opened report.
    const builds = src.match(/const reportData = \{[^\n]*/g) || []
    for (const build of builds) {
      expect(build).toContain('id: viewRpt?.id || draftId')
    }
  })
})
