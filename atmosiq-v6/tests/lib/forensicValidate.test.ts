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
  validateForensicOutput, buildForensicInterpretationRecord,
  proseDigits, refuseForensicOutput,
  scanInterpretationLanguage, evidenceScopeForPattern, interpretationStatus,
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

describe('prose carries no quantitative digits', () => {
  // Two earlier cuts tried to be cleverer and each was a hole: checking only
  // unit-bearing figures let "the correlation was 0.93" through, and matching a
  // bare number against every scoped figure in any denomination accepted "4"
  // whenever ANY scoped quantity was four. Neither checked the claim, only the
  // digit. The deterministic layer owns every number; the reading owns none.
  it('rejects a unit-bearing figure, even one the record carries', () => {
    const co2 = bundle.parameters.find((p: any) => p.param === 'co2')
    const r = run(out([good({
      interpretation: `Readings averaged about ${Math.round(co2.stats.mean)} ppm and the pattern warrants review.`,
    })]))
    expect(reasons(r)).toEqual(['digits_in_prose'])
    expect(r.rejected[0].detail).toBe(String(Math.round(co2.stats.mean)))
  })

  it('rejects an invented figure anywhere the model wrote, not only the main text', () => {
    expect(reasons(run(out([good({ alternative_explanations: ['Outdoor sat at 999 µg/m³.'] })])))).toEqual(['digits_in_prose'])
    expect(reasons(run(out([good({ recommended_reviews: ['Re-measure against 77 °F.'] })])))).toEqual(['digits_in_prose'])
    expect(reasons(run(out([good({ title: 'Swing of 12345 ppm' })])))).toEqual(['digits_in_prose'])
  })

  it('rejects a bare count, a correlation coefficient and a day count alike', () => {
    for (const text of [
      'The trace is consistent with a swing in which 9 events coincided, and warrants review.',
      'The paired traces move together; the correlation was 0.93, which warrants review.',
      'The shape repeated on 6 of the recorded days and warrants review.',
      'The shape repeats on 4 of 4 days across 2 datasets, and warrants review.',
    ]) expect(reasons(run(out([good({ interpretation: text })]))), text).toEqual(['digits_in_prose'])
  })

  it('rejects a deterministic quantity even when the pattern carries it', () => {
    // 4 days observed and a peak hour of 14 ARE this pattern's figures. They
    // still do not belong in the prose: the card states them, the reading does
    // not, and a rule that accepted them could not tell a real 4 from a
    // fabricated one.
    expect(cyclePattern.summary.daysObserved).toBe(4)
    expect(cyclePattern.summary.peakHour).toBe(14)
    expect(reasons(run(out([good({ interpretation: 'The swing repeats across 4 days and warrants review.' })])))).toEqual(['digits_in_prose'])
    expect(reasons(run(out([good({ interpretation: 'The swing peaks near 14:00 each day and warrants review.' })])))).toEqual(['digits_in_prose'])
  })

  it('accepts cautious prose that states no number at all', () => {
    // The form the contract actually asks for: the card renders the figures,
    // the prose says what they might mean.
    const r = run(out([good({
      title: 'Repeating daily swing',
      interpretation: 'The recurring temporal pattern is consistent with scheduled occupancy or with mechanical-system operation. It cannot distinguish between them and requires confirmation.',
      alternative_explanations: ['A timed system start may contribute to the same shape.'],
      recommended_reviews: ['Compare the pattern against the operating schedule; this warrants review.'],
    })]))
    expect(reasons(r)).toEqual([])
  })

  it('accepts quantities written in words, which is what the prompt asks for', () => {
    const r = run(out([good({
      interpretation: 'The shape repeats on three of the four recorded days, roughly twice the overnight level, and warrants review.',
    })]))
    expect(reasons(r)).toEqual([])
  })

  it('quotes every offending token, in order, as the model wrote it', () => {
    expect(proseDigits('rose from 400 to 1,450 ppm over -3.5 hours')).toEqual(['400', '1,450', '-3.5'])
    expect(proseDigits('')).toEqual([])
    expect(proseDigits(null as never)).toEqual([])
  })
})

describe('the digit exemptions are narrow and named', () => {
  it('treats a digit glued to a letter before it as part of a name', () => {
    expect(proseDigits('PM2.5 and CO2 both moved; NO2 did not')).toEqual([])
    expect(proseDigits('the S520 category, logged on an MX1102')).toEqual([])
    // Detached, so it is a claim again — and so is a digit glued to a letter
    // AFTER it, which is a multiplier, not a name.
    expect(proseDigits('PM rose to 2.5')).toEqual(['2.5'])
    expect(proseDigits('roughly 1.5x the overnight level')).toEqual(['1.5'])
  })

  it('treats an ISO date as an instant, not a quantity', () => {
    expect(proseDigits('the step on 2026-03-02')).toEqual([])
    // A date fragment is not a date.
    expect(proseDigits('the step on 2026-03')).toEqual(['2026', '-03'])
  })

  it('treats an ordinal as an ordinal', () => {
    expect(proseDigits('on the 2nd and 3rd mornings, the 21st floor')).toEqual([])
    expect(proseDigits('2 mornings')).toEqual(['2'])
  })

  it('does NOT exempt a clock time, a unit figure or a numbered standard', () => {
    // Each was considered. The peak hour and every measured figure are the
    // deterministic layer's to state; the prompt forbids naming a standard,
    // and a gate more permissive than the prompt is the two disagreeing.
    expect(proseDigits('peaking near 14:00')).toEqual(['14', '00'])
    expect(proseDigits('a reading of 900 ppm')).toEqual(['900'])
    expect(proseDigits('compare against ASHRAE 62.1')).toEqual(['62.1'])
  })

  it('every reason the digit gate emits is in the declared vocabulary', () => {
    expect(REJECTION_REASONS).toContain('digits_in_prose')
    expect(REJECTION_REASONS).not.toContain('unsupported_figure')
    expect(REJECTION_REASONS).not.toContain('unsupported_number')
  })
})

describe('evidence is scoped to the pattern being interpreted', () => {
  const pmEvent = bundle.evidence.eventIds.find((id: string) => id.includes('-pm-'))!
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

  it('produces the same refused shape from the exported helper the client uses', () => {
    const r = refuseForensicOutput(bundle, 'unparseable_output', 'invalid_json')
    expect(r).toEqual({ ok: false, status: 'rejected', interpretations: [], fingerprint: bundle.fingerprint, rejected: [{ reason: 'unparseable_output', detail: 'invalid_json' }] })
    expect(r).toEqual({ ...run('not json at all'), rejected: [{ reason: 'unparseable_output', detail: 'invalid_json' }] })
    // An unknown reason cannot mint a new vocabulary entry.
    expect(refuseForensicOutput(bundle, 'made_up' as never).rejected[0].reason).toBe('malformed_output')
    expect(buildForensicInterpretationRecord({ bundle, validation: r }).validation.status).toBe('rejected')
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
      validation: { ok: true, interpretations: [{ pattern_id: 'x' }], rejected: [{ reason: 'digits_in_prose' }] },
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
