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

  it('falls back to now when no date is given — a live walkthrough', () => {
    expect(['summer', 'winter']).toContain(comfortSeason())
    expect(['summer', 'winter']).toContain(comfortSeason(undefined))
  })

  it('treats an unparseable date as live rather than throwing', () => {
    expect(['summer', 'winter']).toContain(comfortSeason('not-a-date'))
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
