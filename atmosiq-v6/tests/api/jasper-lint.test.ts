/**
 * Unit tests for the Jasper chat-path output linter (api/_jasper-lint.js).
 *
 * Asserts the Jasper-specific bans trip on prohibited phrasing observed in
 * real outputs, the engine mirror is still applied, and safe screening
 * disclaimers are NOT over-blocked.
 */

import { describe, it, expect } from 'vitest'
import * as lintNs from '../../api/_jasper-lint.js'

const { lintJasperOutput, checkUnbackedThresholds, SAFE_FALLBACK, buildRevisionInstruction } =
  lintNs as unknown as {
    lintJasperOutput: (t: string) => Array<{ term: string }>
    checkUnbackedThresholds: (t: string, opts?: { retrievalUsed?: boolean }) => Array<{ term: string }>
    SAFE_FALLBACK: string
    buildRevisionInstruction: (hits: Array<{ recommendedFix?: string }>) => string
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

  it('trips on confidence applied to a source/cause', () => {
    expect(lintJasperOutput('The likely source is the standing water in the drain pan.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('CO2 is probably the cause of the complaints.').length).toBeGreaterThan(0)
  })

  it('trips on building-related symptoms and sick building', () => {
    expect(lintJasperOutput('These appear to be building-related symptoms.').length).toBeGreaterThan(0)
    expect(lintJasperOutput('This is consistent with a sick building.').length).toBeGreaterThan(0)
  })

  it('does NOT over-block safe screening disclaimers', () => {
    const ok =
      'CO2 at 1500 ppm is a ventilation indicator. This screening does not establish a building-related illness. IH Review Required'
    expect(lintJasperOutput(ok)).toEqual([])
  })

  it('does NOT block confidence about instrument reliability', () => {
    const ok =
      'The Q-Trak reading is highly reliable. Recommend confirmatory sampling before any interpretation. IH Review Required'
    expect(lintJasperOutput(ok)).toEqual([])
  })

  it('SAFE_FALLBACK keeps the four-section contract and closing line', () => {
    expect(SAFE_FALLBACK).toMatch(/## Assessment context/)
    expect(SAFE_FALLBACK).toMatch(/## Screening interpretation/)
    expect(SAFE_FALLBACK).toMatch(/## Recommended next steps/)
    expect(SAFE_FALLBACK).toMatch(/## Defensibility note/)
    expect(SAFE_FALLBACK.trim()).toMatch(/IH Review Required$/)
    expect(lintJasperOutput(SAFE_FALLBACK)).toEqual([])
  })

  it('buildRevisionInstruction names fixes and demands the four-section shape', () => {
    const instr = buildRevisionInstruction([
      { recommendedFix: 'Do not assert causation.' },
      { recommendedFix: 'Do not rate hypothesis strength.' },
    ])
    expect(instr).toMatch(/REVISION REQUIRED/)
    expect(instr).toMatch(/IH Review Required/)
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
