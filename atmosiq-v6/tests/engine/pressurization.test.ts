/**
 * Building pressurization module — mechanism, not score.
 *
 * The four cases the spec calls out (no data / qualitative-only /
 * quantitative-within-accuracy / two-or-more co-occurring findings) are
 * the four `describe` blocks in the middle. Around them sit the
 * structural guards, which are the ones that will actually catch a
 * regression years from now: that pressurization never reaches the
 * composite, that no numeric threshold has appeared, and that every
 * sentence the module can emit still passes the engine's own
 * banned-language scanner.
 */

import { describe, it, expect } from 'vitest'

import {
  evaluatePressurization,
  findCoOccurringMechanisms,
  shouldConsolidate,
  CONSOLIDATION_MINIMUM,
} from '../../src/engines/pressurization'
import {
  buildPressurizationNarrative,
  consolidatedMechanismStatement,
  observationSentence,
  limitationSentence,
  anchorSentence,
  designTargetSentence,
} from '../../src/engines/pressurizationNarrative'
import {
  PRESSURIZATION_ANCHOR,
  PRESSURIZATION_CONFIDENCE,
  PRESSURIZATION_SCORED,
  PRESSURIZATION_REVIEW_LABEL,
  PA_PER_IN_WC,
  toPascals,
  withinInstrumentAccuracy,
} from '../../src/constants/pressurizationStandards'
import { pressurizationRecommendations } from '../../src/engines/pressurization'
import { buildCausalChains } from '../../src/engines/causalChains'
import { scoreZone, summarizeAssessment, genRecs } from '../../src/engines/scoring'
import { CONTROL_TIER, CONTROL_HIERARCHY_SOURCE } from '../../src/constants/pressurizationStandards'
import { isWithinNoiseFloor } from '../../src/engine/instruments/accuracy'
import { scanProseForBannedLanguage } from '../../src/engine/report/cih-validation'

// ── Fixtures ──────────────────────────────────────────────────────────

const ASSESSMENT_DATE = '2026-07-15'

/** A zone with nothing the mechanism would explain. */
const CLEAN_ZONE = {
  zn: 'Clean Office', su: 'office', sf: '2000', oc: '10',
  cx: 'No complaints', tf: '74', rh: '45', co2: '600', co2o: '420',
  pm: '6', pmo: '9', co: '0', wd: 'None', mi: 'None', op: 'None',
  src_internal: ['None identified'], src_adjacent: ['None of concern'],
}

/** Indoor PM above outdoor + humidity tracking outdoors + an unexplained odor. */
const EXPLAINABLE_ZONE = {
  zn: 'Level 1 Lobby', su: 'office', sf: '4000', oc: '20',
  cx: 'No complaints', tf: '76', rh: '68', rho: '81', co2: '700', co2o: '430',
  pm: '24', pmo: '9', co: '0',
  op: 'Moderate persistent', ot: ['Exhaust'],
  src_internal: ['None identified'], src_adjacent: ['Loading dock'],
  wd: 'None', mi: 'None',
  path_pressure: 'Negative (draws in)',
}

const BUILDING = { ft: 'Commercial Office', assessmentDate: ASSESSMENT_DATE }

const INWARD_QUALITATIVE = {
  ...BUILDING,
  bld_press_door: 'Air flows IN to the building',
  bld_press_method: 'Smoke pencil',
  bld_press_door_behavior: 'Doors pull shut hard',
}

/** A meter accurate to ±1.0 Pa. */
const PRESSURE_INSTRUMENT = {
  ps_inst_press: 'Testo 510i',
  ps_inst_press_serial: 'TS-99120',
  ps_inst_press_accuracy: '1.0',
  ps_inst_press_acc_units: 'Pa',
  ps_inst_press_res: '0.1',
  ps_inst_press_res_units: 'Pa',
  ps_inst_press_cal: '2026-03-02',
  ps_inst_press_cal_status: 'Calibrated within manufacturer spec',
}

const scored = (zones: any[], bldg: any) => zones.map((z) => scoreZone(z, bldg))

/** Every sentence a narrative object can carry, flattened. */
const allProse = (n: Record<string, unknown>): string[] =>
  Object.values(n).filter((v): v is string => typeof v === 'string' && v.length > 20)

// ══════════════════════════════════════════════════════════════════════
// Structural guards
// ══════════════════════════════════════════════════════════════════════

describe('pressurization is structurally isolated from the score', () => {
  it('declares itself unscored, in the assessment and in the module', () => {
    expect(PRESSURIZATION_SCORED).toBe(false)
    expect(evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] }).scored).toBe(false)
  })

  it('changes no zone score and no composite, however it is answered', () => {
    // The building record IS merged into every zone by scoreZone, so a
    // pressurization field is one sufficiency requirement away from
    // carrying points. This is the test that fails if that ever happens.
    const zones = [EXPLAINABLE_ZONE, CLEAN_ZONE]
    const answers = [
      BUILDING,
      INWARD_QUALITATIVE,
      { ...BUILDING, bld_press_door: 'Air flows OUT of the building' },
      { ...BUILDING, bld_press_dp_measured: 'Yes — differential pressure measured', bld_press_dp: '-40', bld_press_dp_units: 'Pa' },
      { ...BUILDING, bld_press_design: '0.02', bld_press_design_units: 'in. w.c.' },
    ]
    const baseline = scored(zones, BUILDING)
    const baselineComposite = summarizeAssessment(baseline)
    for (const bldg of answers) {
      const result = scored(zones, bldg)
      expect(result.map((z: any) => z.tot)).toEqual(baseline.map((z: any) => z.tot))
      expect(result.map((z: any) => z.confidence)).toEqual(baseline.map((z: any) => z.confidence))
      expect(summarizeAssessment(result)?.tot).toEqual(baselineComposite?.tot)
    }
  })

  it('adds no category, weight or point anywhere in the zone score', () => {
    const zs: any = scoreZone(EXPLAINABLE_ZONE, INWARD_QUALITATIVE)
    expect(zs.cats.map((c: any) => c.l).sort())
      .toEqual(['Complaints', 'Contaminants', 'Environment', 'HVAC', 'Ventilation'])
    const serialized = JSON.stringify(zs)
    expect(serialized).not.toContain('pressuriz')
    expect(serialized).not.toContain('bld_press')
  })
})

describe('no invented threshold', () => {
  it('the anchor is directional and advisory, and carries no numeric value', () => {
    expect(PRESSURIZATION_ANCHOR.source_status).toBe('advisory')
    expect(PRESSURIZATION_ANCHOR.cited_by).toBe('OSHA 3430-04 (2011)')
    expect(PRESSURIZATION_ANCHOR).not.toHaveProperty('value')
    expect(PRESSURIZATION_ANCHOR).not.toHaveProperty('threshold')
    // The quote itself is the anchor; a stray digit in it would mean a
    // magnitude crept into what is meant to be purely directional.
    expect(PRESSURIZATION_ANCHOR.quote).not.toMatch(/\d/)
  })

  it('never compares a reading to anything but its own instrument accuracy', () => {
    const a: any = evaluatePressurization({
      bldg: { ...BUILDING, bld_press_dp: '-40', bld_press_dp_units: 'Pa' },
      presurvey: PRESSURE_INSTRUMENT,
    })
    // A -40 Pa reading is enormous for a building. No verdict is
    // attached to it, and no comparison other than the noise floor.
    expect(a.confidence).toBe(PRESSURIZATION_CONFIDENCE.MEASURED)
    expect(a.quantitative.tolerancePa).toBe(1)
    expect(a).not.toHaveProperty('severity')
    expect(a).not.toHaveProperty('exceeds')
    expect(a).not.toHaveProperty('pass')
  })

  it('treats a documented design target as user-entered, never as a criterion', () => {
    const a: any = evaluatePressurization({
      bldg: {
        ...BUILDING,
        bld_press_design: '0.02', bld_press_design_units: 'in. w.c.',
        bld_press_design_src: 'Sequence of Operations, Rev C',
        bld_press_dp: '-4', bld_press_dp_units: 'Pa',
      },
      presurvey: PRESSURE_INSTRUMENT,
    })
    expect(a.designTarget.userEntered).toBe(true)
    expect(a.designTarget.valuePa).toBeCloseTo(0.02 * PA_PER_IN_WC, 4)
    expect(a.designTarget.framing).toMatch(/not a published standard/i)
    // The reading is NOT evaluated against it — no comparison field exists.
    expect(a.quantitative).not.toHaveProperty('meetsDesignTarget')
    expect(designTargetSentence(a)).toMatch(/was not evaluated against it/i)
  })

  it('converts in. w.c. to canonical pascals in both directions', () => {
    expect(toPascals(1, 'in. w.c.')).toBeCloseTo(PA_PER_IN_WC, 6)
    expect(toPascals('-0.01', 'in. w.c.')).toBeCloseTo(-2.490889, 6)
    expect(toPascals('-3.5', 'Pa')).toBe(-3.5)
    expect(toPascals('not a number', 'Pa')).toBeNull()
  })
})

describe('the uncertainty rule is the engine\'s existing one', () => {
  it('agrees with isWithinNoiseFloor at threshold zero', () => {
    // Reused rather than re-invented: the module states the equivalence
    // and this pins it, since the two live on different module systems.
    for (const value of [-2.5, -1, -0.4, 0, 0.4, 1, 2.5]) {
      for (const tolerance of [0.5, 1, 3]) {
        expect(withinInstrumentAccuracy(value, tolerance))
          .toBe(isWithinNoiseFloor(value, 0, { absolute: tolerance }))
      }
    }
  })
})

// ══════════════════════════════════════════════════════════════════════
// Case 1 — no data
// ══════════════════════════════════════════════════════════════════════

describe('no pressurization data captured', () => {
  it('reports not-evaluated rather than neutral or absent', () => {
    const a: any = evaluatePressurization({ bldg: BUILDING, zones: [CLEAN_ZONE] })
    expect(a.evaluated).toBe(false)
    expect(a.confidence).toBe(PRESSURIZATION_CONFIDENCE.NOT_EVALUATED)
    expect(a.direction).toBe('unknown')
    expect(a.inwardAirflow).toBe(false)
  })

  it('states that infiltration can be neither ruled in nor ruled out', () => {
    const a: any = evaluatePressurization({ bldg: BUILDING, zones: [CLEAN_ZONE] })
    expect(a.notEvaluatedStatement).toBeTruthy()
    expect(a.notEvaluatedStatement).toMatch(/was not evaluated/i)
    expect(a.notEvaluatedStatement).toMatch(/neither ruled in nor ruled out/i)
  })

  it('the causal chain engine says so out loud — silence is not acceptable', () => {
    const zones = [CLEAN_ZONE]
    const chains: any[] = buildCausalChains(zones, BUILDING, scored(zones, BUILDING))
    const note = chains.find((c) => c.notEvaluated)
    expect(note, 'no chain reported the unevaluated mechanism').toBeTruthy()
    expect(note.type).toContain('Not Evaluated')
    expect(note.rootCause).toMatch(/neither ruled in nor ruled out/i)
    // The card gets the short form; the report gets the full statement.
    expect(note.rootCause.length).toBeLessThanOrEqual(200)
    expect(note.mechanismStatement).toMatch(/was not evaluated during this assessment/i)
    expect(note.reviewLabel).toBe(PRESSURIZATION_REVIEW_LABEL)
  })

  it('degrades a malformed record to not-evaluated instead of throwing', () => {
    for (const input of [undefined, {}, { bldg: null, zones: null }, { bldg: { bld_press_door: 42 } }] as any[]) {
      expect(() => evaluatePressurization(input)).not.toThrow()
      expect(evaluatePressurization(input).evaluated).toBe(false)
    }
  })

  it('falls back to the pre-existing bld_pressure field rather than erasing an old assessment', () => {
    const a: any = evaluatePressurization({ bldg: { ...BUILDING, bld_pressure: 'Negative (air pulls in)' } })
    expect(a.evaluated).toBe(true)
    expect(a.direction).toBe('inward')
    expect(a.qualitative.doorAirflowSource).toBe('legacy_bld_pressure')
    // …but a real door observation always wins over the legacy field.
    const b: any = evaluatePressurization({
      bldg: { ...BUILDING, bld_pressure: 'Negative (air pulls in)', bld_press_door: 'Air flows OUT of the building' },
    })
    expect(b.direction).toBe('outward')
    expect(b.qualitative.doorAirflowSource).toBe('exterior_door_test')
  })
})

// ══════════════════════════════════════════════════════════════════════
// Case 2 — qualitative only
// ══════════════════════════════════════════════════════════════════════

describe('qualitative observation only', () => {
  const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })

  it('flags the mechanism as suggested, not measured', () => {
    expect(a.confidence).toBe(PRESSURIZATION_CONFIDENCE.SUGGESTED_NOT_MEASURED)
    expect(a.qualitativeOnly).toBe(true)
    expect(a.inwardAirflow).toBe(true)
    expect(a.quantitative.present).toBe(false)
  })

  it('says in prose that it was observed and not measured', () => {
    expect(observationSentence(a)).toMatch(/observed flowing inward/i)
    expect(limitationSentence(a)).toMatch(/observed rather than measured/i)
    expect(limitationSentence(a)).toMatch(/test-and-balance/i)
  })

  it('carries the corroborating door behaviour without upgrading confidence', () => {
    expect(observationSentence(a)).toMatch(/pull shut hard/i)
    expect(a.confidence).toBe(PRESSURIZATION_CONFIDENCE.SUGGESTED_NOT_MEASURED)
  })

  it('caps the chain at Possible when the direction was never measured', () => {
    const zones = [EXPLAINABLE_ZONE]
    const chains: any[] = buildCausalChains(zones, INWARD_QUALITATIVE, scored(zones, INWARD_QUALITATIVE))
    const mech = chains.find((c) => c.mechanism && !c.notEvaluated)
    expect(mech.confidence).toBe('Possible')
  })
})

// ══════════════════════════════════════════════════════════════════════
// Case 3 — quantitative within instrument accuracy
// ══════════════════════════════════════════════════════════════════════

describe('a reading whose magnitude is within instrument accuracy', () => {
  const bldg = {
    ...BUILDING,
    bld_press_dp_measured: 'Yes — differential pressure measured',
    bld_press_dp: '-0.3',
    bld_press_dp_units: 'Pa',
    bld_press_dp_location: 'Main lobby vestibule',
  }
  const a: any = evaluatePressurization({ bldg, zones: [EXPLAINABLE_ZONE], presurvey: PRESSURE_INSTRUMENT })

  it('is indeterminate — NOT neutral', () => {
    expect(a.quantitative.withinAccuracy).toBe(true)
    expect(a.confidence).toBe(PRESSURIZATION_CONFIDENCE.INDETERMINATE)
    expect(a.direction).toBe('indeterminate')
    expect(a.direction).not.toBe('neutral')
    expect(a.inwardAirflow).toBe(false)
  })

  it('says why, and refuses the neutral claim explicitly', () => {
    const prose = observationSentence(a)!
    expect(prose).toMatch(/within the stated accuracy/i)
    expect(prose).toMatch(/indeterminate rather than neutral/i)
  })

  it('does not consolidate on an indeterminate reading, even with findings present', () => {
    const zones = [EXPLAINABLE_ZONE]
    const chains: any[] = buildCausalChains(zones, bldg, scored(zones, bldg), { presurvey: PRESSURE_INSTRUMENT })
    expect(chains.find((c) => c.mechanism && !c.notEvaluated)).toBeUndefined()
    expect(findCoOccurringMechanisms({ ...bldg, ...EXPLAINABLE_ZONE }).length).toBeGreaterThanOrEqual(2)
    expect(shouldConsolidate(a, findCoOccurringMechanisms({ ...bldg, ...EXPLAINABLE_ZONE }))).toBe(false)
  })

  it('a reading outside the same instrument\'s accuracy IS measured', () => {
    const measured: any = evaluatePressurization({
      bldg: { ...bldg, bld_press_dp: '-4.2' },
      zones: [EXPLAINABLE_ZONE],
      presurvey: PRESSURE_INSTRUMENT,
    })
    expect(measured.confidence).toBe(PRESSURIZATION_CONFIDENCE.MEASURED)
    expect(measured.direction).toBe('inward')
    expect(measured.inwardAirflow).toBe(true)
    expect(observationSentence(measured)).toMatch(/-4\.2 Pa/)
    expect(observationSentence(measured)).toMatch(/Main lobby vestibule/)
  })

  it('an unstated instrument accuracy degrades the reading to qualitative', () => {
    const unstated: any = evaluatePressurization({
      bldg: { ...bldg, bld_press_dp: '-4.2' },
      zones: [EXPLAINABLE_ZONE],
      presurvey: { ps_inst_press: 'Shop manometer' },
    })
    expect(unstated.confidence).toBe(PRESSURIZATION_CONFIDENCE.MEASURED_ACCURACY_UNSTATED)
    expect(unstated.qualitativeOnly).toBe(true)
    expect(observationSentence(unstated)).toMatch(/accuracy of the instrument was not recorded/i)
  })

  it('falls back to resolution when accuracy was not stated but resolution was', () => {
    const a2: any = evaluatePressurization({
      bldg: { ...bldg, bld_press_dp: '-0.05' },
      presurvey: { ps_inst_press: 'Testo 510i', ps_inst_press_res: '0.1', ps_inst_press_res_units: 'Pa' },
    })
    expect(a2.quantitative.tolerancePa).toBe(0.1)
    expect(a2.confidence).toBe(PRESSURIZATION_CONFIDENCE.INDETERMINATE)
  })

  it('applies the accuracy comparison in canonical pascals across units', () => {
    // 0.001 in. w.c. ≈ 0.25 Pa, inside a ±1 Pa instrument.
    const a3: any = evaluatePressurization({
      bldg: { ...bldg, bld_press_dp: '-0.001', bld_press_dp_units: 'in. w.c.' },
      presurvey: PRESSURE_INSTRUMENT,
    })
    expect(a3.quantitative.valuePa).toBeCloseTo(-0.2490889, 6)
    expect(a3.confidence).toBe(PRESSURIZATION_CONFIDENCE.INDETERMINATE)
  })
})

// ══════════════════════════════════════════════════════════════════════
// Case 4 — two or more co-occurring findings → one consolidated statement
// ══════════════════════════════════════════════════════════════════════

describe('co-occurring findings consolidate into a single mechanism', () => {
  it('detects each explainable observation, and only when it applies', () => {
    const hits = findCoOccurringMechanisms({ ...INWARD_QUALITATIVE, ...EXPLAINABLE_ZONE })
    const keys = hits.map((h: any) => h.key)
    expect(keys).toContain('pm_indoor_above_outdoor')
    expect(keys).toContain('rh_elevated_with_outdoor')
    expect(keys).toContain('unexplained_odor')
    expect(findCoOccurringMechanisms({ ...INWARD_QUALITATIVE, ...CLEAN_ZONE })).toEqual([])
  })

  it('does not call an odor unexplained when a source sits in the room', () => {
    const explained = { ...EXPLAINABLE_ZONE, src_internal: ['Stored chemicals'] }
    const keys = findCoOccurringMechanisms(explained).map((h: any) => h.key)
    expect(keys).not.toContain('unexplained_odor')
  })

  it('requires indoor PM strictly above outdoor, not merely present', () => {
    const below = { ...EXPLAINABLE_ZONE, pm: '5', pmo: '9' }
    expect(findCoOccurringMechanisms(below).map((h: any) => h.key)).not.toContain('pm_indoor_above_outdoor')
  })

  it('requires the OUTDOOR humidity to be high too, not just the indoor', () => {
    const dryOutside = { ...EXPLAINABLE_ZONE, rh: '68', rho: '35' }
    expect(findCoOccurringMechanisms(dryOutside).map((h: any) => h.key)).not.toContain('rh_elevated_with_outdoor')
  })

  it('emits ONE chain rather than one per finding', () => {
    const zones = [EXPLAINABLE_ZONE]
    const chains: any[] = buildCausalChains(zones, INWARD_QUALITATIVE, scored(zones, INWARD_QUALITATIVE))
    const mechanisms = chains.filter((c) => c.mechanism)
    expect(mechanisms).toHaveLength(1)
    expect(mechanisms[0].consolidates.length).toBeGreaterThanOrEqual(CONSOLIDATION_MINIMUM)
    expect(mechanisms[0].scope).toBe('building')
    // One statement covering all of them, not one card per observation.
    expect(mechanisms[0].mechanismStatement).toMatch(/plausible common mechanism for/i)
    // …and the card itself stays short enough not to be clipped.
    expect(mechanisms[0].rootCause.length).toBeLessThanOrEqual(200)
  })

  it('names the zone when the observations sit in one, and does not when they do not', () => {
    const one = [EXPLAINABLE_ZONE]
    const single: any[] = buildCausalChains(one, INWARD_QUALITATIVE, scored(one, INWARD_QUALITATIVE))
    expect(single.find((c) => c.mechanism).zone).toBe('Level 1 Lobby')

    const spread = [
      { ...EXPLAINABLE_ZONE, zn: 'Lobby', rh: '45', rho: '30', op: 'None', ot: [] },
      { ...EXPLAINABLE_ZONE, zn: 'Basement Corridor', pm: '5', pmo: '9' },
    ]
    const many: any[] = buildCausalChains(spread, INWARD_QUALITATIVE, scored(spread, INWARD_QUALITATIVE))
    expect(many.find((c) => c.mechanism).zone).toBe('Building-wide')
  })

  it('counts KINDS of observation, so one repeated across zones does not consolidate alone', () => {
    const pmOnly = [
      { ...CLEAN_ZONE, zn: 'Floor 2', pm: '20', pmo: '8' },
      { ...CLEAN_ZONE, zn: 'Floor 3', pm: '19', pmo: '8' },
      { ...CLEAN_ZONE, zn: 'Floor 4', pm: '22', pmo: '8' },
    ]
    const chains: any[] = buildCausalChains(pmOnly, INWARD_QUALITATIVE, scored(pmOnly, INWARD_QUALITATIVE))
    expect(chains.filter((c) => c.mechanism && !c.notEvaluated)).toHaveLength(0)
  })

  it('does not consolidate when airflow is outward', () => {
    const outward = { ...INWARD_QUALITATIVE, bld_press_door: 'Air flows OUT of the building' }
    const zones = [EXPLAINABLE_ZONE]
    const chains: any[] = buildCausalChains(zones, outward, scored(zones, outward))
    expect(chains.filter((c) => c.mechanism && !c.notEvaluated)).toHaveLength(0)
  })

  it('writes the statement as a mechanism, never as a cause', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    const hits = findCoOccurringMechanisms({ ...INWARD_QUALITATIVE, ...EXPLAINABLE_ZONE })
    const statement = consolidatedMechanismStatement(a, hits, 'Level 1 Lobby')!

    expect(statement).toMatch(/consistent with the building operating under negative pressure/i)
    expect(statement).toMatch(/plausible common mechanism for/i)
    expect(statement).toMatch(/unconditioned outdoor air through the envelope/i)
    expect(statement).toMatch(/rather than through the filtered supply path/i)
    expect(statement).toMatch(/Level 1 Lobby/)
    expect(statement).toMatch(/test-and-balance/i)

    expect(statement).not.toMatch(/\bcaused by\b/i)
    expect(statement).not.toMatch(/\bdue to\b/i)
    expect(statement).not.toMatch(/\bconfirmed\b/i)
    expect(statement).not.toMatch(/\bresponsible for\b/i)
  })

  it('lists every consolidated observation in one sentence', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    const hits = findCoOccurringMechanisms({ ...INWARD_QUALITATIVE, ...EXPLAINABLE_ZONE })
    const statement = consolidatedMechanismStatement(a, hits, 'Level 1 Lobby')!
    for (const hit of hits) expect(statement).toContain((hit as any).label)
  })

  it('surfaces the zone-level negative pressure it already captures', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    expect(a.zonesNegative).toContain('Level 1 Lobby')
    const zones = [EXPLAINABLE_ZONE]
    const chains: any[] = buildCausalChains(zones, INWARD_QUALITATIVE, scored(zones, INWARD_QUALITATIVE))
    expect(chains.find((c) => c.mechanism).evidence.join(' ')).toMatch(/negative relative to the adjacent space/i)
  })

  it('consolidates envelope moisture and combustion gas on the same rule', () => {
    const zone = {
      ...CLEAN_ZONE, zn: 'Basement',
      wd: 'Active leak', wl: ['Walls', 'Below grade'],
      co: '7', src_internal: ['None identified'],
    }
    const keys = findCoOccurringMechanisms({ ...INWARD_QUALITATIVE, ...zone }).map((h: any) => h.key)
    expect(keys).toContain('envelope_moisture')
    expect(keys).toContain('co_no_indoor_source')
    const chains: any[] = buildCausalChains([zone], INWARD_QUALITATIVE, scored([zone], INWARD_QUALITATIVE))
    expect(chains.filter((c) => c.mechanism && !c.notEvaluated)).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════════════
// Language
// ══════════════════════════════════════════════════════════════════════

describe('narrative output', () => {
  const cases: Array<[string, any, any]> = [
    ['not evaluated', BUILDING, {}],
    ['qualitative inward', INWARD_QUALITATIVE, {}],
    ['qualitative outward', { ...BUILDING, bld_press_door: 'Air flows OUT of the building', bld_press_method: 'Tissue / ribbon' }, {}],
    ['qualitative neutral', { ...BUILDING, bld_press_door: 'Neutral / indeterminate', bld_press_method: 'Felt by hand' }, {}],
    ['doors resist closing', { ...BUILDING, bld_press_door: 'Air flows IN to the building', bld_press_door_behavior: 'Doors resist closing' }, {}],
    ['measured inward', { ...BUILDING, bld_press_dp: '-4.2', bld_press_dp_units: 'Pa', bld_press_dp_location: 'North vestibule' }, PRESSURE_INSTRUMENT],
    ['measured outward', { ...BUILDING, bld_press_dp: '3.1', bld_press_dp_units: 'Pa' }, PRESSURE_INSTRUMENT],
    ['within accuracy', { ...BUILDING, bld_press_dp: '-0.2', bld_press_dp_units: 'Pa' }, PRESSURE_INSTRUMENT],
    ['accuracy unstated', { ...BUILDING, bld_press_dp: '-4.2', bld_press_dp_units: 'Pa' }, { ps_inst_press: 'Shop manometer' }],
    ['with design target', { ...BUILDING, bld_press_dp: '-4.2', bld_press_dp_units: 'Pa', bld_press_design: '0.02', bld_press_design_units: 'in. w.c.', bld_press_design_src: 'Sequence of Operations Rev C' }, PRESSURE_INSTRUMENT],
    ['in. w.c. reading', { ...BUILDING, bld_press_dp: '-0.02', bld_press_dp_units: 'in. w.c.' }, PRESSURE_INSTRUMENT],
  ]

  it('passes the engine\'s own banned-language scanner in every state', () => {
    for (const [name, bldg, presurvey] of cases) {
      const a: any = evaluatePressurization({ bldg, zones: [EXPLAINABLE_ZONE], presurvey })
      const hits = findCoOccurringMechanisms({ ...bldg, ...EXPLAINABLE_ZONE })
      const narrative = buildPressurizationNarrative(a, hits, 'Level 1 Lobby')
      for (const prose of allProse(narrative as any)) {
        const violations = scanProseForBannedLanguage(prose)
        expect(violations, `${name}: ${JSON.stringify(violations)} in "${prose}"`).toEqual([])
      }
    }
  })

  it('the quoted OSHA anchor survives the scanner unedited', () => {
    expect(scanProseForBannedLanguage(anchorSentence())).toEqual([])
    expect(anchorSentence()).toContain(PRESSURIZATION_ANCHOR.quote)
    expect(anchorSentence()).toMatch(/no consensus indoor air quality standard sets a numeric value/i)
  })

  it('every chain this module emits is banned-phrase clean', () => {
    for (const [, bldg, presurvey] of cases) {
      const zones = [EXPLAINABLE_ZONE]
      const chains: any[] = buildCausalChains(zones, bldg, scored(zones, bldg), { presurvey })
      for (const chain of chains.filter((c) => c.mechanism)) {
        expect(scanProseForBannedLanguage(chain.rootCause)).toEqual([])
        expect(scanProseForBannedLanguage(chain.mechanismStatement)).toEqual([])
        for (const line of chain.evidence) expect(scanProseForBannedLanguage(line)).toEqual([])
      }
    }
  })

  it('is labelled for IH review in every state', () => {
    for (const [, bldg, presurvey] of cases) {
      const a: any = evaluatePressurization({ bldg, zones: [EXPLAINABLE_ZONE], presurvey })
      const narrative: any = buildPressurizationNarrative(a, [], null)
      expect(narrative.reviewLabel).toBe(PRESSURIZATION_REVIEW_LABEL)
      expect(narrative.requiresIhReview).toBe(true)
    }
  })

  it('carries the mechanism framing rather than a verdict', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    const narrative: any = buildPressurizationNarrative(a, [], null)
    expect(narrative.framing).toMatch(/not as a finding in its own right/i)
    expect(narrative.framing).toMatch(/carries no score/i)
  })
})

// ══════════════════════════════════════════════════════════════════════
// Recommendations
// ══════════════════════════════════════════════════════════════════════

describe('recommendations carry an OSHA 3430 control tier', () => {
  it('every pressurization remedy is an engineering control', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    const recs = pressurizationRecommendations(a)
    expect(recs.length).toBeGreaterThan(0)
    for (const r of recs as any[]) {
      expect(r.controlTier).toBe(CONTROL_TIER.ENGINEERING)
      expect(r.controlTierSource).toBe(CONTROL_HIERARCHY_SOURCE)
      expect(r.scope).toBe('building')
    }
  })

  it('covers the four remedies the mechanism actually calls for', () => {
    const a: any = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones: [EXPLAINABLE_ZONE] })
    const text = (pressurizationRecommendations(a) as any[]).map((r) => r.text).join(' | ')
    expect(text).toMatch(/test-and-balance/i)
    expect(text).toMatch(/exhaust fans are running in excess of supply/i)
    expect(text).toMatch(/outdoor-air damper position and economizer/i)
    expect(text).toMatch(/envelope penetrations|stack effect/i)
    // No remedy names a target pressure — there is no number to hit.
    expect(text).not.toMatch(/\d+\s*(Pa|pascal|in\. w\.c\.)/i)
  })

  it('emits nothing when the mechanism is absent or unevaluated', () => {
    expect(pressurizationRecommendations(evaluatePressurization({ bldg: BUILDING }))).toEqual([])
    expect(pressurizationRecommendations(evaluatePressurization({
      bldg: { ...BUILDING, bld_press_door: 'Air flows OUT of the building' },
    }))).toEqual([])
    expect(pressurizationRecommendations(null as never)).toEqual([])
  })

  it('joins the engineering bucket of the register when passed in', () => {
    const zones = [EXPLAINABLE_ZONE]
    const zs = scored(zones, INWARD_QUALITATIVE)
    const pressurization = evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones })
    const withMechanism: any = genRecs(zs, INWARD_QUALITATIVE, { zones, pressurization })
    const without: any = genRecs(zs, INWARD_QUALITATIVE, { zones })
    expect(withMechanism.eng.length).toBeGreaterThan(without.eng.length)
    expect(withMechanism.eng.some((r: any) => /test-and-balance/i.test(r.text))).toBe(true)
    // And nothing leaks into the other buckets.
    for (const bucket of ['imm', 'adm', 'mon']) {
      expect(withMechanism[bucket]).toEqual(without[bucket])
    }
  })

  it('tags every action the register emits with a tier, or explicitly with none', () => {
    const zones = [EXPLAINABLE_ZONE, CLEAN_ZONE]
    const zs = scored(zones, INWARD_QUALITATIVE)
    const recs: any = genRecs(zs, INWARD_QUALITATIVE, {
      zones,
      pressurization: evaluatePressurization({ bldg: INWARD_QUALITATIVE, zones }),
    })
    const allowed = [
      CONTROL_TIER.SOURCE_MANAGEMENT, CONTROL_TIER.ENGINEERING, CONTROL_TIER.ADMINISTRATIVE,
      // null is the deliberate fourth state: an investigation step is
      // not a control, and the hierarchy has no honest slot for it.
      null,
    ]
    const actions = ['imm', 'eng', 'adm', 'mon'].flatMap((b) => recs[b])
    expect(actions.length).toBeGreaterThan(5)
    for (const action of actions as any[]) {
      expect(Object.prototype.hasOwnProperty.call(action, 'controlTier'), `"${action.text}" carries no controlTier`).toBe(true)
      expect(allowed, `"${action.text}" has tier ${action.controlTier}`).toContain(action.controlTier)
    }
  })

  it('does not tag an investigation step as a control', () => {
    // A zone with no measurements produces data-gap actions. They ask
    // for a measurement, not for a control, and are tagged null.
    const bare = { zn: 'Unmeasured', su: 'office', sf: '1000', oc: '4', cx: 'No complaints' }
    const recs: any = genRecs(scored([bare], BUILDING), BUILDING, { zones: [bare] })
    const gapActions = (recs.eng as any[]).filter((r) => /Obtain ventilation measurements|Collect air quality measurements|Measure temperature/.test(r.text))
    expect(gapActions.length).toBeGreaterThan(0)
    for (const a of gapActions) expect(a.controlTier).toBeNull()
  })
})
