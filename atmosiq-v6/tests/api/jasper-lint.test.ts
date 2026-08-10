/**
 * Unit tests for the Jasper chat-path output linter (api/_jasper-lint.js).
 *
 * Asserts the Jasper-specific bans trip on prohibited phrasing observed in
 * real outputs, the engine mirror is still applied, and safe screening
 * disclaimers are NOT over-blocked.
 */

import { describe, it, expect } from 'vitest'
import * as lintNs from '../../api/_jasper-lint.js'

const {
  lintJasperOutput, checkUnbackedThresholds, SAFE_FALLBACK, buildRevisionInstruction,
  looksLikeThresholdQuestion, withThresholdVerifyNote, THRESHOLD_VERIFY_NOTE, AI_DISCLAIMER_LINE,
} = lintNs as unknown as {
    lintJasperOutput: (t: string) => Array<{ term: string }>
    checkUnbackedThresholds: (t: string, opts?: { retrievalUsed?: boolean }) => Array<{ term: string }>
    SAFE_FALLBACK: string
    buildRevisionInstruction: (hits: Array<{ recommendedFix?: string }>) => string
    looksLikeThresholdQuestion: (t: string) => boolean
    withThresholdVerifyNote: (t: string) => string
    THRESHOLD_VERIFY_NOTE: string
    AI_DISCLAIMER_LINE: string
  }

describe('jasper output linter', () => {
  it('trips on direct causation (engine mirror)', () => {
    expect(lintJasperOutput('The symptoms are caused by the HVAC mold.').length).toBeGreaterThan(0)
  })

  it('trips on negated causation ("not caused by")', () => {
    expect(lintJasperOutput('The symptoms are not caused by the ventilation.').length).toBeGreaterThan(0)
  })

  it('trips on hypothesis-strength rating', () => {
    expect(lintJasperOutput('The mold hypothesis is strong given the moisture.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('This remains a weak hypothesis.').length).toBeGreaterThan(0)
  })

  it('trips on confidence applied to a causal attribution', () => {
    // Confidence attached to an explicit cause/attribution — the moat.
    expect(lintJasperOutput('CO2 is probably the cause of the complaints.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('The elevated readings are likely caused by the HVAC recirculation.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('This is strongly attributable to the water intrusion.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('The mold is likely responsible for the odor complaints.').length).toBeGreaterThan(0)
  })

  it('does NOT trip on hedged identification of a physical source/origin (screening)', () => {
    // Identifying the probable source/origin of moisture or a contaminant is
    // core screening (IICRC S520 water classification) and the exact hedged
    // language the role prompt asks for — not an exposure→symptom cause.
    // Previously these tripped confidence-on-cause and, on retry, forced the
    // SAFE_FALLBACK refusal.
    expect(lintJasperOutput('The likely source is the standing water in the drain pan.')).toEqual([])
    expect(lintJasperOutput('The most probable source is under-ventilation during peak occupancy.')).toEqual([])
    expect(lintJasperOutput('Water intrusion is the likely origin given the staining pattern.')).toEqual([])
    expect(lintJasperOutput('A strong musty odor was noted near the return-air source register.')).toEqual([])
  })

  it('trips on building-related symptoms and sick building', () => {
    expect(lintJasperOutput('These appear to be building-related symptoms.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('This is consistent with a sick building.').length).toBeGreaterThan(0)
  })

  it('does NOT over-block safe screening disclaimers', () => {
    const ok =
      'CO2 at 1500 ppm is a ventilation indicator. This screening does not establish a building-related illness. AI-assisted response — verify before use.'
    expect(lintJasperOutput(ok)).toEqual([])
  })

  it('does NOT block confidence about instrument reliability', () => {
    const ok =
      'The Q-Trak reading is highly reliable. Recommend confirmatory sampling before any interpretation. AI-assisted response — verify before use.'
    expect(lintJasperOutput(ok)).toEqual([])
  })

  it('SAFE_FALLBACK keeps the four-section contract and closing line', () => {
    expect(SAFE_FALLBACK).toMatch(/## Assessment context/)
    expect(SAFE_FALLBACK).toMatch(/## Screening interpretation/)
    expect(SAFE_FALLBACK).toMatch(/## Recommended next steps/)
    expect(SAFE_FALLBACK).toMatch(/## Defensibility note/)
    expect(SAFE_FALLBACK.trim()).toMatch(/verify before use\.$/)
    expect(lintJasperOutput(SAFE_FALLBACK)).toEqual([])
  })

  it('buildRevisionInstruction names fixes and demands the four-section shape', () => {
    const instr = buildRevisionInstruction([
      { recommendedFix: 'Do not assert causation.' },
      { recommendedFix: 'Do not rate hypothesis strength.' },
    ])
    expect(instr).toMatch(/REVISION REQUIRED/)
    expect(instr).toMatch(/verify before use/)
    expect(instr).toMatch(/Do not assert causation\./)
  })
})

describe('jasper tool-backed threshold post-check', () => {
  it('flags a framework + concentration when no retrieval tool ran', () => {
    expect(checkUnbackedThresholds('Per Mølhave, 500 µg/m³ is the concern tier.', { retrievalUsed: false }).length)
      .toBeGreaterThan(0)
    expect(checkUnbackedThresholds('The OSHA PEL is 0.75 ppm 8-hr TWA.', { retrievalUsed: false }).length)
      .toBeGreaterThan(0)
    expect(checkUnbackedThresholds('EPA NAAQS PM2.5 is 35 µg/m³.', { retrievalUsed: false }).length)
      .toBeGreaterThan(0)
  })

  it('does NOT flag when a retrieval tool ran this turn', () => {
    expect(checkUnbackedThresholds('Per the tool, OSHA PEL is 0.75 ppm.', { retrievalUsed: true })).toEqual([])
    expect(checkUnbackedThresholds('Mølhave tier 200–3000 µg/m³.', { retrievalUsed: true })).toEqual([])
  })

  it('does NOT flag standard citations or years (no concentration unit)', () => {
    expect(checkUnbackedThresholds('Per ASHRAE 62.1-2025 §6.2.2.1, increase outdoor air.', { retrievalUsed: false }))
      .toEqual([])
    expect(checkUnbackedThresholds('ASHRAE 55-2023 governs thermal comfort.', { retrievalUsed: false })).toEqual([])
    expect(checkUnbackedThresholds('The EPA finalized the PM2.5 NAAQS revision in 2024.', { retrievalUsed: false }))
      .toEqual([])
  })

  it('does NOT flag a bare concentration with no framework nearby', () => {
    expect(checkUnbackedThresholds('The reading was 900 µg/m³ on the PID.', { retrievalUsed: false })).toEqual([])
  })
})

describe('looksLikeThresholdQuestion (pre-answer tool forcing)', () => {
  it('matches exposure-limit acronym asks', () => {
    for (const q of [
      'What is the OSHA PEL for carbon monoxide?',
      'TLV for benzene?',
      'whats the NIOSH REL on formaldehyde',
      'IDLH for hydrogen sulfide',
      'What is the NAAQS for PM2.5?',
    ]) expect(looksLikeThresholdQuestion(q)).toBe(true)
  })

  it('matches framework + value-word asks', () => {
    expect(looksLikeThresholdQuestion('What is the ASHRAE CO2 limit?')).toBe(true)
    expect(looksLikeThresholdQuestion('EPA radon concentration guideline')).toBe(true)
  })

  it('matches a direct "safe/acceptable level" ask', () => {
    expect(looksLikeThresholdQuestion('What is a safe level of radon?')).toBe(true)
    expect(looksLikeThresholdQuestion('acceptable TVOC concentration for an office')).toBe(true)
  })

  it('does NOT match conceptual / non-numeric questions', () => {
    for (const q of [
      'Explain demand-controlled ventilation.',
      'How does CO2 build up in a conference room?',
      'What is ASHRAE 62.1?',
      'Why might occupants report headaches?',
    ]) expect(looksLikeThresholdQuestion(q)).toBe(false)
  })

  it('is defensive about non-string input', () => {
    expect(looksLikeThresholdQuestion(undefined as unknown as string)).toBe(false)
    expect(looksLikeThresholdQuestion('')).toBe(false)
  })
})

describe('withThresholdVerifyNote', () => {
  it('inserts the verify note ABOVE the trailing disclaimer line', () => {
    const answer = `The OSHA PEL for CO is 50 ppm.\n\n${AI_DISCLAIMER_LINE}`
    const out = withThresholdVerifyNote(answer)
    expect(out).toContain('50 ppm')                      // answer preserved
    expect(out).toContain(THRESHOLD_VERIFY_NOTE)         // note added
    expect(out.trim().endsWith(AI_DISCLAIMER_LINE)).toBe(true) // disclaimer still last
    // Note sits before the disclaimer, not after it.
    expect(out.indexOf(THRESHOLD_VERIFY_NOTE)).toBeLessThan(out.lastIndexOf(AI_DISCLAIMER_LINE))
  })

  it('appends note + disclaimer when the answer lacks a trailing disclaimer', () => {
    const out = withThresholdVerifyNote('Per OSHA, the PEL is 50 ppm.')
    expect(out).toContain(THRESHOLD_VERIFY_NOTE)
    expect(out.trim().endsWith(AI_DISCLAIMER_LINE)).toBe(true)
  })
})
