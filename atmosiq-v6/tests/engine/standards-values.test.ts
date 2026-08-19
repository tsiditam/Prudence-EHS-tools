/**
 * Published reference values, pinned to their primary sources.
 *
 * Each value here was verified against the citation in the comment. A change
 * to any of them is a change to what the engine concludes, so it should fail
 * loudly and be re-verified rather than drift quietly.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { STD } from '../../src/constants/standards'
// @ts-expect-error — JS module without TS types
import { hchoToUnit } from '../../src/utils/sensorThresholds'

describe('ventilation rates — ASHRAE 62.1 Table 6.2.2.1', () => {
  it('office is 5 cfm/person + 0.06 cfm/ft²', () => {
    expect(STD.v.oa.office).toEqual({ pp: 5, ps: 0.06 })
  })

  it('classroom carries the EPA Tools for Schools figure, not the ASHRAE one', () => {
    // Deliberate and worth stating plainly: 15 cfm/person is EPA IAQ Tools
    // for Schools guidance. ASHRAE 62.1 Table 6.2.2.1 gives 10 cfm/person +
    // 0.12 cfm/ft² for classrooms age 9 plus — EPA's figure traces to the
    // superseded 62-1989. The two differ by 50%, so whichever is used must
    // be cited as its own source and never as the other.
    expect(STD.v.oa.classroom).toEqual({ pp: 15, ps: 0.12 })
  })
})

describe('carbon monoxide', () => {
  it('EPA NAAQS 8-hour is 9 ppm (40 CFR 50.8)', () => {
    expect(STD.c.co.epa).toBe(9)
  })
  it('WHO 2010 indoor 1-hour is ~30 ppm (35 mg/m³)', () => {
    expect(STD.c.co.who1h).toBe(30)
  })
  it('OSHA PEL is 50 ppm and NIOSH REL 35 ppm — both 8-hr+ TWAs, not spot values', () => {
    expect(STD.c.co.osha).toBe(50)
    expect(STD.c.co.niosh).toBe(35)
  })
})

describe('formaldehyde', () => {
  it('OSHA PEL 0.75 ppm TWA and action level 0.5 ppm (29 CFR 1910.1048)', () => {
    expect(STD.c.hcho.osha).toBe(0.75)
    expect(STD.c.hcho.al).toBe(0.5)
  })

  it('WHO 2010 30-minute guideline is 0.1 mg/m³ ≈ 0.08 ppm', () => {
    expect(STD.c.hcho.who).toBeCloseTo(0.081, 3)
    // Round-trips to the published mass concentration.
    expect(hchoToUnit(STD.c.hcho.who, 'mg/m3')).toBeCloseTo(0.1, 2)
  })

  it('EPA IRIS RfC round-trips to the published 7 µg/m³ (final, Aug 2024)', () => {
    // Stored in ppm; the authoritative figure is the mass concentration.
    expect(hchoToUnit(STD.c.hcho.epaRfc, 'ug/m3')).toBeCloseTo(7.0, 1)
    // Guards the pre-2024 value: 0.008 ppm would resolve near 9.8 µg/m³.
    expect(hchoToUnit(STD.c.hcho.epaRfc, 'ug/m3')).toBeLessThan(8)
  })
})

describe('particulate matter', () => {
  it('EPA NAAQS: 35 µg/m³ 24-hour, 9.0 µg/m³ annual (2024, 89 FR 16202)', () => {
    expect(STD.c.pm25.epa).toBe(35)
    expect(STD.c.pm25.epaAnnual).toBe(9)
  })
  it('WHO 2021 AQG: 15 µg/m³ 24-hour, 5 µg/m³ annual', () => {
    expect(STD.c.pm25.who).toBe(15)
    expect(STD.c.pm25.whoAnnual).toBe(5)
  })
})

describe('carbon dioxide', () => {
  it('carries the ventilation differential, not a health limit', () => {
    // ASHRAE 62.1 sets no indoor CO2 limit (Persily 2021, ASHRAE Journal
    // 63(2):74-75). The 700 ppm figure is an outdoor differential surrogate.
    expect(STD.v.co2.diff).toBe(700)
    expect(STD.v.co2.base).toBe(420)
  })
})
