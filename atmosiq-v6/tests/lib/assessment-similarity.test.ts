/**
 * Cross-Assessment Similarity — pure feature extraction + scoring.
 *
 * Pins the contract Play 2's institutional-memory UI relies on:
 *   • extractFeatures handles the loose runtime shape (building or
 *     bldg, presurvey nested or top-level, missing fields)
 *   • scoreSimilarity returns 0-1, weights normalize against the
 *     features both sides COULD compare (sparse past assessments
 *     don't get unfairly zeroed)
 *   • findSimilarAssessments excludes the current id, respects the
 *     threshold + limit, and orders by descending score
 *   • aggregatePatterns surfaces the right summary fields for the UI
 */
import { describe, it, expect } from 'vitest'
import {
  extractFeatures,
  scoreSimilarity,
  summarizePastAssessment,
  aggregatePatterns,
  findSimilarAssessments,
  __test,
} from '../../src/utils/assessmentSimilarity.js'

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'A-1',
    ts: '2026-04-01',
    building: { fn: 'Test Tower', ft: 'Commercial Office', ba: 2005, ht: 'Central AHU — VAV' },
    presurvey: { ps_reason: 'Occupant complaint(s)', ps_water_history: 'No known history' },
    comp: { tot: 78 },
    recs: { imm: [{ text: 'Inspect supply diffuser drip pan' }] },
    moldResults: { detected: false },
    ...overrides,
  }
}

describe('extractFeatures', () => {
  it('extracts the canonical feature shape from a full assessment', () => {
    const f = extractFeatures(makeAssessment())
    expect(f.facilityType).toBe('Commercial Office')
    expect(f.yearBuilt).toBe(2005)
    expect(f.hvacType).toBe('Central AHU — VAV')
    expect(f.triggerReason).toBe('Occupant complaint(s)')
    expect(f.waterHistory).toBe('No known history')
  })

  it('returns nulls for missing fields without throwing', () => {
    expect(extractFeatures({}).facilityType).toBeNull()
    expect(extractFeatures(null).yearBuilt).toBeNull()
    expect(extractFeatures(undefined).hvacType).toBeNull()
  })

  it('accepts the legacy assessment.bldg shape', () => {
    const f = extractFeatures({ bldg: { ft: 'School / University', ba: 1995 } })
    expect(f.facilityType).toBe('School / University')
    expect(f.yearBuilt).toBe(1995)
  })

  it('rejects out-of-range year built values', () => {
    expect(extractFeatures({ building: { ba: 1000 } }).yearBuilt).toBeNull()
    expect(extractFeatures({ building: { ba: 3500 } }).yearBuilt).toBeNull()
    expect(extractFeatures({ building: { ba: 'not a number' } }).yearBuilt).toBeNull()
  })
})

describe('scoreSimilarity', () => {
  function f(overrides: Partial<ReturnType<typeof extractFeatures>>) {
    return {
      facilityType: 'Commercial Office',
      hvacType: 'Central AHU — VAV',
      triggerReason: 'Occupant complaint(s)',
      yearBuilt: 2005,
      waterHistory: 'No known history',
      ...overrides,
    }
  }

  it('returns 1.0 when every feature matches identically', () => {
    expect(scoreSimilarity(f({}), f({}))).toBe(1)
  })

  it('weights facility type the heaviest', () => {
    const onlyTypeMatches = scoreSimilarity(
      f({}),
      f({ facilityType: 'Commercial Office', hvacType: 'Different', triggerReason: 'Other', yearBuilt: 1900, waterHistory: 'Yes — recurring' }),
    )
    const onlyHvacMatches = scoreSimilarity(
      f({}),
      f({ facilityType: 'Healthcare', hvacType: 'Central AHU — VAV', triggerReason: 'Other', yearBuilt: 1900, waterHistory: 'Yes — recurring' }),
    )
    expect(onlyTypeMatches).toBeGreaterThan(onlyHvacMatches)
  })

  it('gives graceful partial credit for year built within window', () => {
    // 5 years apart → 50% of YEAR_W; 0 apart → 100%; 10+ → 0%
    const sameYear = scoreSimilarity(f({}), f({}))
    const fiveOff = scoreSimilarity(f({}), f({ yearBuilt: 2010 }))
    const tenOff = scoreSimilarity(f({}), f({ yearBuilt: 2015 }))
    const fifteenOff = scoreSimilarity(f({}), f({ yearBuilt: 2020 }))
    expect(sameYear).toBeGreaterThan(fiveOff)
    expect(fiveOff).toBeGreaterThan(tenOff)
    // 15 off rolls off the window; tenOff and fifteenOff both give 0 year credit
    expect(tenOff).toBeCloseTo(fifteenOff, 5)
  })

  it('does not penalize a past assessment for missing fields (normalizes against shared features)', () => {
    const sparsePast = { facilityType: 'Commercial Office', hvacType: null, triggerReason: null, yearBuilt: null, waterHistory: null }
    const score = scoreSimilarity(f({}), sparsePast)
    // Only facilityType is comparable on both sides — full credit for that single feature
    expect(score).toBe(1)
  })

  it('returns 0 when no comparable features exist', () => {
    const current = { facilityType: null, hvacType: null, triggerReason: null, yearBuilt: null, waterHistory: null }
    const past = f({})
    expect(scoreSimilarity(current, past)).toBe(0)
  })

  it('rejects null/undefined inputs gracefully', () => {
    expect(scoreSimilarity(null, null)).toBe(0)
    expect(scoreSimilarity(f({}), null)).toBe(0)
    expect(scoreSimilarity(undefined, f({}))).toBe(0)
  })

  it('weight constants are exposed and sum near 1', () => {
    const sum = __test.TYPE_W + __test.HVAC_W + __test.TRIGGER_W + __test.YEAR_W + __test.WATER_W
    expect(sum).toBeCloseTo(1, 5)
  })
})

describe('summarizePastAssessment', () => {
  it('returns the canonical summary shape', () => {
    const summary = summarizePastAssessment(makeAssessment())
    expect(summary).not.toBeNull()
    expect(summary!.facilityName).toBe('Test Tower')
    expect(summary!.facilityType).toBe('Commercial Office')
    expect(summary!.score).toBe(78)
    expect(summary!.immediateActions).toEqual(['Inspect supply diffuser drip pan'])
    expect(summary!.immediateCount).toBe(1)
    expect(summary!.moldDetected).toBe(false)
  })

  it('handles string-shape immediate recommendations', () => {
    const a = makeAssessment({ recs: { imm: ['Replace MERV 8 filter with MERV 13'] } })
    const s = summarizePastAssessment(a)
    expect(s!.immediateActions).toEqual(['Replace MERV 8 filter with MERV 13'])
  })

  it('caps immediate actions at 3', () => {
    const many = Array.from({ length: 10 }, (_, i) => `Action ${i}`)
    const a = makeAssessment({ recs: { imm: many } })
    const s = summarizePastAssessment(a)
    expect(s!.immediateActions).toHaveLength(3)
    expect(s!.immediateCount).toBe(10)
  })

  it('returns null for missing input', () => {
    expect(summarizePastAssessment(null)).toBeNull()
    expect(summarizePastAssessment(undefined)).toBeNull()
  })
})

describe('aggregatePatterns', () => {
  it('emits an empty summary when there are zero matches', () => {
    const out = aggregatePatterns(extractFeatures(makeAssessment()), [])
    expect(out.matchCount).toBe(0)
    expect(out.averageScore).toBeNull()
    expect(out.commonImmediateActions).toEqual([])
    expect(out.moldRate).toBeNull()
  })

  it('computes the average composite score across matches', () => {
    const matches = [
      { summary: { score: 80, immediateActions: [], moldDetected: false } },
      { summary: { score: 60, immediateActions: [], moldDetected: false } },
      { summary: { score: 70, immediateActions: [], moldDetected: false } },
    ]
    const out = aggregatePatterns(extractFeatures(makeAssessment()), matches as never)
    expect(out.averageScore).toBe(70)
  })

  it('surfaces recommendations repeated across ≥ 2 matches', () => {
    const matches = [
      { summary: { score: 70, immediateActions: ['Inspect drip pan', 'Replace filter'], moldDetected: false } },
      { summary: { score: 65, immediateActions: ['Inspect drip pan'], moldDetected: false } },
      { summary: { score: 75, immediateActions: ['Replace filter'], moldDetected: false } },
      { summary: { score: 60, immediateActions: ['One-off action'], moldDetected: false } },
    ]
    const out = aggregatePatterns(extractFeatures(makeAssessment()), matches as never)
    const actions = out.commonImmediateActions.map((a: { action: string; count: number }) => a.action)
    expect(actions).toContain('Inspect drip pan')
    expect(actions).toContain('Replace filter')
    expect(actions).not.toContain('One-off action')
  })

  it('reports mold-detection rate across matches', () => {
    const matches = [
      { summary: { score: 70, immediateActions: [], moldDetected: true } },
      { summary: { score: 70, immediateActions: [], moldDetected: true } },
      { summary: { score: 70, immediateActions: [], moldDetected: false } },
      { summary: { score: 70, immediateActions: [], moldDetected: false } },
    ]
    const out = aggregatePatterns(extractFeatures(makeAssessment()), matches as never)
    expect(out.moldRate).toBe(50)
  })
})

describe('findSimilarAssessments', () => {
  it('returns empty matches when no past assessments are similar', () => {
    const current = makeAssessment()
    const past = [
      makeAssessment({ id: 'B-1', building: { ft: 'Healthcare', ba: 1950, ht: 'PTAC / PTHP' }, presurvey: { ps_reason: 'Routine / scheduled assessment' } }),
    ]
    const out = findSimilarAssessments(current, past)
    expect(out.matches).toHaveLength(0)
    expect(out.patterns.matchCount).toBe(0)
  })

  it('ranks matches by descending similarity score', () => {
    const current = makeAssessment()
    const past = [
      makeAssessment({ id: 'B-1' }), // identical features
      makeAssessment({ id: 'B-2', building: { ft: 'Commercial Office', ba: 2003, ht: 'Different' } }), // type + year match
      makeAssessment({ id: 'B-3', building: { ft: 'Commercial Office', ba: 1990, ht: 'Different' } }), // type only, year out of window
    ]
    const out = findSimilarAssessments(current, past)
    expect(out.matches.map(m => m.id)).toEqual(['B-1', 'B-2', 'B-3'])
    expect(out.matches[0].score).toBeGreaterThan(out.matches[1].score)
  })

  it('excludes the current assessment by id', () => {
    const current = makeAssessment()
    const past = [makeAssessment(), makeAssessment({ id: 'B-1' })]
    const out = findSimilarAssessments(current, past)
    expect(out.matches.map(m => m.id)).toEqual(['B-1'])
  })

  it('respects the limit option', () => {
    const current = makeAssessment()
    const past = Array.from({ length: 10 }, (_, i) => makeAssessment({ id: `B-${i}` }))
    const out = findSimilarAssessments(current, past, { limit: 3 })
    expect(out.matches).toHaveLength(3)
  })

  it('respects a custom threshold (stricter match cut-off)', () => {
    const current = makeAssessment()
    const past = [
      makeAssessment({ id: 'B-1' }), // 1.0 similarity
      makeAssessment({ id: 'B-2', building: { ft: 'Commercial Office', ba: 1990, ht: 'Different' } }), // partial
    ]
    const strict = findSimilarAssessments(current, past, { threshold: 0.9 })
    expect(strict.matches.map(m => m.id)).toEqual(['B-1'])
  })

  it('handles a non-array pastAssessments arg gracefully', () => {
    const out = findSimilarAssessments(makeAssessment(), null as never)
    expect(out.matches).toEqual([])
    expect(out.patterns.matchCount).toBe(0)
  })
})
