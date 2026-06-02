/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Golden-fixture pins for the HydroScan compliance + causal engines. These
 * lock the behavior relocated out of App.jsx in Phase 1 so the Phase 3
 * engine improvements can only change outputs deliberately (a failing
 * assertion here means an intended, reviewable delta — or a regression).
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateResults,
  buildWaterCausalChains,
  generateSamplingPlan,
  generateRecommendations,
} from '../../src/engine'

describe('evaluateResults — tiering', () => {
  it('E. coli present → immediate, EPA MCL violation', () => {
    const { findings, tier } = evaluateResults([{ id: 'ecoli', value: 'P', qualifier: 'P' }])
    expect(tier).toBe('immediate')
    const f = findings.find((x) => x.param.id === 'ecoli')!
    expect(f.violations[0].std).toBe('EPA MCL')
    expect(f.violations[0].severity).toBe('critical')
  })

  it('Total coliforms present → advisory via RTCR', () => {
    const { findings, tier } = evaluateResults([{ id: 'tc', value: 'P', qualifier: 'P' }])
    expect(tier).toBe('advisory')
    expect(findings[0].violations[0].std).toBe('EPA RTCR')
  })

  it('Lead 20 µg/L exceeds Action Level → immediate', () => {
    const { findings, tier } = evaluateResults([{ id: 'pb', value: 20 }])
    expect(tier).toBe('immediate')
    expect(findings[0].violations[0].std).toBe('EPA Action Level')
  })

  it('Nitrate 12 mg/L exceeds MCL (acute) → immediate, critical', () => {
    const { findings, tier } = evaluateResults([{ id: 'no3', value: 12 }])
    expect(tier).toBe('immediate')
    expect(findings[0].violations[0].std).toBe('EPA MCL')
    expect(findings[0].violations[0].severity).toBe('critical')
  })

  it('Arsenic 9 µg/L (>80% of 10) → monitor advisory, no violation', () => {
    const { findings, tier } = evaluateResults([{ id: 'as', value: 9 }])
    expect(tier).toBe('monitor')
    expect(findings[0].violations).toHaveLength(0)
    expect(findings[0].advisories[0].severity).toBe('low')
  })

  it('Low pH 6.0 → advisory (corrosive)', () => {
    const { findings, tier } = evaluateResults([{ id: 'ph', value: 6.0 }])
    expect(tier).toBe('advisory')
    expect(findings[0].advisories[0].std).toBe('EPA SMCL')
  })

  it('Arsenic 2 µg/L → compliant pass', () => {
    const { findings, tier } = evaluateResults([{ id: 'as', value: 2 }])
    expect(tier).toBe('compliant')
    expect(findings[0].violations).toHaveLength(0)
    expect(findings[0].advisories).toHaveLength(0)
  })
})

describe('evaluateResults — PFAS Hazard Index', () => {
  it('PFHxS 5 + PFNA 6 → HI 1.1 > 1 → immediate + pfas_hi finding', () => {
    const { findings, tier } = evaluateResults([
      { id: 'pfhxs', value: 5 },
      { id: 'pfna', value: 6 },
    ])
    expect(tier).toBe('immediate')
    const hi = findings.find((f) => f.param.id === 'pfas_hi')!
    expect(hi).toBeDefined()
    expect(hi.violations[0].std).toContain('EPA PFAS NPDWR')
    // 5/10 + 6/10 = 1.100
    expect(hi.value).toBe('1.100')
  })

  it('PFHxS 3 + PFNA 3 → HI 0.6 → monitor advisory', () => {
    const { findings, tier } = evaluateResults([
      { id: 'pfhxs', value: 3 },
      { id: 'pfna', value: 3 },
    ])
    expect(tier).toBe('monitor')
    const hi = findings.find((f) => f.param.id === 'pfas_hi')!
    expect(hi.advisories[0].std).toBe('EPA PFAS NPDWR')
  })
})

describe('buildWaterCausalChains', () => {
  it('lead violation + lead service line + low pH + stagnation → Strong lead chain', () => {
    const { findings } = evaluateResults([
      { id: 'pb', value: 25 },
      { id: 'ph', value: 6.2 },
    ])
    const chains = buildWaterCausalChains(
      { b_pipe_mat: 'Lead', b_stag: 'Yes — vacant floors / wings' },
      findings,
    )
    const lead = chains.find((c) => c.type === 'Lead Contamination')!
    expect(lead).toBeDefined()
    expect(lead.confidence).toBe('Strong')
    expect(lead.severity).toBe('critical')
  })

  it('E. coli + flooded well + septic proximity → microbial chain', () => {
    const { findings } = evaluateResults([{ id: 'ecoli', value: 'P', qualifier: 'P' }])
    const chains = buildWaterCausalChains(
      { src_type: 'Private well — drilled', src_well_flood: 'Yes — significant flooding', src_well_prox: ['Septic system (< 50 ft)'] },
      findings,
    )
    expect(chains.some((c) => c.type === 'Microbial Contamination')).toBe(true)
  })
})

describe('generateSamplingPlan', () => {
  it('untested private well yields a basic chemistry + PFAS plan', () => {
    const plan = generateSamplingPlan({ src_type: 'Private well — drilled', src_history: 'No prior testing' })
    expect(plan.some((p) => p.test === 'Basic Water Chemistry')).toBe(true)
    expect(plan.some((p) => p.test.includes('PFAS'))).toBe(true)
  })
})

describe('generateRecommendations', () => {
  it('E. coli violation produces a boil-water immediate action', () => {
    const { findings, tier } = evaluateResults([{ id: 'ecoli', value: 'P', qualifier: 'P' }])
    const chains = buildWaterCausalChains({}, findings)
    const recs = generateRecommendations(tier, findings, chains, {})
    expect(recs.immediate.some((r) => r.includes('BOIL WATER ADVISORY'))).toBe(true)
  })
})
