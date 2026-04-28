/**
 * AtmosFlow Engine v2.1 — Sampling Adequacy Evaluation
 * Four-axis tagging determines what conclusions data can support.
 */

import type { SamplingContext } from '../types/reading'
import type { SamplingAdequacyEvaluation } from '../types/domain'

export function evaluateSamplingAdequacy(sampling: SamplingContext): SamplingAdequacyEvaluation {
  const rationale: string[] = []
  let forConclusion = false
  let forScreening = false
  let forHypothesis = true // almost everything supports hypothesis

  const { sampleType, samplingContext: ctx, spatialCoverage, temporalCoverage } = sampling

  // Laboratory with chain of custody + representative spatial
  if (sampleType === 'laboratory' && (spatialCoverage === 'multi_point' || spatialCoverage === 'representative')) {
    forConclusion = true
    forScreening = true
    rationale.push('Laboratory analysis with representative spatial coverage supports definitive conclusion.')
  }
  // Continuous full-shift at peak occupancy (matches OSHA methodology)
  else if (sampleType === 'continuous' && temporalCoverage === 'full_shift' && ctx === 'peak_occupancy') {
    forConclusion = true
    forScreening = true
    rationale.push('Continuous full-shift sampling at peak occupancy matches OSHA methodology.')
  }
  // Integrated full-shift
  else if (sampleType === 'integrated' && temporalCoverage === 'full_shift') {
    forConclusion = true
    forScreening = true
    rationale.push('Integrated full-shift sampling supports definitive conclusion.')
  }
  // Continuous short-duration or momentary while occupied
  else if (sampleType === 'continuous' && (temporalCoverage === 'short_duration' || temporalCoverage === 'momentary') && (ctx === 'occupied' || ctx === 'typical_operation' || ctx === 'peak_occupancy')) {
    forScreening = true
    rationale.push('Continuous short-duration sampling while occupied supports screening-level inference.')
  }
  // Grab sample occupied multi-point
  else if (sampleType === 'grab' && (ctx === 'occupied' || ctx === 'typical_operation') && spatialCoverage === 'multi_point') {
    forScreening = true
    rationale.push('Grab samples at multiple occupied locations support screening-level inference.')
  }
  // Grab sample single-point or unknown
  else if (sampleType === 'grab') {
    rationale.push('Single-point grab sample supports hypothesis generation only.')
  }
  // Visual observation
  else if (sampleType === 'visual_observation') {
    // Categorical presence (e.g., "mold is present") can support screening for presence-of
    rationale.push('Visual observation supports hypothesis and presence-of screening only.')
  }
  // Occupant feedback
  else if (sampleType === 'occupant_feedback') {
    rationale.push('Occupant feedback is anecdotal and supports hypothesis generation only.')
  }
  // Unknown/other
  else {
    rationale.push(`Sample type '${sampleType}' with context '${ctx}' — supports hypothesis only.`)
  }

  return { forConclusion, forScreening, forHypothesis, rationale }
}
