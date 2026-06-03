/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Phase 3 engine improvements — versioned tests for the tier-precedence fix,
 * state-limit overlay, LSI corrosion index, weighted causal-chain confidence
 * + data gaps, citation tracker, and the advisory readiness gate.
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateResults,
  buildWaterCausalChains,
  escalateTier,
  highestTier,
  applyStateOverlay,
  computeLSI,
  bibliographyFor,
  buildReadiness,
  ENGINE_VERSION,
} from '../../src/engine'

describe('tier precedence (escalateTier)', () => {
  it('moves up only, never down', () => {
    expect(escalateTier('compliant', 'advisory')).toBe('advisory')
    expect(escalateTier('immediate', 'monitor')).toBe('immediate')
    expect(highestTier(['compliant', 'monitor', 'advisory'])).toBe('advisory')
  })

  it('a corrosive-pH advisory escalates a monitor tier (precedence fix)', () => {
    // Manganese SMCL exceedance alone -> monitor; adding corrosive pH must
    // raise the overall tier to advisory (the old `=== compliant` guard
    // would have left it stuck at monitor).
    const { tier } = evaluateResults([
      { id: 'mn', value: 60 }, // SMCL 50 -> monitor
      { id: 'ph', value: 6.0 }, // corrosive -> advisory
    ])
    expect(tier).toBe('advisory')
  })

  it('every finding is flagged screening_only', () => {
    const { findings } = evaluateResults([{ id: 'pb', value: 20 }])
    expect(findings.every((f) => f.screening_only === true)).toBe(true)
  })
})

describe('state-limit overlay', () => {
  it('flags a state PFAS sum over the program limit (MA PFAS6 <= 20)', () => {
    const ex = applyStateOverlay(
      [
        { id: 'pfoa', value: 6 },
        { id: 'pfos', value: 6 },
        { id: 'pfhxs', value: 6 },
        { id: 'pfna', value: 6 },
      ],
      'MA',
    )
    expect(ex.length).toBe(1)
    expect(ex[0].parameter).toBe('PFAS6 sum')
    expect(ex[0].value).toBe(24)
    expect(ex[0].stateLimit).toBe(20)
  })

  it('returns nothing for an unsupported / empty state', () => {
    expect(applyStateOverlay([{ id: 'pfoa', value: 99 }], '')).toEqual([])
    expect(applyStateOverlay([{ id: 'pfoa', value: 99 }], 'ZZ')).toEqual([])
  })
})

describe('Langelier Saturation Index', () => {
  it('computes a corrosive index for soft, low-pH water', () => {
    const r = computeLSI({ ph: 6.5, tds: 150, tempC: 15, calciumHardness: 40, alkalinity: 30 })
    expect(r).not.toBeNull()
    expect(r!.lsi).toBeLessThan(0)
    expect(r!.corrosive).toBe(true)
  })

  it('returns null when an input is missing (never fabricated)', () => {
    expect(computeLSI({ ph: 7, tds: 200, tempC: 20, calciumHardness: 120 })).toBeNull()
  })
})

describe('causal-chain confidence + data gaps', () => {
  it('weights confidence and lists data gaps', () => {
    const { findings } = evaluateResults([{ id: 'pb', value: 25 }]) // no pH measured
    const chains = buildWaterCausalChains({ b_pipe_mat: 'Unknown' }, findings)
    const lead = chains.find((c) => c.type === 'Lead Contamination')!
    expect(lead.confidenceScore).toBeGreaterThan(0)
    expect(lead.confidence).toBe('Preliminary') // anchor only
    expect(lead.dataGaps).toEqual(expect.arrayContaining([expect.stringMatching(/pH not measured/)]))
  })
})

describe('citation tracker (manifest-gated)', () => {
  it('bibliography lists only sources referenced by findings', () => {
    const { findings } = evaluateResults([{ id: 'pb', value: 20 }]) // EPA Action Level
    const bib = bibliographyFor(findings)
    expect(bib.length).toBeGreaterThan(0)
    expect(bib.some((s) => s.id === 'lcrr')).toBe(true)
    // Nothing unrelated (e.g. ASHRAE 188) should appear for a lead-only set.
    expect(bib.some((s) => s.id === 'ashrae188')).toBe(false)
  })
})

describe('readiness gate (advisory)', () => {
  it('flags missing assessor identity as a hard (advisory) blocker', () => {
    const rd = buildReadiness({ assessor: {}, source: { src_type: 'Private well — drilled' }, labResults: [{ id: 'pb', value: 1 }] })
    expect(rd.ready).toBe(false)
    expect(rd.blockers.some((b) => b.id === 'assessor_name' && b.tier === 'hard')).toBe(true)
  })

  it('is ready when identity + scope are present', () => {
    const rd = buildReadiness({ assessor: { a_name: 'T. Tamakloe, CSP' }, source: { src_type: 'Private well — drilled' }, labResults: [{ id: 'pb', value: 1 }] })
    expect(rd.ready).toBe(true)
  })
})

describe('engine version', () => {
  it('is bumped to 1.1.x for Phase 3', () => {
    expect(ENGINE_VERSION.startsWith('1.1')).toBe(true)
  })
})
