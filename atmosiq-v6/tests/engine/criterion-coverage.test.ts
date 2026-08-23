/**
 * Every parameter the engine judges must be judged against a REGISTRY
 * criterion — never a bare number from `STD`.
 *
 * CLAUDE.md has stated that rule since the criteria registry was built. This
 * file exists because the rule had no enforcement, and the two parameters that
 * escaped it are the two whose citations turned out to be wrong:
 *
 *   * Temperature carried an invented 67–82 °F "acceptable" band with a
 *     fabricated "optimal" tier inside it, both credited to ASHRAE 55-2023.
 *   * Relative humidity carried 30–60% credited to ASHRAE 55, a standard that
 *     expresses its upper humidity limit as a humidity ratio and dropped its
 *     lower limit entirely in 55-2013.
 *
 * That is not a coincidence and it is the finding worth encoding. Every
 * parameter governed by the registry travels with a class, an averaging period
 * and a checkable source, and not one of them was wrong. The two that lived as
 * bare numbers on `STD.t` had nowhere to carry any of that, so nothing could
 * check them — and for four months nothing did.
 *
 * The structural reason they were never brought in: the registry could only
 * express "value > threshold", and comfort is a range. The one shape the
 * registry could not hold is the one shape that went unaudited. Bands were
 * added in 2026-08 to close exactly that.
 */
import { describe, it, expect } from 'vitest'
import { CRITERIA, CRITERION_CLASS, AVERAGING, allCriteria, evaluateCriteria } from '../../src/constants/criteria'
import { scoreZone } from '../../src/engines/scoring'
import { STD } from '../../src/constants/standards'

/**
 * The parameter behind every finding `scoreZone` can emit with a `p` tag.
 * `p` is what downstream layers route on, so it is also the honest list of
 * "things this engine forms a judgement about".
 */
const findingsFor = (zone: Record<string, string>, assessmentDate = '2026-07-15') =>
  ((scoreZone({ zn: 'Z', su: 'office', ...zone } as never, { assessmentDate } as never) as never as any)
    .cats as any[]).flatMap((c: any) => c.r || [])

describe('no parameter is judged without a criterion', () => {
  // One reading per parameter, chosen to be OUT of range so the finding fires.
  const OUT_OF_RANGE: Record<string, Record<string, string>> = {
    temperature: { tf: '90' },
    rh: { rh: '85' },
    co2: { co2: '1800' },
    pm25: { pm: '60' },
    co: { co: '60' },
    tvoc: { tv: '4000' },
    hcho: { hc: '1.0' },
  }

  it.each(Object.entries(OUT_OF_RANGE))(
    '%s produces a finding that names the criterion it was judged against',
    (param, zone) => {
      const hit = findingsFor(zone).find((f: any) => f.p === param)
      expect(hit, `${param} produced no finding from ${JSON.stringify(zone)}`).toBeTruthy()
      // `cid` is this engine's key for it — `criterionId` is the reference-
      // profile layer's name for the same thing. Two names, one concept; the
      // engine's is the one a finding carries.
      expect(hit.cid, `${param} finding carries no cid`).toBeTruthy()

      // And that id must actually exist in the registry, with everything a
      // criterion is required to travel with.
      const all = allCriteria()
      const c = all.find((x: any) => x.id === hit.cid)
      expect(c, `${param} names criterion ${hit.cid}, which is not in the registry`).toBeTruthy()
      expect(AVERAGING[(c as any).averaging], `${hit.cid} averaging`).toBeTruthy()
      expect(CRITERION_CLASS[(c as any).class], `${hit.cid} class`).toBeTruthy()
      expect((c as any).source, `${hit.cid} source`).toBeTruthy()
    },
  )

  it('temperature and relative humidity are in the registry at all', () => {
    // The specific regression. Both were absent until 2026-08 and both were
    // wrong; an empty list here means one has been pulled back out.
    expect(CRITERIA.temp?.length, 'temp has no criteria').toBeGreaterThan(0)
    expect(CRITERIA.rh?.length, 'rh has no criteria').toBeGreaterThan(0)
  })
})

describe('a finding never outranks its criterion class', () => {
  const RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

  it.each([
    ['temperature', { tf: '95' }],
    ['temperature', { tf: '45' }],
    ['rh', { rh: '95' }],
    ['rh', { rh: '5' }],
    ['co2', { co2: '3000' }],
  ] as Array<[string, Record<string, string>]>)(
    '%s at %o stays within its class ceiling',
    (param, zone) => {
      const hit = findingsFor(zone).find((f: any) => f.p === param)
      expect(hit).toBeTruthy()
      const c: any = allCriteria().find((x: any) => x.id === hit.cid)
      const ceiling = CRITERION_CLASS[c.class].maxSeverity
      expect(RANK[hit.sev], `${param} ${hit.sev} exceeds ${c.class} ceiling ${ceiling}`)
        .toBeLessThanOrEqual(RANK[ceiling])
    },
  )

  it('the temperature finding is capped at medium, where it once raised high', () => {
    // The exact drift: scoreEnv wrote sev:'high' for four months while
    // comfort_consensus declared medium, and nothing connected the two
    // because the branch was not governed by a criterion at all.
    for (const tf of ['110', '30']) {
      const hit = findingsFor({ tf }).find((f: any) => f.p === 'temperature')
      expect(hit.sev, `${tf}°F`).toBe('medium')
    }
  })
})

describe('bands are evaluated from both sides', () => {
  it('fires below the floor and above the ceiling, and says which', () => {
    const below: any = evaluateCriteria('temp', STD.t.temp.summer.min - 5, 'screening_grab', { season: 'summer' })
    const above: any = evaluateCriteria('temp', STD.t.temp.summer.max + 5, 'screening_grab', { season: 'summer' })
    expect(below?.direction).toBe('below')
    expect(above?.direction).toBe('above')
    expect(below.statement).toContain('below the')
    expect(above.statement).toContain('above the')
    // A band criterion must never phrase a low reading as "above" — the word
    // was hard-coded into buildStatement until bands existed.
    expect(below.statement).not.toContain('above the')
  })

  it('is silent inside the band, at both edges', () => {
    // Inclusive bounds: a reading exactly on the floor or ceiling is inside.
    for (const v of [STD.t.temp.summer.min, STD.t.temp.summer.max]) {
      expect(evaluateCriteria('temp', v, 'screening_grab', { season: 'summer' }), `${v}°F`).toBeNull()
    }
  })

  it('a limit criterion still reports direction "above" and no band', () => {
    const hit: any = evaluateCriteria('co', 300, 'screening_grab')
    expect(hit).toBeTruthy()
    expect(hit.direction).toBe('above')
    expect(hit.criterion.band).toBeNull()
  })
})

describe('the seasonal criteria are two criteria, not one with a branch', () => {
  it('each declares its season and its own clothing assumption', () => {
    const summer: any = allCriteria().find((c: any) => c.id === 'temp_ashrae55_summer')
    const winter: any = allCriteria().find((c: any) => c.id === 'temp_ashrae55_winter')
    expect(summer.season).toBe('summer')
    expect(winter.season).toBe('winter')
    // The assumptions are part of the citation, not a footnote elsewhere.
    expect(summer.source).toMatch(/0\.5 clo/)
    expect(winter.source).toMatch(/1\.0 clo/)
    for (const c of [summer, winter]) {
      expect(c.source).toMatch(/1\.0–1\.3 met/)
      expect(c.source).toMatch(/ASHRAE Standard 55-2023/)
    }
  })

  it('the humidity criterion does not cite ASHRAE 55', () => {
    const rh: any = allCriteria().find((c: any) => c.id === 'rh_epa_moisture_control')
    expect(rh.source).toMatch(/EPA/)
    expect(rh.source).not.toMatch(/ASHRAE/i)
  })

  it('the engine picks the criterion matching the season it scored', () => {
    // 70°F: inside the winter band, below the summer band. If the engine ever
    // reached for the wrong season's criterion, the citation on the finding
    // would contradict the band it was compared against.
    const jul = findingsFor({ tf: '70' }, '2026-07-15').find((f: any) => f.p === 'temperature')
    const jan = findingsFor({ tf: '70' }, '2026-01-15').find((f: any) => f.p === 'temperature')
    expect(jul.cid).toBe('temp_ashrae55_summer')
    expect(jan).toBeUndefined()
  })
})
