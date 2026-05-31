/**
 * Perceived-effort "thinking" delay heuristic.
 *
 * Pins the contract that a more complex question produces a longer hold
 * on the thinking indicator, while simple questions stay snappy:
 *   • empty → no complexity, base delay only
 *   • short/simple question → near the floor
 *   • long, multi-part, analytical question → near the cap
 *   • delay is monotonic in complexity and clamped to [base, max]
 */
import { describe, it, expect } from 'vitest'
import { questionComplexity, thinkDelayMs } from '../../src/hooks/useFieldAssistant'

const BASE = 250
const MAX = 2600

describe('questionComplexity', () => {
  it('scores empty input as 0', () => {
    expect(questionComplexity('')).toBe(0)
    expect(questionComplexity('   ')).toBe(0)
  })

  it('scores a short simple question low', () => {
    expect(questionComplexity('what is CO2?')).toBeLessThan(0.3)
  })

  it('scores a long, multi-part, analytical question high', () => {
    const q =
      'Compare ASHRAE 62.1 and 62.2 for a mixed-use building, explain why the ' +
      'ventilation rates differ, walk me through the trade-offs, and tell me ' +
      'what I should check next and how that affects the CO2 readings.'
    expect(questionComplexity(q)).toBeGreaterThan(0.7)
  })

  it('rewards analytical intent words', () => {
    const plain = questionComplexity('what is the PEL for benzene')
    const analytical = questionComplexity('explain why the PEL for benzene matters')
    expect(analytical).toBeGreaterThan(plain)
  })

  it('never exceeds 1', () => {
    const huge = 'compare and contrast '.repeat(80) + '? and why and how?'
    expect(questionComplexity(huge)).toBeLessThanOrEqual(1)
  })
})

describe('thinkDelayMs', () => {
  it('stays at the base floor for trivial input', () => {
    expect(thinkDelayMs('')).toBe(BASE)
    // A 2-char message contributes a negligible length score, so it
    // sits right at the floor (within a few ms of base).
    expect(thinkDelayMs('hi')).toBeGreaterThanOrEqual(BASE)
    expect(thinkDelayMs('hi')).toBeLessThan(BASE + 30)
  })

  it('is longer for a complex question than a simple one', () => {
    const simple = thinkDelayMs('what is CO2?')
    const complex = thinkDelayMs(
      'Compare ASHRAE 62.1 and 62.2, explain why the ventilation rates differ, ' +
      'and walk me through the trade-offs in detail for a mixed-use building.',
    )
    expect(complex).toBeGreaterThan(simple)
  })

  it('never exceeds the cap', () => {
    const huge = 'compare and contrast '.repeat(80) + '? and why and how?'
    expect(thinkDelayMs(huge)).toBeLessThanOrEqual(MAX)
    expect(thinkDelayMs(huge)).toBeGreaterThanOrEqual(BASE)
  })
})
