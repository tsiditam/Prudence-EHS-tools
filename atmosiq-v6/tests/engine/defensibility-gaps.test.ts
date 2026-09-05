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
// @ts-expect-error — JS module without TS types
import { scoreZone, genRecs } from '../../src/engines/scoring.js'
import {
  DEMO_FINDINGS_BUILDING, DEMO_FINDINGS_ZONES, DEMO_FINDINGS_EQUIPMENT,
// @ts-expect-error — JS module without TS types
} from '../../src/constants/demoDataFindings.js'

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
  /**
   * The clean case is built by RUNNING the engine, not by writing down
   * what its output is assumed to look like.
   *
   * That is the entire lesson of this rule's first version. It checked
   * `r.zone` / `r.system` / `r.surface_or_asset` / `r.free_text`, and
   * its "does not fire" fixture was hand-written with exactly those
   * keys — so the test passed on a record `genRecs` cannot produce,
   * while in the field every Immediate recommendation was reported as
   * unlocated (8 of 8 on the demo assessment, matching a user report).
   * A fixture invented to satisfy the code under test proves only that
   * the two agree with each other.
   */
  it('does not fire on the recommendations the engine actually emits', () => {
    const bldg = { ...DEMO_FINDINGS_BUILDING, assessmentDate: '2026-07-15' }
    const zones = DEMO_FINDINGS_ZONES as unknown as Array<Record<string, unknown>>
    const zoneScores = zones.map((z) => scoreZone(z, { ...bldg }))
    const recs = genRecs(zoneScores, bldg, { zones, equipment: DEMO_FINDINGS_EQUIPMENT })

    // Guard the guard: a fixture that stopped producing Immediate
    // actions would make the assertion below pass over an empty list.
    expect(recs.imm.length).toBeGreaterThan(0)
    // And the shape is the point — if genRecs ever starts emitting the
    // keys the old rule imagined, this test should be revisited rather
    // than silently keep passing.
    expect(Object.keys(recs.imm[0])).toContain('zoneName')

    expect(ruleRecommendationWithoutLocation({ recs })).toHaveLength(0)
  })

  it('fires when an Immediate rec carries no location of any kind', () => {
    const out = ruleRecommendationWithoutLocation({
      recs: { imm: [{ text: 'Replace clogged filter', controlTier: 'engineering' }] },
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('recommendation_without_location')
    expect(out[0].count).toBe(1)
  })

  it('accepts every location form a recommendation can carry', () => {
    const out = ruleRecommendationWithoutLocation({
      recs: {
        imm: [
          { scope: 'zone', zoneName: '4th Floor Open Office', text: 'A' },
          { scope: 'zone', zoneId: 'z-1', text: 'B' },
          { scope: 'equipment', equipmentLabel: 'AHU-3', text: 'C' },
          { scope: 'building', affectedZoneNames: ['Conference Room C'], text: 'D' },
          // Building-wide with no originating zone: the scope IS the location.
          { scope: 'building', affectedZoneNames: [], text: 'E' },
          // Forward-compatible fields from the defensibility primitive.
          { system: 'AHU-1', text: 'F' },
          { surface_or_asset: 'Ceiling tile', text: 'G' },
          { free_text: 'Whole building', text: 'H' },
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
