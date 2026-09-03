/**
 * Render determinism (audit 2026-09, H6).
 *
 * The same input rendered under two different clocks produces identical
 * findings and an identical report body; only the generated-at stamp
 * (`reportDate`, and the signature line that quotes it) may differ. The
 * clock reaches the model through `opts.now`; nothing on the render path
 * reads `Date.now()` or `new Date()` on its own.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { assembleRenderModel, buildReportModel } from '../../src/report/reportModel'

const BLDG = { fn: 'Determinism Plaza', hm: 'Within 6 months', assessmentDate: '2026-04-28' }
const ZONES = [
  { zn: 'Open Office', su: 'office', co2: '1180', co: '12', tf: '70', rh: '65', pm: '20', cx: 'No complaints' },
  { zn: 'Conference', su: 'conference', co2: '900', co: '2', tf: '74', rh: '45', pm: '5', mi: 'Small (< 10 sq ft)' },
]

function input() {
  const zoneScores = ZONES.map((z) => scoreZone(z, BLDG))
  return {
    id: 'rpt-det-1', building: BLDG, presurvey: { ps_survey_date: '2026-04-28' }, zones: ZONES, zoneScores,
    comp: summarizeAssessment(zoneScores), recs: { imm: ['Do A'], eng: [], adm: [], mon: [] },
    profile: { name: 'T', certs: ['CSP'] }, ts: '2026-05-02T09:00:00.000Z',
  }
}

const NOW_A = new Date('2026-05-03T10:00:00Z')
const NOW_B = new Date('2027-01-15T10:00:00Z')

const stripStamps = (m: any) => {
  const c = JSON.parse(JSON.stringify(m))
  delete c.review.signatureMeta   // "Report ID … · <reportDate>"
  return c
}

describe('the same input renders identically under different clocks', () => {
  it('findings are byte-identical', () => {
    const a = assembleRenderModel(input(), { now: NOW_A })
    const b = assembleRenderModel(input(), { now: NOW_B })
    expect(JSON.stringify(a.findings)).toBe(JSON.stringify(b.findings))
    expect(JSON.stringify(a.findingsAtGlance)).toBe(JSON.stringify(b.findingsAtGlance))
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results))
  })

  it('the report body is identical except the generated-at stamp', () => {
    const a = assembleRenderModel(input(), { now: NOW_A })
    const b = assembleRenderModel(input(), { now: NOW_B })
    expect(a.review.signatureMeta).toContain('May 3, 2026')
    expect(b.review.signatureMeta).toContain('January 15, 2027')
    expect(JSON.stringify(stripStamps(a))).toBe(JSON.stringify(stripStamps(b)))
  })

  it('the assessment date is the survey date, whatever the clock says', () => {
    for (const now of [NOW_A, NOW_B]) {
      const rd = buildReportModel(input(), { now })
      expect(rd.reportMeta.assessmentDate).toBe('April 28, 2026')
      expect(rd.reportMeta.reportId).toBe('rpt-det-1')
    }
  })

  it('the no-id fallback and the undated fallback read the injected clock, not the real one', () => {
    const undated = { ...input(), id: undefined, presurvey: {}, ts: undefined }
    const a = buildReportModel(undated, { now: NOW_A })
    const b = buildReportModel(undated, { now: NOW_A })
    expect(a.reportMeta.reportId).toBe(b.reportMeta.reportId)
    expect(a.reportMeta.reportId).toMatch(/^AIQ-/)
    expect(a.reportMeta.assessmentDate).toBe('May 3, 2026')
    expect(a.reportMeta.reportDate).toBe('May 3, 2026')
  })

  it('the winter/summer band follows the survey date, not the render date', () => {
    // 70°F in an April survey is inside the winter band; rendered in July it
    // must still be. The old paramOutcome always used the summer band.
    const jul = assembleRenderModel(input(), { now: new Date('2026-07-20T10:00:00Z') })
    const t = jul.findingsAtGlance.find((g: any) => g.parameter === 'Temperature')
    expect(t.outcome).toBe('ok')
  })
})
