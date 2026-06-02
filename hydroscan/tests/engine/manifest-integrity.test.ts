/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Standards-integrity guard. Enforces the non-negotiable rule that every
 * regulatory value the engine emits traces back to the hardcoded
 * STANDARDS_MANIFEST — nothing invented or un-sourced. If a finding ever
 * cites a standard family not in the manifest, this fails.
 */

import { describe, it, expect } from 'vitest'
import {
  STD,
  ALL_PARAMS,
  PARAM_MAP,
  CATS,
  STANDARDS_MANIFEST,
  isManifestStandard,
} from '../../src/constants/standards.js'
import { evaluateResults } from '../../src/engine'

describe('STANDARDS_MANIFEST', () => {
  it('has a version and a non-empty source bibliography', () => {
    expect(STANDARDS_MANIFEST.version).toBeTruthy()
    expect(STANDARDS_MANIFEST.sources.length).toBeGreaterThan(0)
    for (const s of STANDARDS_MANIFEST.sources) {
      expect(s.id).toBeTruthy()
      expect(s.title).toBeTruthy()
      expect(s.citation).toBeTruthy()
    }
  })

  it('every parameter belongs to a known category', () => {
    for (const p of ALL_PARAMS) {
      expect(CATS).toContain(p.cat)
    }
  })

  it('PARAM_MAP covers every flattened parameter', () => {
    for (const p of ALL_PARAMS) {
      expect(PARAM_MAP[p.id]).toBe(p)
    }
  })
})

describe('engine emits only manifest-sourced standards', () => {
  // Drive every numeric parameter well above its limit so the engine emits
  // a violation/advisory for each, then assert every emitted std string is a
  // recognized (sourced) standard family.
  it('no finding cites an un-sourced standard family', () => {
    const results = ALL_PARAMS.map((p) => {
      // Choose a value that will exceed whatever threshold the param carries.
      if (p.unit === 'P/A') return { id: p.id, value: 'P', qualifier: 'P' }
      const limit =
        (typeof p.mcl === 'number' && p.mcl) ||
        (p.al as number) ||
        (p.mrdl as number) ||
        (typeof p.smcl === 'number' && (p.smcl as number)) ||
        (p.healthAdv as number) ||
        (p.epaAdv as number) ||
        (typeof p.who === 'number' && (p.who as number)) ||
        1
      return { id: p.id, value: (limit as number) * 5 }
    })
    // pH handled separately (range, not ceiling): push a corrosive value.
    results.push({ id: 'ph', value: 5.5 } as any)

    const { findings } = evaluateResults(results as any)
    const allStds: string[] = []
    for (const f of findings) {
      for (const v of f.violations) allStds.push(v.std)
      for (const a of f.advisories) allStds.push(a.std)
    }
    expect(allStds.length).toBeGreaterThan(0)
    const orphans = allStds.filter((s) => !isManifestStandard(s))
    expect(orphans).toEqual([])
  })

  it('isManifestStandard rejects an invented standard', () => {
    expect(isManifestStandard('Made-Up Standard 2030')).toBe(false)
    expect(isManifestStandard('EPA MCL')).toBe(true)
  })
})
