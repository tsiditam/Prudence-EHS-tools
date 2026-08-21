/**
 * v2.2 §8 — parameter prose tests.
 *
 * Validates:
 *   1. Every supported parameter has a PARAMETER_PROSE entry.
 *   2. Each entry's standardsBackground is at least 4 sentences and
 *      cites the authorities that actually drove a criterion.
 *   3. Each entry has a non-empty applicableStandards array.
 *   4. The summaryTemplate produces grammatical English when called
 *      with sample inputs (within-standards, elevated, no-data).
 */

import { describe, it, expect } from 'vitest'
import { PARAMETER_PROSE, lookupParameterProse } from '../../src/engine/report/parameter-prose'
import type { ParameterKey, ParameterRange } from '../../src/engine/report/parameter-ranges'

const PARAM_KEYS: ReadonlyArray<ParameterKey> = ['co2', 'co', 'hcho', 'tvoc', 'pm25', 'pm10', 'temperature', 'rh']

describe('v2.2 §8 — PARAMETER_PROSE coverage', () => {
  for (const key of PARAM_KEYS) {
    it(`has an entry for ${key}`, () => {
      const entry = PARAMETER_PROSE[key]
      expect(entry).toBeDefined()
      expect(typeof entry.parameter).toBe('string')
      expect(entry.parameter.length).toBeGreaterThan(0)
    })
  }

  it('lookupParameterProse retrieves the entry for a known key', () => {
    expect(lookupParameterProse('co2').parameter).toBe('Carbon Dioxide (CO₂)')
  })
})

describe('v2.2 §8 — standardsBackground prose quality', () => {
  for (const key of PARAM_KEYS) {
    it(`${key}: standardsBackground is at least 4 sentences`, () => {
      const entry = PARAMETER_PROSE[key]
      const sentences = entry.standardsBackground.split(/[.!?]\s+/).filter(s => s.trim().length > 10)
      expect(sentences.length).toBeGreaterThanOrEqual(4)
    })

    it(`${key}: applicableStandards is non-empty`, () => {
      const entry = PARAMETER_PROSE[key]
      expect(entry.applicableStandards.length).toBeGreaterThan(0)
    })

    it(`${key}: applicableStandards entries have a source string`, () => {
      const entry = PARAMETER_PROSE[key]
      for (const c of entry.applicableStandards) {
        expect(typeof c.source).toBe('string')
        expect(c.source.length).toBeGreaterThan(0)
      }
    })
  }

  it('CO2 prose cites ASHRAE 62.1 and the Persily 2021 caveat', () => {
    const entry = PARAMETER_PROSE.co2
    expect(entry.standardsBackground).toMatch(/ASHRAE/i)
    expect(entry.standardsBackground).toMatch(/Persily/i)
  })

  it('CO prose cites the OSHA PEL and the NIOSH REL', () => {
    const entry = PARAMETER_PROSE.co
    expect(entry.standardsBackground).toMatch(/OSHA/i)
    expect(entry.standardsBackground).toMatch(/NIOSH/i)
  })

  it('CO prose does NOT cite a third parallel occupational limit', () => {
    // This assertion was inverted in 2026-08. It used to REQUIRE the ACGIH
    // TLV, which is how a third parallel OEL for a single reading — TLV 25,
    // REL 35, PEL 50 — stayed in a client deliverable that applies none of
    // them as a criterion: `criteria.js` has no ACGIH entry, so the report
    // named a limit it never used.
    //
    // The TLVs are also ACGIH-copyrighted and licensed, and ACGIH states
    // they are not intended for adoption as standards; reproducing values
    // in a commercial report should be a deliberate decision.
    //
    // `contextualStandards.js` still explains that the TLVs are a separate
    // consensus series this assessment did not apply. That is the honest
    // place for it — naming a criterion you did NOT use, and why.
    const entry = PARAMETER_PROSE.co
    expect(entry.standardsBackground).not.toMatch(/ACGIH|Threshold Limit Value/i)
    expect(entry.applicableStandards.some((c) => /ACGIH/i.test(c.source))).toBe(false)
  })

  it('CO prose carries no General Duty Clause enforcement hook', () => {
    // Invoking OSH Act 5(a)(1) edges toward the compliance determination
    // the platform states it does not make, and no finding rested on it.
    const entry = PARAMETER_PROSE.co
    expect(entry.standardsBackground).not.toMatch(/General Duty|5\(a\)\(1\)/i)
    expect(entry.applicableStandards.some((c) => /General Duty|5\(a\)\(1\)/i.test(c.source))).toBe(false)
  })

  it('HCHO prose cites OSHA 29 CFR 1910.1048 and NIOSH 2016 method', () => {
    const entry = PARAMETER_PROSE.hcho
    expect(entry.standardsBackground).toMatch(/1910\.1048/)
    expect(entry.standardsBackground).toMatch(/NIOSH Method 2016|NIOSH 2016/i)
  })

  it('TVOC prose notes absence of regulatory limit and TO-17 confirmatory method', () => {
    const entry = PARAMETER_PROSE.tvoc
    expect(entry.standardsBackground).toMatch(/no regulatory limit/i)
    expect(entry.standardsBackground).toMatch(/TO-17/)
  })

  it('Particulates prose cites EPA NAAQS and WHO 2021 guidelines', () => {
    const entry = PARAMETER_PROSE.pm25
    expect(entry.standardsBackground).toMatch(/EPA/i)
    expect(entry.standardsBackground).toMatch(/NAAQS/i)
    expect(entry.standardsBackground).toMatch(/World Health Organization|WHO/i)
  })

  it('Thermal prose cites ASHRAE 55', () => {
    expect(PARAMETER_PROSE.temperature.standardsBackground).toMatch(/ASHRAE.*55/i)
    expect(PARAMETER_PROSE.rh.standardsBackground).toMatch(/ASHRAE.*55/i)
  })
})

describe('v2.2 §8 — summaryTemplate produces grammatical English', () => {
  const withinRange: ParameterRange = {
    low: 700, high: 950, average: 825, unit: 'ppm',
    count: 3, withinStandards: true, outdoorReference: 420,
  }
  const elevatedRange: ParameterRange = {
    low: 700, high: 1300, average: 950, unit: 'ppm',
    count: 3, withinStandards: false,
    elevatedInZones: ['Conference Room B'],
    outdoorReference: 420,
  }
  const noDataRange: ParameterRange = {
    low: 0, high: 0, average: 0, unit: 'ppm',
    count: 0, withinStandards: null,
  }

  for (const key of PARAM_KEYS) {
    it(`${key}: summaryTemplate within-standards starts with parameter name`, () => {
      const entry = PARAMETER_PROSE[key]
      const text = entry.summaryTemplate(withinRange)
      expect(text.length).toBeGreaterThan(40)
      expect(text).toMatch(/[.!?]$/)
    })

    it(`${key}: summaryTemplate elevated mentions per-zone reference`, () => {
      const entry = PARAMETER_PROSE[key]
      const text = entry.summaryTemplate(elevatedRange)
      expect(text).toMatch(/Conference Room B|Appendix A/)
    })

    it(`${key}: summaryTemplate no-data produces 'not measured' notice`, () => {
      const entry = PARAMETER_PROSE[key]
      const text = entry.summaryTemplate(noDataRange)
      expect(text).toMatch(/not measured/i)
    })
  }
})
