/**
 * The model-output contract and the gate that enforces it.
 *
 * Every test here is adversarial by design. The question is never "does a good
 * answer pass" — it is "what does a careless or confabulating answer get away
 * with". Nothing in this file calls a model: the guarantees are deterministic,
 * so they are testable without one, which is the whole reason the envelope is
 * code rather than prompt wording.
 */
import { describe, it, expect } from 'vitest'
import {
  validateForensicOutput, buildForensicInterpretationRecord, supportedFigures,
  unsupportedFigures, scanInterpretationLanguage, evidenceScopeForPattern,
  canonicalUnit, interpretationStatus,
  IMPORTANCE_VALUES, MAX_INTERPRETATIONS, MAX_TITLE_CHARS, MAX_INTERPRETATION_CHARS,
  MAX_LIST_ITEMS, MAX_ITEM_CHARS, REJECTION_REASONS, INTERPRETATION_STATUSES,
  FORENSIC_INTERPRETATION_VERSION,
} from '../../src/utils/forensicValidate.js'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { scanForensicLanguage, BOUNDED_PHRASES } from '../../src/constants/forensic-language.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

const multiDay = (days: number, f: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  }
  return pts
}
const mkDataset = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})

const indoorPoints = multiDay(4, (_d, h, i) => ({
  co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI),
  pm: i === 50 ? 180 : 10 + (i % 5),
}))
const outdoorPoints = multiDay(4, (_d, _h, i) => ({ pm: 9 + (i % 5) }))

const bundle = buildForensicBundle({
  sensorData: {
    version: 2,
    datasets: [
      mkDataset('primary', 'indoor', 'Indoor', indoorPoints, ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' }),
      mkDataset('ds-out', 'outdoor', 'Outdoor', outdoorPoints, ['pm'], { pm: 'µg/m³' }),
    ],
    occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }],
    graphs: {}, thresholds: {},
  },
  annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted' }],
  context: { objective: 'x', location: { building: 'N' }, instrument: { make: 'A' }, calibration: { date: '2026-01-15' } },
  utcOffsetMin: 0,
  generatedAt: '2026-03-10T00:00:00.000Z',
})

const cyclePattern = bundle.patterns.find((p: any) => p.kind === 'recurring_cycle')!
const gapOnCycle = cyclePattern.missingContext[0]?.id

/** A well-formed, cautious interpretation of a real pattern. */
const good = (over: any = {}) => ({
  pattern_id: cyclePattern.id,
  title: 'Daily carbon dioxide swing',
  importance: 'worth_review',
  interpretation: 'The trace is consistent with a repeating daily pattern. It cannot distinguish a scheduled system from occupancy, and requires confirmation.',
  alternative_explanations: ['A timed system start may contribute to the same shape.'],
  missing_context_ids: gapOnCycle ? [gapOnCycle] : [],
  recommended_reviews: ['Compare the pattern against the operating schedule; this warrants review.'],
  report_candidate: true,
  ...over,
})
/** One supported figure, the shape the gate now stores. */
const fig = (value: number, unit: string | null) => ({ value, unit, sourceId: 'src' })

const out = (interps: any[]) => ({ interpretations: interps })
const run = (payload: any, opts?: any) => validateForensicOutput(payload, bundle, opts)
const reasons = (r: any) => r.rejected.map((x: any) => x.reason)

describe('the bundle gives the gate something real to check', () => {
  it('has patterns, evidence and a fingerprint', () => {
    expect(bundle.patterns.length).toBeGreaterThan(2)
    expect(bundle.evidence.patternIds.length).toBe(bundle.patterns.length)
    expect(cyclePattern).toBeTruthy()
    expect(gapOnCycle).toBeTruthy()
  })
})

describe('a valid interpretation passes', () => {
  it('accepts a cautious reading of a real pattern', () => {
    const r = run(out([good()]))
    expect(r.ok).toBe(true)
    expect(r.rejected).toEqual([])
    expect(r.interpretations).toHaveLength(1)
    expect(r.interpretations[0].pattern_id).toBe(cyclePattern.id)
    expect(r.interpretations[0].report_candidate).toBe(true)
  })

  it('accepts alternative explanations and recommended reviews', () => {
    const r = run(out([good({
      alternative_explanations: ['A scheduled system may contribute.', 'Occupancy may contribute.'],
      recommended_reviews: ['Obtain the operating schedule.', 'Mark occupancy for the remaining days.'],
    })]))
    expect(r.interpretations[0].alternative_explanations).toHaveLength(2)
    expect(r.interpretations[0].recommended_reviews).toHaveLength(2)
  })

  it('accepts a missing-context reference that belongs to the pattern', () => {
    const r = run(out([good()]))
    expect(r.interpretations[0].missing_context_ids).toEqual([gapOnCycle])
  })

  it('accepts every value of the controlled vocabulary and nothing else', () => {
    IMPORTANCE_VALUES.forEach((v) => {
      expect(run(out([good({ importance: v })])).interpretations).toHaveLength(1)
    })
  })

  it('accepts a JSON string as readily as an object', () => {
    expect(run(JSON.stringify(out([good()]))).interpretations).toHaveLength(1)
  })

  it('stays tied to the fingerprint it was produced from', () => {
    expect(run(out([good()])).fingerprint).toBe(bundle.fingerprint)
    const mismatch = run(out([good()]), { expectFingerprint: 'deadbeefdeadbeef' })
    expect(mismatch.ok).toBe(false)
    expect(reasons(mismatch)).toEqual(['fingerprint_mismatch'])
    expect(mismatch.interpretations).toEqual([])
  })
})

describe('the model may not mint evidence', () => {
  it('rejects an invented pattern id', () => {
    const r = run(out([good({ pattern_id: 'pat-recurring_cycle-deadbeef' })]))
    expect(r.interpretations).toEqual([])
    expect(reasons(r)).toEqual(['unknown_pattern_id'])
  })

  it('rejects an invented event id', () => {
    const r = run(out([good({ evidence_ids: ['ev-primary-co2-peak-zzzz'] })]))
    expect(reasons(r)).toEqual(['unknown_evidence_id'])
  })

  it('rejects an invented dataset, parameter or annotation id', () => {
    ;['ds-invented', 'par-primary-argon', 'ann-nope'].forEach((id) => {
      const r = run(out([good({ evidence_ids: [id] })]))
      expect(reasons(r), id).toEqual(['unknown_evidence_id'])
      expect(r.rejected[0].detail).toBe(id)
    })
  })

  it('accepts evidence ids that resolve to the interpreted pattern', () => {
    const scope = evidenceScopeForPattern(bundle, cyclePattern.id)
    const ids = [...scope.ids]
    expect(ids).toContain(cyclePattern.id)
    expect(ids).toContain('primary')
    expect(ids).toContain('par-primary-co2')
    const r = run(out([good({ evidence_ids: ids })]))
    expect(r.rejected).toEqual([])
    expect(r.interpretations[0].evidence_ids).toHaveLength(ids.length)
  })

  it('rejects an invented context-gap id', () => {
    const r = run(out([good({ missing_context_ids: ['sunspots'] })]))
    expect(reasons(r)).toEqual(['unknown_context_gap_id'])
  })

  it('rejects a real gap that does not belong to this pattern', () => {
    // `annotations` is a real contextual input, but this session HAS annotations
    // and the cycle does not carry that gap. Real elsewhere is not real here.
    const other = bundle.patterns.find((p: any) => p.id !== cyclePattern.id
      && p.missingContext.some((m: any) => !cyclePattern.missingContext.some((c: any) => c.id === m.id)))
    if (!other) return
    const foreign = other.missingContext.find((m: any) => !cyclePattern.missingContext.some((c: any) => c.id === m.id))
    const r = run(out([good({ missing_context_ids: [foreign.id] })]))
    expect(reasons(r)).toEqual(['context_gap_not_on_pattern'])
  })
})

describe('bounds and structure', () => {
  it('rejects duplicate interpretations of one pattern', () => {
    const r = run(out([good(), good({ title: 'Same pattern again' })]))
    expect(r.interpretations).toHaveLength(1)
    expect(reasons(r)).toEqual(['duplicate_pattern'])
  })

  it('enforces the five-interpretation ceiling', () => {
    const ids = bundle.evidence.patternIds.slice(0, MAX_INTERPRETATIONS + 2)
    expect(ids.length).toBeGreaterThan(MAX_INTERPRETATIONS)
    const r = run(out(ids.map((id: string) => good({ pattern_id: id, missing_context_ids: [] }))))
    expect(r.interpretations).toHaveLength(MAX_INTERPRETATIONS)
    expect(reasons(r)).toContain('over_interpretation_limit')
  })

  it('rejects a malformed enum rather than guessing at it', () => {
    ;['high', 'HIGH', 'urgent', '', null, 3].forEach((v) => {
      const r = run(out([good({ importance: v })]))
      expect(reasons(r), String(v)).toEqual(['invalid_importance'])
    })
  })

  it('rejects a missing or malformed required field', () => {
    expect(reasons(run(out([good({ pattern_id: undefined })])))).toEqual(['missing_pattern_id'])
    expect(reasons(run(out([good({ title: '   ' })])))).toEqual(['missing_title'])
    expect(reasons(run(out([good({ interpretation: 42 })])))).toEqual(['missing_interpretation'])
    expect(reasons(run(out([null])))).toEqual(['malformed_interpretation'])
  })

  it('caps strings instead of refusing them', () => {
    const r = run(out([good({
      title: 'T'.repeat(MAX_TITLE_CHARS + 80),
      interpretation: `It is consistent with a pattern. ${'x'.repeat(MAX_INTERPRETATION_CHARS + 200)}`,
    })]))
    expect(r.interpretations[0].title).toHaveLength(MAX_TITLE_CHARS)
    expect(r.interpretations[0].interpretation).toHaveLength(MAX_INTERPRETATION_CHARS)
  })

  it('strips malformed list items and caps list length', () => {
    const r = run(out([good({
      alternative_explanations: ['A may contribute.', 42, null, { x: 1 }, '', 'B may contribute.'],
      recommended_reviews: Array.from({ length: MAX_LIST_ITEMS + 4 }, (_, i) => `Review step ${'y'.repeat(i)}.`),
    })]))
    expect(r.interpretations[0].alternative_explanations).toEqual(['A may contribute.', 'B may contribute.'])
    expect(r.interpretations[0].recommended_reviews).toHaveLength(MAX_LIST_ITEMS)
    r.interpretations[0].recommended_reviews.forEach((s: string) => expect(s.length).toBeLessThanOrEqual(MAX_ITEM_CHARS))
  })

  it('fails closed on an invalid or empty response', () => {
    expect(reasons(run('not json at all'))).toEqual(['unparseable_output'])
    expect(reasons(run('[1,2,3]'))).toEqual(['malformed_output'])
    expect(reasons(run(null))).toEqual(['malformed_output'])
    expect(reasons(run({}))).toEqual(['malformed_output'])
    expect(reasons(run({ interpretations: 'lots' }))).toEqual(['malformed_output'])
    // An empty list is well-formed and simply yields nothing.
    const none = run(out([]))
    expect(none.ok).toBe(true)
    expect(none.interpretations).toEqual([])
  })

  it('refuses to validate without a bundle', () => {
    expect(reasons(validateForensicOutput(out([good()]), null as never))).toEqual(['no_bundle'])
    expect(reasons(validateForensicOutput(out([good()]), {} as never))).toEqual(['no_bundle'])
  })

  it('every reason it can emit is in the declared vocabulary', () => {
    const emitted = [
      run('nope'), run({}), run(out([null])), run(out([good({ pattern_id: 'x' })])),
      run(out([good({ importance: 'high' })])), run(out([good({ missing_context_ids: ['zz'] })])),
      validateForensicOutput(out([good()]), null as never),
    ].flatMap((r) => reasons(r))
    emitted.forEach((x) => expect(REJECTION_REASONS).toContain(x))
  })
})

describe('numbers must come from the deterministic layer', () => {
  it('rejects an invented figure', () => {
    const r = run(out([good({
      interpretation: 'The trace is consistent with a daily swing peaking near 4200 ppm.',
    })]))
    expect(reasons(r)).toEqual(['unsupported_figure'])
    expect(r.rejected[0].detail).toContain('4200')
  })

  it('rejects an invented figure anywhere the model wrote, not only the main text', () => {
    expect(reasons(run(out([good({ alternative_explanations: ['Outdoor sat at 999 µg/m³.'] })]))))
      .toEqual(['unsupported_figure'])
    expect(reasons(run(out([good({ recommended_reviews: ['Re-measure against 77 °F.'] })]))))
      .toEqual(['unsupported_figure'])
    expect(reasons(run(out([good({ title: 'Swing of 12345 ppm' })])))).toEqual(['unsupported_figure'])
  })

  it('accepts a figure the bundle actually produced', () => {
    const co2 = bundle.parameters.find((p: any) => p.param === 'co2')
    const mean = Math.round(co2.stats.mean)
    const r = run(out([good({
      interpretation: `Readings averaged about ${mean} ppm and the pattern warrants review.`,
    })]))
    expect(r.rejected).toEqual([])
  })

  it('accepts rounding but not alteration', () => {
    const supported = supportedFigures(bundle)
    const s = [fig(1451.83, 'ppm')]
    expect(unsupportedFigures('a value of 1451.8 ppm', s)).toEqual([])
    expect(unsupportedFigures('a value of 1452 ppm', s)).toEqual([])
    expect(unsupportedFigures('a value of 1500 ppm', s)).toHaveLength(1)
    expect(supported.length).toBeGreaterThan(10)
  })

  it('leaves unitless counts alone — those are arithmetic over the bundle', () => {
    const r = run(out([good({
      interpretation: 'The shape repeats on 4 of 4 days across 2 datasets, and warrants review.',
    })]))
    expect(r.rejected).toEqual([])
  })

  it('lets a duration be restated in another time unit', () => {
    const s = [fig(7200, 'duration')]
    expect(unsupportedFigures('elevated for 2 hours', s)).toEqual([])
    expect(unsupportedFigures('elevated for 120 minutes', s)).toEqual([])
    expect(unsupportedFigures('elevated for 7200 seconds', s)).toEqual([])
    expect(unsupportedFigures('elevated for 5 hours', s)).toHaveLength(1)
  })

  it('catches units that end in a non-word character — the ones a word boundary cannot', () => {
    // `\b` after `µg/m³` or `%` can never match, so a gate written that way
    // silently ignored every mass concentration and every percentage while
    // appearing to work, because `ppm` and `°F` end in letters and passed.
    const sup = [fig(12, 'ug/m3'), fig(30, '%')]
    expect(unsupportedFigures('outdoor sat at 999 µg/m³.', sup)).toHaveLength(1)
    expect(unsupportedFigures('above the reference 88% of the time', sup)).toHaveLength(1)
    expect(unsupportedFigures('outdoor sat at 12 µg/m³.', sup)).toEqual([])
    expect(unsupportedFigures('above the reference 30% of the time', sup)).toEqual([])
  })

  it('does not mistake a unit for the start of a longer word', () => {
    const sup = [fig(5, 'duration')]
    expect(unsupportedFigures('across 5 samples', sup)).toEqual([]) // not "5 s"
    expect(unsupportedFigures('across 9 samples', sup)).toEqual([]) // still not a figure
    expect(unsupportedFigures('lasting 9 s', sup)).toHaveLength(1)
  })

  it('does not admit a timestamp as a supportable figure', () => {
    // Instants are not quantities; admitting them would let almost any large
    // number through, since a session carries thousands of them.
    const supported = supportedFigures(bundle)
    expect(supported.some((f: any) => f.value === T0)).toBe(false)
  })
})

describe('a figure is only supported by a figure IN THE SAME UNIT', () => {
  // The first cut of this gate stored bare magnitudes. Every case below passed
  // it, because 35.1 is 35.1 whatever it is 35.1 OF. They are four different
  // claims about four different quantities and the record supports one.
  it('does not let a mass concentration support a gas concentration', () => {
    expect(unsupportedFigures('the level reached 35.1 ppm', [fig(35.1, 'ug/m3')])).toEqual(['35.1 ppm'])
  })

  it('does not let a mass concentration support a percentage', () => {
    expect(unsupportedFigures('above the reference 35.1% of the time', [fig(35.1, 'ug/m3')])).toEqual(['35.1%'])
  })

  it('does not let a gas concentration support a temperature', () => {
    expect(unsupportedFigures('the space sat at 700 °F', [fig(700, 'ppm')])).toEqual(['700 °F'])
  })

  it('does not convert between related units either', () => {
    // 700 ppm IS 700000 ppb and 35.1 ug/m3 IS 0.0351 mg/m3. Converting here
    // would make the validator the author of a number nobody measured, and a
    // model that writes the wrong member of the pair has made a real error.
    expect(unsupportedFigures('the level reached 700 ppb', [fig(700, 'ppm')])).toHaveLength(1)
    expect(unsupportedFigures('the level reached 35.1 mg/m³', [fig(35.1, 'ug/m3')])).toHaveLength(1)
    expect(unsupportedFigures('the space sat at 21 °C', [fig(21, 'degF')])).toHaveLength(1)
  })

  it('accepts every spelling of one unit', () => {
    const s = [fig(12.4, 'ug/m3')]
    for (const w of ['12.4 µg/m³', '12.4 μg/m³', '12.4 ug/m3', '12.4 µg/m3', '12.4 ug/m³']) {
      expect(unsupportedFigures(`outdoor sat at ${w}.`, s), w).toEqual([])
    }
    const t = [fig(71, 'degF')]
    for (const w of ['71 °F', '71 °f', '71 degF', '71 deg F']) {
      expect(unsupportedFigures(`the space sat at ${w}.`, t), w).toEqual([])
    }
  })

  it('canonicalizes the spellings the instrument exports use', () => {
    expect(canonicalUnit('µg/m³')).toBe('ug/m3')
    expect(canonicalUnit('μg/m3')).toBe('ug/m3')
    expect(canonicalUnit('°F')).toBe('degF')
    expect(canonicalUnit('PPM')).toBe('ppm')
    expect(canonicalUnit('hours')).toBe('duration')
    // Unknown units keep their own identity rather than becoming dimensionless:
    // they then match themselves and nothing else, which is correct for a
    // quantity this module has no rule for.
    expect(canonicalUnit('lux')).toBe('lux')
    expect(canonicalUnit('  ')).toBe(null)
    expect(canonicalUnit(null as never)).toBe(null)
  })

  it('converts a duration across spellings but nothing else across dimensions', () => {
    const s = [fig(14340, 'duration')] // 3.983 hours
    expect(unsupportedFigures('elevated for about 4 hours', s)).toEqual([])
    expect(unsupportedFigures('elevated for 239 minutes', s)).toEqual([])
    expect(unsupportedFigures('elevated for 14340 s', s)).toEqual([])
    expect(unsupportedFigures('elevated for 6 hours', s)).toHaveLength(1)
    // A duration never supports a concentration, however the number lines up.
    expect(unsupportedFigures('the level reached 4 ppm', s)).toHaveLength(1)
  })

  it('lets a whole-day count be written in days', () => {
    expect(unsupportedFigures('the shape repeats on 4 days', [fig(4 * 86400, 'duration')])).toEqual([])
  })
})

describe('sign is checked only when the model wrote one', () => {
  it('accepts an unsigned magnitude for a signed deterministic value', () => {
    // Prose puts direction in words far more often than in a sign, and a rule
    // that rejected "a drop of 240 ppm" would be switched off within a week.
    expect(unsupportedFigures('a drop of 240 ppm followed', [fig(-240, 'ppm')])).toEqual([])
    expect(unsupportedFigures('a rise of 240 ppm followed', [fig(240, 'ppm')])).toEqual([])
  })

  it('rejects an explicit sign the deterministic value contradicts', () => {
    expect(unsupportedFigures('a change of -240 ppm', [fig(240, 'ppm')])).toEqual(['-240 ppm'])
    expect(unsupportedFigures('a change of +240 ppm', [fig(-240, 'ppm')])).toEqual(['+240 ppm'])
  })

  it('accepts an explicit sign the deterministic value carries', () => {
    expect(unsupportedFigures('a change of -240 ppm', [fig(-240, 'ppm')])).toEqual([])
    expect(unsupportedFigures('a change of +240 ppm', [fig(240, 'ppm')])).toEqual([])
  })

  it('reads a dash between two numbers as a range, not a sign', () => {
    const s = [fig(400, 'ppm'), fig(500, 'ppm')]
    expect(unsupportedFigures('readings ranged 400-500 ppm', s)).toEqual([])
  })
})

describe('evidence and arithmetic are scoped to the pattern being interpreted', () => {
  const pmEvent = bundle.evidence.eventIds.find((id: string) => id.includes('-pm-'))!
  const pmParam = bundle.parameters.find((p: any) => p.id === 'par-primary-pm')!
  const pmPattern = bundle.patterns.find((p: any) => p.kind === 'indoor_outdoor_comparison')!
  const proximity = bundle.patterns.find((p: any) => p.kind === 'event_proximity')!

  it('scopes a pattern to what the detector said it rests on', () => {
    const scope = evidenceScopeForPattern(bundle, cyclePattern.id)
    expect(scope.found).toBe(true)
    expect([...scope.ids].sort()).toEqual([cyclePattern.id, 'par-primary-co2', 'primary'].sort())
    expect(scope.ids.has(pmEvent)).toBe(false)
    expect(scope.ids.has('par-primary-pm')).toBe(false)
    expect([...scope.contextGapIds]).toEqual(cyclePattern.missingContext.map((m: any) => m.id))
  })

  it('reports an unknown pattern as an empty scope rather than throwing', () => {
    const scope = evidenceScopeForPattern(bundle, 'pat-not-real')
    expect(scope.found).toBe(false)
    expect([...scope.ids]).toEqual([])
    expect(scope.figures).toEqual([])
    expect(evidenceScopeForPattern(null as never, null as never).found).toBe(false)
  })

  it('rejects a real event that belongs to another pattern', () => {
    // The id resolves against the registry, so the old gate passed it. It is a
    // genuine particulate event cited by an interpretation about carbon dioxide.
    expect(bundle.evidence.eventIds).toContain(pmEvent)
    const r = run(out([good({ evidence_ids: [pmEvent] })]))
    expect(reasons(r)).toEqual(['evidence_not_on_pattern'])
    expect(r.rejected[0].detail).toBe(pmEvent)
  })

  it('still tells a foreign id apart from an invented one', () => {
    expect(reasons(run(out([good({ evidence_ids: ['ev-made-up'] })])))).toEqual(['unknown_evidence_id'])
    expect(reasons(run(out([good({ evidence_ids: ['par-primary-pm'] })])))).toEqual(['evidence_not_on_pattern'])
  })

  it('rejects a real figure that belongs to another parameter', () => {
    const mean = Math.round(pmParam.stats.mean * 100) / 100
    const r = run(out([good({
      interpretation: `The swing is consistent with a daily cycle averaging ${mean} µg/m³, and warrants review.`,
    })]))
    expect(reasons(r)).toEqual(['unsupported_figure'])
    expect(r.rejected[0].detail).toContain(String(mean))
  })

  it('accepts the same figure when it belongs to the interpreted pattern', () => {
    const mean = Math.round(pmParam.stats.mean * 100) / 100
    const r = run(out([good({
      pattern_id: pmPattern.id,
      missing_context_ids: [],
      interpretation: `The paired traces are consistent with an outdoor contribution averaging ${mean} µg/m³, and warrant review.`,
    })]))
    expect(reasons(r)).toEqual([])
    expect(r.interpretations).toHaveLength(1)
  })

  it('scopes the outdoor parameter into the indoor/outdoor comparison, and nothing more', () => {
    const scope = evidenceScopeForPattern(bundle, pmPattern.id)
    expect(scope.ids.has('par-primary-pm')).toBe(true)
    expect(scope.ids.has('par-ds-out-pm')).toBe(true)
    expect(scope.ids.has('ds-out')).toBe(true)
    expect(scope.ids.has('par-primary-co2')).toBe(false)
  })

  it('scopes an annotation only to the pattern the detector attached it to', () => {
    const scope = evidenceScopeForPattern(bundle, proximity.id)
    expect(scope.ids.has('ann-e1')).toBe(true)
    expect(evidenceScopeForPattern(bundle, cyclePattern.id).ids.has('ann-e1')).toBe(false)
    expect(reasons(run(out([good({ evidence_ids: ['ann-e1'] })])))).toEqual(['evidence_not_on_pattern'])
    const r = run(out([good({ pattern_id: proximity.id, missing_context_ids: [], evidence_ids: ['ann-e1'] })]))
    expect(reasons(r)).toEqual([])
  })

  it('still accepts a context gap the pattern owns', () => {
    const r = run(out([good({ missing_context_ids: [gapOnCycle] })]))
    expect(reasons(r)).toEqual([])
    expect(r.interpretations[0].missing_context_ids).toEqual([gapOnCycle])
  })
})

describe('empty output and wholly rejected output are different facts', () => {
  it('declares the four outcomes and derives each from the counts', () => {
    expect(INTERPRETATION_STATUSES).toEqual(['validated', 'partial', 'empty', 'rejected'])
    expect(interpretationStatus(2, 0)).toBe('validated')
    expect(interpretationStatus(2, 1)).toBe('partial')
    expect(interpretationStatus(0, 0)).toBe('empty')
    expect(interpretationStatus(0, 3)).toBe('rejected')
  })

  it('calls a model that validly raised nothing empty', () => {
    const r = run(out([]))
    expect(r.status).toBe('empty')
    expect(r.ok).toBe(true)
    expect(buildForensicInterpretationRecord({ bundle, validation: r }).validation.status).toBe('empty')
  })

  it('calls a response whose every interpretation died rejected, not empty', () => {
    const r = run(out([
      good({ interpretation: 'This proves the copier is the source.' }),
      good({ pattern_id: 'pat-not-real' }),
    ]))
    expect(r.interpretations).toEqual([])
    expect(r.status).toBe('rejected')
    // `ok` now means usable as it stands. A caller reading only `ok` must not
    // mistake a wholly rejected response for a clean, empty analysis.
    expect(r.ok).toBe(false)
    expect(buildForensicInterpretationRecord({ bundle, validation: r }).validation.status).toBe('rejected')
  })

  it('calls a mixed response partial', () => {
    const r = run(out([good(), good({ pattern_id: 'pat-not-real' })]))
    expect(r.interpretations).toHaveLength(1)
    expect(r.status).toBe('partial')
    expect(r.ok).toBe(true)
    const rec = buildForensicInterpretationRecord({ bundle, validation: r })
    expect(rec.validation.status).toBe('partial')
    expect(rec.validation.accepted).toBe(1)
    expect(rec.validation.rejected).toBe(1)
  })

  it('calls a refused envelope rejected', () => {
    ;['not json', '[1,2,3]'].forEach((raw) => {
      const r = run(raw)
      expect(r.status).toBe('rejected')
      expect(r.ok).toBe(false)
    })
    expect(validateForensicOutput(out([good()]), null as never).status).toBe('rejected')
  })

  it('derives a status for a hand-built validation result that carries none', () => {
    const rec = buildForensicInterpretationRecord({
      bundle,
      validation: { ok: true, interpretations: [{ pattern_id: 'x' }], rejected: [{ reason: 'unsupported_figure' }] },
    })
    expect(rec.validation.status).toBe('partial')
  })

  it('every status it can emit is in the declared vocabulary', () => {
    const seen = [run(out([])), run(out([good()])), run('nope'), run(out([good({ title: '' })]))]
      .map((r: any) => r.status)
    seen.forEach((x) => expect(INTERPRETATION_STATUSES).toContain(x))
  })
})

describe('language: the shared floor plus the forensics layer', () => {
  const say = (text: string) => reasons(run(out([good({ interpretation: text })])))

  it('rejects unsupported causal wording', () => {
    expect(say('The afternoon rise in carbon dioxide is caused by occupancy.')).toEqual(['prohibited_language'])
    expect(say('The elevated indoor concentration is due to the ventilation system.')).toEqual(['prohibited_language'])
    expect(say('The air quality problem is attributable to the rooftop unit.')).toEqual(['prohibited_language'])
  })

  it('rejects unsupported compliance wording', () => {
    expect(say('Readings were within the limit throughout the period.')).toEqual(['prohibited_language'])
    expect(say('The indoor air meets the standard for the monitored period.')).toEqual(['prohibited_language'])
    expect(say('The space is in compliance with the applicable criterion.')).toEqual(['prohibited_language'])
  })

  it('rejects unsupported health-effect wording', () => {
    expect(say('The elevated indoor level causes headaches among occupants.')).toEqual(['prohibited_language'])
    expect(say('This concentration triggers respiratory irritation in occupants.')).toEqual(['prohibited_language'])
  })

  it('rejects the six forensics-specific phrases', () => {
    expect(say('The daily cycle proves the system is on a timer.')).toEqual(['prohibited_language'])
    expect(say('The outdoor trace rules out an exterior contribution.')).toEqual(['prohibited_language'])
    expect(say('The comparison exonerates the rooftop unit.')).toEqual(['prohibited_language'])
    expect(say('Indoor levels remained safe across the monitored period.')).toEqual(['prohibited_language'])
    expect(say('The pattern shows adequate ventilation during occupied hours.')).toEqual(['prohibited_language'])
    expect(say('The pattern shows inadequate ventilation during occupied hours.')).toEqual(['prohibited_language'])
  })

  it('accepts the bounded vocabulary those phrases are meant to replace', () => {
    BOUNDED_PHRASES.forEach((phrase) => {
      const r = run(out([good({ interpretation: `The indoor trace ${phrase} a repeating daily pattern.` })]))
      expect(r.rejected, phrase).toEqual([])
    })
  })

  it('does not fire on innocuous uses of a gated word', () => {
    expect(scanForensicLanguage('The assessor wore safety glasses during the walkthrough.')).toEqual([])
    expect(scanForensicLanguage('The gap is due to a logger restart at the midpoint.')).toEqual([])
    expect(scanForensicLanguage('This does not prove anything about the system.')).toEqual([])
  })

  it('runs the shared scan as well as the forensics layer', () => {
    const hits = scanInterpretationLanguage('The condition is hazardous and was caused by the drain pan.')
    expect(hits.some((h) => h.layer === 'shared')).toBe(true)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('reports which layer refused, so the model can be told what to change', () => {
    const r = run(out([good({ interpretation: 'This proves the indoor source is the copier.' })]))
    expect(r.rejected[0].detail).toContain('forensic:')
  })
})

describe('the persisted interpretation record', () => {
  it('carries the fingerprint, versions, model metadata and status', () => {
    const validation = run(out([good()]))
    const rec = buildForensicInterpretationRecord({
      bundle, validation,
      model: { provider: 'anthropic', name: 'claude-x', version: '1' },
      generatedAt: '2026-03-10T12:00:00.000Z',
    })
    expect(rec.version).toBe(FORENSIC_INTERPRETATION_VERSION)
    expect(rec.forensicSchemaVersion).toBe(bundle.schemaVersion)
    expect(rec.fingerprint).toBe(bundle.fingerprint)
    expect(rec.generatedAt).toBe('2026-03-10T12:00:00.000Z')
    expect(rec.model).toEqual({ provider: 'anthropic', name: 'claude-x', version: '1' })
    expect(rec.interpretations).toHaveLength(1)
    expect(rec.validation.status).toBe('validated')
    expect(rec.validation.accepted).toBe(1)
    expect(rec.validation.rejected).toBe(0)
  })

  it('records rejection reasons but never the prose that failed a gate', () => {
    const validation = run(out([good({ interpretation: 'This proves the indoor source is the copier.' })]))
    const rec = buildForensicInterpretationRecord({ bundle, validation })
    // Not `empty`. The model tried and the gate threw it away, which is the
    // opposite fact from a model that correctly raised nothing.
    expect(rec.validation.status).toBe('rejected')
    expect(rec.validation.reasons).toEqual(['prohibited_language'])
    expect(JSON.stringify(rec)).not.toContain('proves the indoor source')
  })

  it('marks a structurally refused output as rejected', () => {
    const rec = buildForensicInterpretationRecord({ bundle, validation: run('garbage') })
    expect(rec.validation.status).toBe('rejected')
    expect(rec.interpretations).toEqual([])
  })

  it('tolerates missing model metadata and an absent bundle', () => {
    const rec = buildForensicInterpretationRecord({})
    expect(rec.fingerprint).toBeNull()
    expect(rec.model).toEqual({ provider: null, name: null, version: null })
    expect(rec.validation.status).toBe('empty')
    expect(typeof rec.generatedAt).toBe('string')
  })

  it('is the third record, separate from the analysis and from the review', () => {
    const rec = buildForensicInterpretationRecord({ bundle, validation: run(out([good()])) })
    // It references the analysis by fingerprint and carries none of it.
    expect(rec).not.toHaveProperty('events')
    expect(rec).not.toHaveProperty('patterns')
    expect(rec).not.toHaveProperty('datasets')
    // And carries no acceptance state; that is the assessor's record.
    expect(rec).not.toHaveProperty('accepted')
    expect(rec).not.toHaveProperty('review')
  })
})
