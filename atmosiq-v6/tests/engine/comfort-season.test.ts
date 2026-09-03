/**
 * Thermal-comfort season determinism.
 *
 * Summer optimal is 73–79°F, winter 68.5–74°F, so a 76°F reading passes in one
 * band and fails in the other. The season used to come from the clock, which
 * meant the same survey produced a different report depending on the day it
 * was rendered.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { comfortSeason, scoreZone } from '../../src/engines/scoring'

describe('comfortSeason', () => {
  it('reads the assessment date, not the clock', () => {
    expect(comfortSeason('2026-07-15T12:00:00Z')).toBe('summer')
    expect(comfortSeason('2026-01-15T12:00:00Z')).toBe('winter')
    expect(comfortSeason(new Date('2026-06-01T12:00:00Z'))).toBe('summer')
  })

  it('places the May–October boundary as documented', () => {
    expect(comfortSeason('2026-04-30T12:00:00Z')).toBe('winter')
    expect(comfortSeason('2026-05-01T12:00:00Z')).toBe('summer')
    expect(comfortSeason('2026-10-31T12:00:00Z')).toBe('summer')
    expect(comfortSeason('2026-11-01T12:00:00Z')).toBe('winter')
  })

  it('returns no season with no date — it never reads the clock (audit H5)', () => {
    // The fallback used to be `new Date()`, which is how a report re-scored
    // in November applied the winter band to an October survey. A missing
    // date is now a stated gap, not a guess.
    expect(comfortSeason()).toBeNull()
    expect(comfortSeason(undefined)).toBeNull()
    expect(comfortSeason(null)).toBeNull()
    expect(comfortSeason('')).toBeNull()
  })

  it('treats an unparseable date as no date rather than as today', () => {
    expect(comfortSeason('not-a-date')).toBeNull()
  })

  it('reads a date-only string by its calendar month, whatever the time zone', () => {
    // resolveAssessmentDate returns YYYY-MM-DD; a UTC-midnight parse would
    // roll 1 May back into April west of Greenwich.
    expect(comfortSeason('2026-05-01')).toBe('summer')
    expect(comfortSeason('2026-11-01')).toBe('winter')
  })
})

describe('a zone with no survey date states the gap instead of guessing a band', () => {
  const env = (bldg: Record<string, unknown>) =>
    scoreZone({ zn: 'Z', su: 'office', tf: '70', pm: '5', co: '2' }, bldg)
      .cats.find((c: any) => c.l === 'Environment')?.r || []

  it('emits a data-gap finding for the comfort band and no verdict', () => {
    const r = env({})
    const temp = r.filter((f: any) => f.p === 'temperature')
    expect(temp).toHaveLength(1)
    expect(temp[0].dataGap).toBe(true)
    expect(temp[0].sev).toBe('info')
    expect(temp[0].t).toMatch(/assessment date not recorded/i)
    expect(temp[0].t).not.toMatch(/outside the/)
    expect(r.some((f: any) => f.sev === 'pass')).toBe(false)
  })

  it('caps confidence, the same way any other gap in the record does', () => {
    const full = { zn: 'Z', su: 'office', tf: '74', rh: '45', pm: '5', co: '2', co2: '600', cfm_person: '20', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    expect(scoreZone(full, { ...bldg, assessmentDate: '2026-07-15' }).confidence).toBe('High')
    expect(scoreZone(full, bldg).confidence).toBe('Medium')
  })

  it('resolves the date from a record passed through (presurvey / ts) as well as from assessmentDate', () => {
    const viaPresurvey = env({ presurvey: { ps_survey_date: '2026-07-15' } })
    const viaTs = env({ ts: '2026-07-15T14:00:00.000Z' })
    const viaField = env({ assessmentDate: '2026-07-15' })
    for (const r of [viaPresurvey, viaTs, viaField]) {
      const temp = r.filter((f: any) => f.p === 'temperature')
      expect(temp).toHaveLength(1)
      expect(temp[0].sev).toBe('medium')
      expect(temp[0].t).toContain('73–79°F summer')
    }
  })
})

describe('scoring is stable for a given assessment date', () => {
  // Re-pinned when the invented optimal/acceptable ladder was removed. The
  // bands are now one per season — winter 68–76 °F, summer 73–79 °F — so the
  // reading that exposes seasonal drift is one INSIDE one band and OUTSIDE
  // the other. 70 °F is comfortable in winter clothing and cool in summer
  // clothing, which is the whole reason the standard splits by clo.
  const zoneAt = (assessmentDate?: string, tf = '76') =>
    scoreZone({ zn: 'Z', su: 'office', tf, pm: '5', co: '2' },
      assessmentDate ? { assessmentDate } : {})

  const envFindings = (assessmentDate?: string, tf?: string) =>
    (zoneAt(assessmentDate, tf).cats.find((c: any) => c.l === 'Environment')?.r || [])
      .filter((f: any) => String(f.t).startsWith('Temperature'))

  it('gives the same answer for a July survey whatever today is', () => {
    const july = envFindings('2026-07-15T12:00:00Z')
    expect(july.map((f: any) => f.sev)).toEqual(envFindings('2026-07-15T12:00:00Z').map((f: any) => f.sev))
    // 76°F is within the summer band (73–79), so no temperature finding at
    // all. `high` is additionally impossible now: ASHRAE 55 is a comfort
    // consensus standard and its criterion class caps at `medium`.
    expect(july).toEqual([])
  })

  it('scores the same reading differently in winter — which is why the date must travel', () => {
    const jan = envFindings('2026-01-15T12:00:00Z', '70')
    const jul = envFindings('2026-07-15T12:00:00Z', '70')
    expect(JSON.stringify(jan)).not.toBe(JSON.stringify(jul))
    // Named rather than merely different, so a future band change cannot make
    // this pass for the wrong reason.
    expect(jan).toEqual([])
    expect(jul).toHaveLength(1)
    expect(jul[0].sev).toBe('medium')
    expect(jul[0].t).toContain('73–79°F summer')
  })
})
