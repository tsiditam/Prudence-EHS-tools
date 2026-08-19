/**
 * Survey date vs finalize timestamp.
 *
 * `ts` is stamped when a report is finalized. The survey may have been days
 * earlier — and if the two fall either side of a month boundary, the ASHRAE 55
 * comfort season flips with them. Reports printed `ts` as the "Assessment
 * Date", and scoring read the clock; both now resolve the entered survey date.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { resolveAssessmentDate, formatAssessmentDate } from '../../src/utils/assessmentDate'
// @ts-expect-error — JS module without TS types
import { scoreZone } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { Q_PRESURVEY } from '../../src/constants/questions'

describe('resolveAssessmentDate', () => {
  it('prefers the entered survey date over the finalize timestamp', () => {
    expect(resolveAssessmentDate({
      presurvey: { ps_survey_date: '2026-04-28' },
      ts: '2026-05-02T09:00:00.000Z',
    })).toBe('2026-04-28')
  })

  it('falls back to ts for records predating the field', () => {
    expect(resolveAssessmentDate({ ts: '2026-05-02T09:00:00.000Z' })).toBe('2026-05-02')
    expect(resolveAssessmentDate({ presurvey: {}, ts: '2026-05-02T09:00:00.000Z' })).toBe('2026-05-02')
  })

  it('ignores blank and unparseable entries rather than trusting them', () => {
    expect(resolveAssessmentDate({ presurvey: { ps_survey_date: '   ' }, ts: '2026-05-02T09:00:00Z' })).toBe('2026-05-02')
    expect(resolveAssessmentDate({ presurvey: { ps_survey_date: 'last tuesday' }, ts: '2026-05-02T09:00:00Z' })).toBe('2026-05-02')
    expect(resolveAssessmentDate({})).toBeNull()
    expect(resolveAssessmentDate(undefined as never)).toBeNull()
  })

  it('formats for report chrome without drifting a day across timezones', () => {
    // Parsed at midday so a UTC-negative offset cannot roll it back.
    expect(formatAssessmentDate({ presurvey: { ps_survey_date: '2026-04-28' } })).toBe('April 28, 2026')
  })
})

describe('the survey date is captured at intake', () => {
  it('exists as a required presurvey field', () => {
    const q = Q_PRESURVEY.find((x: any) => x.id === 'ps_survey_date')
    expect(q).toBeDefined()
    expect(q.t).toBe('date')
    expect(q.req).toBe(1)
  })
})

describe('the date reaches scoring', () => {
  // 76°F: inside the summer band (73–79), outside winter optimal (68.5–74).
  const tempFindings = (assessmentDate?: string) =>
    (scoreZone({ zn: 'Z', su: 'office', tf: '76', pm: '5', co: '2' },
      assessmentDate ? { assessmentDate } : {})
      .cats.find((c: any) => c.l === 'Environment')?.r || [])
      .filter((f: any) => String(f.t).startsWith('Temperature'))

  it('scores an April survey on the winter band even when finalized in May', () => {
    const april = tempFindings('2026-04-28')
    const may = tempFindings('2026-05-02')
    expect(JSON.stringify(april)).not.toBe(JSON.stringify(may))
  })

  it('is stable for the same survey date regardless of when it runs', () => {
    expect(JSON.stringify(tempFindings('2026-07-15')))
      .toBe(JSON.stringify(tempFindings('2026-07-15')))
  })
})
