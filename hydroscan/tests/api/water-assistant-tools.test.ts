/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Marlow tool-dispatch tests. Proves the assistant's tools return correct,
 * manifest-bound values and refuse to invent anything not in the manifest.
 */

import { describe, it, expect } from 'vitest'
import { dispatchTool, WATER_ASSISTANT_TOOLS } from '../../src/constants/water-assistant-tools.js'
import { PARAM_MAP, ALL_PARAMS } from '../../src/constants/standards.js'

describe('lookup_water_standard', () => {
  it('lead returns the 15 µg/L Action Level (no MCL)', () => {
    const r: any = dispatchTool('lookup_water_standard', { parameter: 'lead' })
    expect(r.found).toBe(true)
    expect(r.standard.actionLevel).toBe(15)
    expect(r.standard.mcl).toBeNull()
    expect(r.standard.mclg).toBe(0)
  })

  it('nitrate returns MCL 10 mg/L', () => {
    const r: any = dispatchTool('lookup_water_standard', { parameter: 'nitrate' })
    expect(r.found).toBe(true)
    expect(r.standard.mcl).toBe(10)
  })

  it('PFOA returns MCL 4 ppt', () => {
    const r: any = dispatchTool('lookup_water_standard', { parameter: 'PFOA' })
    expect(r.found).toBe(true)
    expect(r.standard.mcl).toBe(4)
  })

  it('an unknown parameter is refused (found:false) — never invented', () => {
    const r: any = dispatchTool('lookup_water_standard', { parameter: 'unobtanium' })
    expect(r.found).toBe(false)
    expect(r.standard).toBeUndefined()
  })

  it('every returned standard value matches the hardcoded manifest', () => {
    for (const p of ALL_PARAMS) {
      const r: any = dispatchTool('lookup_water_standard', { parameter: p.id })
      expect(r.found).toBe(true)
      const src = PARAM_MAP[p.id]
      expect(r.standard.mcl).toBe(src.mcl ?? null)
      expect(r.standard.actionLevel).toBe(src.al ?? null)
      expect(r.standard.whoGuideline).toBe(src.who ?? null)
    }
  })
})

describe('lookup_sampling_method', () => {
  it('PFOA -> EPA 533 / 537.1, HDPE, 14-day hold', () => {
    const r: any = dispatchTool('lookup_sampling_method', { parameter: 'PFOA' })
    expect(r.found).toBe(true)
    expect(r.method.methods.join(' ')).toContain('EPA 533')
    expect(r.method.hold).toContain('14')
  })
  it('E. coli -> SM 9223, 6-hour hold', () => {
    const r: any = dispatchTool('lookup_sampling_method', { parameter: 'e. coli' })
    expect(r.found).toBe(true)
    expect(r.method.methods.join(' ')).toContain('9223')
    expect(r.method.hold).toContain('6 hours')
  })
})

describe('lookup_health_effects', () => {
  it('arsenic is flagged IARC Group 1', () => {
    const r: any = dispatchTool('lookup_health_effects', { parameter: 'arsenic' })
    expect(r.found).toBe(true)
    expect(r.healthEffects.carcinogen).toBe('Group 1')
  })
})

describe('lookup_state_limit', () => {
  it('NJ PFOA stricter limit (14 ppt)', () => {
    const r: any = dispatchTool('lookup_state_limit', { parameter: 'pfoa', state: 'NJ' })
    expect(r.found).toBe(true)
    expect(r.stateLimit.limit).toBe(14)
  })
  it('unsupported state returns found:false', () => {
    const r: any = dispatchTool('lookup_state_limit', { parameter: 'pfoa', state: 'ZZ' })
    expect(r.found).toBe(false)
  })
})

describe('search_standards_corpus', () => {
  it('finds the PFAS Hazard Index chunk', () => {
    const r: any = dispatchTool('search_standards_corpus', { query: 'how does the PFAS hazard index work' })
    expect(r.found).toBe(true)
    expect(r.results[0].text.toLowerCase()).toContain('hazard index')
    expect(r.results[0].citation).toBeTruthy()
  })
})

describe('list_known_parameters', () => {
  it('lists the full manifest parameter set', () => {
    const r: any = dispatchTool('list_known_parameters', {})
    expect(r.found).toBe(true)
    expect(r.parameters.length).toBe(ALL_PARAMS.length)
  })
})

describe('tool schemas', () => {
  it('every tool has a name + input_schema (Anthropic shape)', () => {
    for (const t of WATER_ASSISTANT_TOOLS) {
      expect(t.name).toBeTruthy()
      expect(t.input_schema.type).toBe('object')
    }
  })
})
