/**
 * Defensibility Gap Detector — rule-by-rule unit tests.
 *
 * Each rule must:
 *   • Fire (return a gap entry) on its own minimal "broken" fixture
 *   • Not fire on a minimal "clean" fixture that has the relevant context
 *
 * Rules are pure functions of the assessment object; tests don't need
 * Supabase, Anthropic, or the SPA shell.
 */

import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { detectDefensibilityGaps, __test } from '../../src/engines/defensibility-gaps.js'

const {
  ruleMissingOutdoorCo2,
  ruleMissingHvacStatus,
  ruleMissingOccupancyDuration,
  ruleMoldConcernWithoutMoisture,
  ruleRecommendationWithoutLocation,
  ruleQualitativeOnlyPropagated,
} = __test

describe('defensibility-gaps :: ruleMissingOutdoorCo2', () => {
  it('fires when a zone has indoor CO₂ but no outdoor baseline', () => {
    const out = ruleMissingOutdoorCo2({
      zones: [{ zn: 'Zone 1', co2: '1180' }, { zn: 'Zone 2', co2: '920', co2o: '420' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('missing_outdoor_co2')
    expect(out[0].zones).toEqual(['Zone 1'])
    expect(out[0].why).toMatch(/ASHRAE 62\.1/)
  })

  it('does not fire when every CO₂-bearing zone has a paired outdoor baseline', () => {
    const out = ruleMissingOutdoorCo2({
      zones: [{ zn: 'Zone 1', co2: '1180', co2o: '415' }],
    })
    expect(out).toHaveLength(0)
  })

  it('does not fire when no zones have any CO₂ measurement', () => {
    const out = ruleMissingOutdoorCo2({ zones: [{ zn: 'Zone 1' }] })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: ruleMissingHvacStatus', () => {
  it('fires (warn) when CO₂ readings exist but building HVAC type is blank', () => {
    const out = ruleMissingHvacStatus({
      zones: [{ zn: 'Zone 1', co2: '1180' }],
      building: {},
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('missing_hvac_status')
    expect(out[0].severity).toBe('warn')
  })

  it('fires (info) when building HVAC type is set but per-zone meas_conditions is blank', () => {
    const out = ruleMissingHvacStatus({
      zones: [{ zn: 'Zone 1', co2: '1180' }],
      building: { ht: 'VAV with rooftop AHU' },
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('missing_hvac_status')
    expect(out[0].severity).toBe('info')
    expect(out[0].zones).toContain('Zone 1')
  })

  it('does not fire when HVAC type and per-zone meas_conditions are both populated', () => {
    const out = ruleMissingHvacStatus({
      zones: [{ zn: 'Zone 1', co2: '1180', meas_conditions: 'Yes — normal operations' }],
      building: { ht: 'VAV with rooftop AHU' },
    })
    expect(out).toHaveLength(0)
  })

  it('does not fire when no CO₂ readings exist', () => {
    const out = ruleMissingHvacStatus({ zones: [{ zn: 'Zone 1' }], building: {} })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: ruleMissingOccupancyDuration', () => {
  function makeSymptomaticZoneScore(zoneName: string) {
    return {
      zoneName,
      cats: [{ l: 'Complaints', r: [{ t: 'Occupant headache symptoms reported', sev: 'medium' }] }],
    }
  }

  it('fires for symptomatic zones missing meas_duration or meas_occ', () => {
    const out = ruleMissingOccupancyDuration({
      zones: [{ zn: 'Zone A' }, { zn: 'Zone B', meas_duration: '15-minute average' }],
      zoneScores: [makeSymptomaticZoneScore('Zone A'), makeSymptomaticZoneScore('Zone B')],
    })
    expect(out).toHaveLength(1)
    expect(out[0].zones).toEqual(['Zone A', 'Zone B'])
  })

  it('does not fire for symptomatic zone with both fields populated', () => {
    const out = ruleMissingOccupancyDuration({
      zones: [{ zn: 'Zone A', meas_duration: '15-minute average', meas_occ: 'Typical occupancy' }],
      zoneScores: [makeSymptomaticZoneScore('Zone A')],
    })
    expect(out).toHaveLength(0)
  })

  it('does not fire when zone is not symptomatic', () => {
    const out = ruleMissingOccupancyDuration({
      zones: [{ zn: 'Zone A' }],
      zoneScores: [{ zoneName: 'Zone A', cats: [{ l: 'Vent', r: [{ t: 'CO2 elevated', sev: 'low' }] }] }],
    })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: ruleMoldConcernWithoutMoisture', () => {
  it('fires when mold indicator set but no moisture evidence', () => {
    const out = ruleMoldConcernWithoutMoisture({
      zones: [{ zn: 'Zone 1', mi: 'Suspected discoloration' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('mold_concern_without_moisture')
    expect(out[0].why).toMatch(/IICRC S520/)
  })

  it('fires on musty odor type without moisture evidence', () => {
    const out = ruleMoldConcernWithoutMoisture({
      zones: [{ zn: 'Zone 2', ot: ['Musty / Earthy'] }],
    })
    expect(out).toHaveLength(1)
  })

  it('does not fire when zone has both mold indicator and water-damage detail', () => {
    const out = ruleMoldConcernWithoutMoisture({
      zones: [{ zn: 'Zone 1', mi: 'Small (< 10 sq ft)', wd: 'Active leak' }],
    })
    expect(out).toHaveLength(0)
  })

  it('does not fire when zone has mold indicator and building has water detail', () => {
    const out = ruleMoldConcernWithoutMoisture({
      zones: [{ zn: 'Zone 1', mi: 'Suspected discoloration' }],
      presurvey: { ps_water_detail: 'Recurring roof leak above 3rd floor NE corner.' },
    })
    expect(out).toHaveLength(0)
  })

  it('treats explicit "None" and empty values as no concern', () => {
    const out = ruleMoldConcernWithoutMoisture({ zones: [{ zn: 'Zone 1', mi: 'None' }] })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: ruleRecommendationWithoutLocation', () => {
  it('fires when an Immediate-priority rec has no zone/system/surface/free_text', () => {
    const out = ruleRecommendationWithoutLocation({
      recs: { imm: [{ finding: 'Critical: replace clogged filter', action: 'Replace' }] },
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('recommendation_without_location')
    expect(out[0].count).toBe(1)
  })

  it('does not fire when each Immediate rec has at least one location field', () => {
    const out = ruleRecommendationWithoutLocation({
      recs: {
        imm: [
          { zone: 'Zone 1', finding: 'A', action: 'X' },
          { system: 'AHU-1', finding: 'B', action: 'Y' },
          { surface_or_asset: 'Ceiling tile', finding: 'C', action: 'Z' },
          { free_text: 'Whole building', finding: 'D', action: 'W' },
        ],
      },
    })
    expect(out).toHaveLength(0)
  })

  it('does not fire when there are no Immediate recommendations at all', () => {
    const out = ruleRecommendationWithoutLocation({ recs: { imm: [], eng: [{ zone: 'X' }] } })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: ruleQualitativeOnlyPropagated', () => {
  it('counts findings flagged with qualitative_only:true', () => {
    const out = ruleQualitativeOnlyPropagated({
      zoneScores: [
        {
          cats: [
            { l: 'Vent', r: [{ t: 'A', sev: 'low', qualitative_only: true }, { t: 'B', sev: 'low' }] },
            { l: 'Therm', r: [{ t: 'C', sev: 'info', qualitative_only: true }] },
          ],
        },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('qualitative_only_propagated')
    expect(out[0].count).toBe(2)
  })

  it('also counts the confidenceTier === "qualitative_only" form', () => {
    const out = ruleQualitativeOnlyPropagated({
      zoneScores: [{ cats: [{ l: 'X', r: [{ t: 'A', confidenceTier: 'qualitative_only' }] }] }],
    })
    expect(out[0].count).toBe(1)
  })

  it('does not fire when no findings carry the flag', () => {
    const out = ruleQualitativeOnlyPropagated({
      zoneScores: [{ cats: [{ l: 'X', r: [{ t: 'A', sev: 'low' }] }] }],
    })
    expect(out).toHaveLength(0)
  })
})

describe('defensibility-gaps :: detectDefensibilityGaps (integration)', () => {
  it('returns [] for the empty/null cases', () => {
    expect(detectDefensibilityGaps(null)).toEqual([])
    expect(detectDefensibilityGaps(undefined)).toEqual([])
    expect(detectDefensibilityGaps({})).toEqual([])
  })

  it('combines multiple rule outputs in one list', () => {
    const out = detectDefensibilityGaps({
      zones: [{ zn: 'Zone 1', co2: '1180', mi: 'Suspected discoloration' }],
      zoneScores: [],
      building: {},
      recs: { imm: [{ finding: 'X', action: 'Y' }] },
    })
    const kinds = out.map((g: any) => g.kind).sort()
    // missing_outdoor_co2 + missing_hvac_status + mold_concern_without_moisture
    // + recommendation_without_location all fire on this fixture.
    expect(kinds).toContain('missing_outdoor_co2')
    expect(kinds).toContain('missing_hvac_status')
    expect(kinds).toContain('mold_concern_without_moisture')
    expect(kinds).toContain('recommendation_without_location')
  })

  it('survives a malformed rule input without crashing', () => {
    // A rule receives garbage internal fields — the top-level try/catch
    // should keep the rest of the pipeline alive.
    const out = detectDefensibilityGaps({
      zones: [{ zn: 'Zone 1', co2: '1180' }],
      zoneScores: 'not-an-array' as any,
      building: { ht: 'VAV' },
      recs: { imm: [{ finding: 'X', action: 'Y', zone: 'Zone 1' }] },
    })
    // ruleMissingOutdoorCo2 still fires; ruleMissingOccupancyDuration fails
    // safely; recommendation rule sees the located rec and doesn't fire.
    expect(out.some((g: any) => g.kind === 'missing_outdoor_co2')).toBe(true)
  })
})
