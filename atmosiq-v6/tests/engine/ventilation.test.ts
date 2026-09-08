/**
 * Ventilation engine — required outdoor air (ASHRAE 62.1 VRP), delivered
 * estimates (steady-state CO₂ and decay), and the comparison. Pins the
 * arithmetic against hand-worked figures and the invariants the tool relies
 * on: the requirement reads the same Rp/Ra table scoring.js uses; every
 * estimate says it is one; a decay fit recovers the ACH it was generated
 * from; and the comparison never asserts compliance.
 */
import { describe, it, expect } from 'vitest'
import { STD } from '../../src/constants/standards'
import { G_CFM_PER_PERSON, MIN_DIFFERENTIAL_PPM } from '../../src/utils/ventilation'
import {
  SPACE_TYPES, EZ_PRESETS, ACTIVITY_LEVELS, generationCfm,
  requiredOutdoorAir, steadyStateDelivery, decayTwoPoint, decayFromSeries, achToCfm, compareDelivery,
} from '../../src/engines/ventilation'

describe('requiredOutdoorAir — ASHRAE 62.1 VRP', () => {
  it('computes Vbz = Rp·Pz + Ra·Az and Voz = Vbz / Ez for an office', () => {
    const r = requiredOutdoorAir({ spaceType: 'office', occupants: 10, areaSqft: 1000, ez: 1.0 })!
    // 5 × 10 + 0.06 × 1000 = 110 cfm
    expect(r.vbz).toBe(110)
    expect(r.voz).toBe(110)
    expect(r.perPerson).toBe(11)
    expect(r.partial).toBe(false)
  })

  it('divides by Ez, so a warm-air ceiling system (0.8) needs more zone air', () => {
    const r = requiredOutdoorAir({ spaceType: 'office', occupants: 10, areaSqft: 1000, ez: 0.8 })!
    expect(r.voz).toBe(137.5)
  })

  it('reads the same Rp / Ra table the scoring engine applies', () => {
    for (const t of SPACE_TYPES) {
      expect(t.pp).toBe(STD.v.oa[t.key].pp)
      expect(t.ps).toBe(STD.v.oa[t.key].ps)
    }
  })

  it('handles enclosed parking, whose people rate is a genuine zero', () => {
    const r = requiredOutdoorAir({ spaceType: 'parking', occupants: 0, areaSqft: 2000 })!
    expect(r.rp).toBe(0)
    expect(r.vbz).toBe(1500)
    expect(r.perPerson).toBeNull()
  })

  it('flags a one-term result as partial, and returns null with no terms', () => {
    expect(requiredOutdoorAir({ spaceType: 'classroom', occupants: 25 })!.partial).toBe(true)
    expect(requiredOutdoorAir({ spaceType: 'classroom' })).toBeNull()
    expect(requiredOutdoorAir({ spaceType: 'not-a-space', occupants: 5 })).toBeNull()
  })

  it('accepts comma-formatted numbers from the inputs', () => {
    expect(requiredOutdoorAir({ spaceType: 'office', occupants: '10', areaSqft: '1,000' })!.vbz).toBe(110)
  })

  it('offers only Ez presets in the 62.1 Table 6-4 range', () => {
    for (const p of EZ_PRESETS) { expect(p.ez).toBeGreaterThanOrEqual(0.8); expect(p.ez).toBeLessThanOrEqual(1.2) }
  })
})

describe('steadyStateDelivery — CO₂ mass balance', () => {
  it('matches the app-wide constant: 0.0084 cfm at 1.2 met over a 700 ppm differential ≈ 12 cfm/person', () => {
    const r = steadyStateDelivery({ indoorPpm: 1120, outdoorPpm: 420 })!
    expect(r.cfmPerPerson).toBe(12)
    expect(r.delta).toBe(700)
    expect(r.method).toBe('steady_state')
    expect(r.low).toBeLessThan(r.cfmPerPerson)
    expect(r.high).toBeGreaterThan(r.cfmPerPerson)
  })

  it('scales the generation rate with metabolic rate', () => {
    expect(generationCfm(1.2)).toBeCloseTo(G_CFM_PER_PERSON, 6)
    expect(generationCfm(2.4)).toBeCloseTo(G_CFM_PER_PERSON * 2, 6)
    const sed = steadyStateDelivery({ indoorPpm: 1120, outdoorPpm: 420, met: 1.2 })!
    const mod = steadyStateDelivery({ indoorPpm: 1120, outdoorPpm: 420, met: 2.0 })!
    expect(mod.cfmPerPerson).toBeGreaterThan(sed.cfmPerPerson)
    expect(ACTIVITY_LEVELS.map((a) => a.met)).toEqual([1.2, 1.6, 2.0])
  })

  it('refuses a differential below the reliability floor with a reason, not a number', () => {
    const r = steadyStateDelivery({ indoorPpm: 440, outdoorPpm: 420 })!
    expect(r.error).toMatch(new RegExp(`${MIN_DIFFERENTIAL_PPM} ppm`))
    expect((r as { cfmPerPerson?: number }).cfmPerPerson).toBeUndefined()
  })

  it('returns null for non-numeric input', () => {
    expect(steadyStateDelivery({ indoorPpm: '', outdoorPpm: 420 })).toBeNull()
  })

  it('states its assumptions and never calls itself a measurement', () => {
    const r = steadyStateDelivery({ indoorPpm: 1120, outdoorPpm: 420 })!
    expect(r.assumptions.length).toBeGreaterThanOrEqual(3)
    expect(r.citation).toMatch(/ASTM D6245/)
    expect(r.citation).not.toMatch(/compli/i)
  })
})

describe('decay method', () => {
  it('two-point: recovers ACH from an exponential decay', () => {
    // C(t) = Cout + (C0 − Cout)·e^(−ACH·t); ACH = 2, t = 0.5 h → 420 + 800·e^(−1)
    const ct = 420 + 800 * Math.exp(-1)
    const r = decayTwoPoint({ startPpm: 1220, endPpm: ct, outdoorPpm: 420, minutes: 30 })!
    expect(r.ach).toBeCloseTo(2, 2)
    expect(r.method).toBe('decay')
  })

  it('two-point: rejects a rising trace, a reading at outdoor, and zero time', () => {
    expect(decayTwoPoint({ startPpm: 700, endPpm: 900, outdoorPpm: 420, minutes: 30 })!.error).toMatch(/falling/)
    expect(decayTwoPoint({ startPpm: 900, endPpm: 420, outdoorPpm: 420, minutes: 30 })!.error).toMatch(/above outdoor/)
    expect(decayTwoPoint({ startPpm: 900, endPpm: 700, outdoorPpm: 420, minutes: 0 })!.error).toMatch(/positive/)
  })

  it('series: least-squares fit recovers the generating ACH with r² ≈ 1', () => {
    const ach = 1.5, cout = 420
    const points = Array.from({ length: 13 }, (_, i) => ({ t: i * 5 * 60000, co2: cout + 900 * Math.exp(-ach * (i * 5) / 60) }))
    const r = decayFromSeries(points, cout)!
    expect(r.ach).toBeCloseTo(ach, 2)
    expect(r.r2).toBeGreaterThan(0.999)
    expect(r.n).toBe(13)
  })

  it('series: needs four readings above outdoor and a falling trace', () => {
    expect(decayFromSeries([{ t: 0, co2: 900 }, { t: 60000, co2: 800 }], 420)!.error).toMatch(/four readings/)
    const rising = Array.from({ length: 6 }, (_, i) => ({ t: i * 60000, co2: 600 + i * 50 }))
    expect(decayFromSeries(rising, 420)!.error).toMatch(/does not fall/)
  })

  it('achToCfm converts with room volume and divides by occupants', () => {
    // 2 ACH × 6000 ft³ / 60 = 200 cfm; 10 people → 20 cfm/person
    expect(achToCfm(2, 6000, 10)).toEqual({ cfm: 200, cfmPerPerson: 20 })
    expect(achToCfm(2, 6000)!.cfmPerPerson).toBeNull()
    expect(achToCfm(2, 0)).toBeNull()
  })
})

describe('compareDelivery', () => {
  it('bands the ratio and words every level as an estimate', () => {
    const below = compareDelivery({ requiredPerPerson: 11, deliveredPerPerson: 6 })!
    const near = compareDelivery({ requiredPerPerson: 11, deliveredPerPerson: 10 })!
    const meets = compareDelivery({ requiredPerPerson: 11, deliveredPerPerson: 14 })!
    expect(below.level).toBe('below')
    expect(near.level).toBe('near')
    expect(meets.level).toBe('meets')
    for (const c of [below, near, meets]) {
      expect(c.statement).toMatch(/estimate/i)
      // Never a compliance determination — that is the professional's call.
      expect(c.statement).not.toMatch(/compliant|noncompliant|violat/i)
    }
  })

  it('returns null without both sides', () => {
    expect(compareDelivery({ requiredPerPerson: null, deliveredPerPerson: 10 })).toBeNull()
    expect(compareDelivery({ requiredPerPerson: 0, deliveredPerPerson: 10 })).toBeNull()
  })
})
