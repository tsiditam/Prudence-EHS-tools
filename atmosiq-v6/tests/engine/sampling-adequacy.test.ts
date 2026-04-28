import { describe, it, expect } from 'vitest'
import { evaluateSamplingAdequacy } from '../../src/engine/report/sampling-adequacy'
import type { SamplingContext } from '../../src/engine/types/reading'

describe('Sampling Adequacy — truth table', () => {
  it('laboratory + representative → forConclusion=true', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'laboratory', samplingContext: 'typical_operation', spatialCoverage: 'representative', temporalCoverage: 'full_shift' })
    expect(r.forConclusion).toBe(true)
    expect(r.forScreening).toBe(true)
    expect(r.forHypothesis).toBe(true)
  })

  it('continuous full_shift peak_occupancy → forConclusion=true', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'continuous', samplingContext: 'peak_occupancy', spatialCoverage: 'single_point', temporalCoverage: 'full_shift' })
    expect(r.forConclusion).toBe(true)
  })

  it('integrated full_shift → forConclusion=true', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'integrated', samplingContext: 'typical_operation', spatialCoverage: 'single_point', temporalCoverage: 'full_shift' })
    expect(r.forConclusion).toBe(true)
  })

  it('continuous short_duration occupied → screening only', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'continuous', samplingContext: 'occupied', spatialCoverage: 'single_point', temporalCoverage: 'short_duration' })
    expect(r.forConclusion).toBe(false)
    expect(r.forScreening).toBe(true)
    expect(r.forHypothesis).toBe(true)
  })

  it('grab occupied multi_point → screening only', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'grab', samplingContext: 'occupied', spatialCoverage: 'multi_point', temporalCoverage: 'momentary' })
    expect(r.forConclusion).toBe(false)
    expect(r.forScreening).toBe(true)
  })

  it('grab single_point → hypothesis only', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'grab', samplingContext: 'unknown', spatialCoverage: 'single_point', temporalCoverage: 'momentary' })
    expect(r.forConclusion).toBe(false)
    expect(r.forScreening).toBe(false)
    expect(r.forHypothesis).toBe(true)
  })

  it('visual_observation → hypothesis only', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'visual_observation', samplingContext: 'occupied', spatialCoverage: 'single_point', temporalCoverage: 'momentary' })
    expect(r.forConclusion).toBe(false)
    expect(r.forScreening).toBe(false)
    expect(r.forHypothesis).toBe(true)
  })

  it('occupant_feedback → hypothesis only', () => {
    const r = evaluateSamplingAdequacy({ sampleType: 'occupant_feedback', samplingContext: 'occupied', spatialCoverage: 'unknown', temporalCoverage: 'unknown' })
    expect(r.forConclusion).toBe(false)
    expect(r.forScreening).toBe(false)
    expect(r.forHypothesis).toBe(true)
  })
})
