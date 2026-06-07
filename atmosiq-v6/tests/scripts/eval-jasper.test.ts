/**
 * Unit tests for the Jasper eval scorer (scripts/eval-jasper.mjs, P1 item 6).
 * Proves each dimension catches its failure mode and that a good fixture
 * passes all four.
 */

import { describe, it, expect } from 'vitest'
import {
  scoreScenario,
  scoreTruncation,
  scoreValueFidelity,
  scoreLeakage,
  scoreNextStep,
} from '../../scripts/eval-jasper.mjs'

const GOOD = [
  '## Assessment context',
  '- CO₂ 1500 ppm vs 415 ppm outdoor; OA damper at minimum.',
  '- Missing: outdoor-air CFM, occupancy count.',
  '',
  '## Screening interpretation',
  '- The differential is a ventilation-adequacy indicator, not a toxic exposure.',
  '',
  '## Recommended next steps',
  '1. Measure delivered outdoor-air CFM.',
  '2. Capture occupancy count and HVAC mode at the reading time.',
  '3. Document the drain-pan moisture and route it to maintenance.',
  '',
  '## Defensibility note',
  'Screening evidence only; causation needs more data and a qualified IH.',
  '',
  'IH Review Required',
].join('\n')

describe('eval scorer — good fixture passes all dimensions', () => {
  it('passes', () => {
    const r = scoreScenario(
      { id: 'X', answer: GOOD, tool_calls: ['search_standards_corpus'], next_step_manual_score: 0.8 },
    )
    expect(r.pass).toBe(true)
    expect(r.dims.truncation.pass).toBe(true)
    expect(r.dims.value_fidelity.pass).toBe(true)
    expect(r.dims.leakage.pass).toBe(true)
    expect(r.dims.next_step.pass).toBe(true)
  })
})

describe('eval scorer — each dimension catches its failure', () => {
  it('truncation: missing section / closing line fails', () => {
    const truncated = '## Assessment context\n- CO₂ 1500 ppm.\n\n## Screening interpretation\n- The reading is el'
    expect(scoreTruncation(truncated).pass).toBe(false)
  })

  it('value_fidelity: framework + concentration with no retrieval tool fails', () => {
    const a = 'Per Mølhave, 500 µg/m³ is the concern tier. IH Review Required'
    expect(scoreValueFidelity(a, []).pass).toBe(false)
    expect(scoreValueFidelity(a, ['search_standards_corpus']).pass).toBe(true)
  })

  it('leakage: prohibited causation phrasing fails', () => {
    expect(scoreLeakage('The symptoms are caused by the HVAC. IH Review Required').pass).toBe(false)
  })

  it('next_step: fewer than 3 steps or low manual score fails', () => {
    const fewSteps = '## Recommended next steps\n1. Do one thing.\n\n## Defensibility note\nx'
    expect(scoreNextStep(fewSteps, 0.9).pass).toBe(false)
    const threeSteps = '## Recommended next steps\n1. A.\n2. B.\n3. C.\n\n## Defensibility note\nx'
    expect(scoreNextStep(threeSteps, 0.3).pass).toBe(false) // manual too low
    expect(scoreNextStep(threeSteps, 0.8).pass).toBe(true)
  })
})
