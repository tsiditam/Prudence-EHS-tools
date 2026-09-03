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

  it('classroom carries the ASHRAE code basis, because that is what this field means', () => {
    // scoring.js reads STD.v.oa as `req` and reports "below ASHRAE 62.1
    // minimum (req)"; cfm < req * 0.5 is critical. Holding EPA Tools for
    // Schools' 15 cfm/person here reported a classroom at 12 as below the
    // ASHRAE minimum, when 12 exceeds the actual minimum of 10.
    //
    // The EPA target is not lost: buildingProfiles emits it as its own
    // low-severity finding for classrooms between 10 and 15 cfm/person.
    expect(STD.v.oa.classroom).toEqual({ pp: 10, ps: 0.12 })
  })
})

describe('carbon monoxide', () => {
  it('EPA NAAQS 8-hour is 9 ppm (40 CFR 50.8)', () => {
    expect(STD.c.co.epa).toBe(9)
  })
  it('WHO 2010 indoor 1-hour is ~30 ppm (35 mg/m³)', () => {
    expect(STD.c.co.who1h).toBe(30)
  })
  // Wording changed 2026-09 (AUDIT-2026-09 C6): a NIOSH REL is a TWA for up to a
  // 10-hour workday, not an 8-hour figure. The values are unchanged.
  it('OSHA PEL is 50 ppm (8-hr TWA) and NIOSH REL 35 ppm (10-hr TWA) — TWAs, not spot values', () => {
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
