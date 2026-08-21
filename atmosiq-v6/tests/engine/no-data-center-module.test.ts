/**
 * The data-center specialty module is gone and stays gone.
 *
 * Removed in 2026-08 at the product owner's direction: the DATA_CENTER
 * building profile, the `Data Center` facility type and its premium
 * enterprise gate, the data-hall scoring branches, the corrosion and
 * particle-classification reasoning, and the five standards that existed
 * only to serve it — ANSI/ISA 71.04, ISO 14644-1, ASHRAE TC 9.9,
 * IEEE 1635 / ASHRAE Guideline 21 and NFPA 855.
 *
 * A removal this wide across this many layers (53 files touched) comes
 * back one helper at a time if nothing watches it, and the failure mode
 * is quiet: a re-added ConditionType with no phrase entry, or a citation
 * matcher for a standard nothing applies. This asserts the absence at
 * every layer the module used to reach, so a partial restoration fails
 * here rather than shipping a half-module.
 *
 * NOT asserted, deliberately: `SITE_TYPES` in projectStore.js still
 * offers "Data Center" as a project label. That is filing metadata, not
 * the engine facility type — see docs/CRITERIA.md.
 */
import { describe, it, expect } from 'vitest'

import { BUILDING_PROFILES, getBuildingProfile } from '../../src/engines/buildingProfiles.js'
import { Q_BUILDING, Q_QUICKSTART } from '../../src/constants/questions.js'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'
import { PHRASE_LIBRARY } from '../../src/engine/report/phrases'
import { HYPOTHESIS_RULE_KEYS } from '../../src/engine/hypotheses'
import { scoreZone } from '../../src/engines/scoring.js'
import { deriveCausalChains } from '../../src/engine/causal-chains'

/** The five standards that existed only to serve the data-center module. */
const DC_STANDARDS = [
  'ANSI/ISA 71.04', 'ISA 71.04', 'ISO 14644', 'ASHRAE TC 9.9',
  'IEEE 1635', 'ASHRAE Guideline 21', 'NFPA 855',
]

describe('the data-center profile is gone', () => {
  it('no profile is keyed DATA_CENTER', () => {
    expect(Object.keys(BUILDING_PROFILES)).not.toContain('DATA_CENTER')
    expect(Object.values(BUILDING_PROFILES as Record<string, { id: string }>)
      .map((p) => p.id)).not.toContain('data_center')
  })

  it('getBuildingProfile no longer resolves one for a data-center building', () => {
    for (const name of ['Data Center', 'data center', 'Data Centre', 'datacenter']) {
      expect(getBuildingProfile(name), `"${name}" still resolves a profile`).toBeNull()
    }
  })

  it('Data Center is not offered as a facility type, and nothing is premium-gated', () => {
    for (const list of [Q_BUILDING, Q_QUICKSTART] as Array<Array<Record<string, unknown>>>) {
      const ft = list.find((q) => q.id === 'ft')
      expect(ft, 'the facility-type question disappeared').toBeTruthy()
      expect(ft!.opts as string[]).not.toContain('Data Center')
      // The premium gate existed only for this option.
      expect(ft!.premiumOpts, 'a premium gate came back').toBeUndefined()
    }
  })
})

describe('the data-center standards are gone', () => {
  it('none appears in the standards manifest', () => {
    const keys = Object.keys(STANDARDS_MANIFEST).join(' | ')
    for (const std of DC_STANDARDS) {
      expect(keys, `${std} is back in the manifest`).not.toContain(std)
    }
  })

  it('no phrase template cites one', () => {
    const entries = Object.values(PHRASE_LIBRARY) as Array<{
      conditionType: string
      intentTemplate: string
      defaultLimitations: ReadonlyArray<string>
      defaultRecommendedActions: ReadonlyArray<{ action: string; standardReference?: string }>
    }>
    expect(entries.length, 'the phrase library vanished — this would pass vacuously')
      .toBeGreaterThan(20)
    for (const e of entries) {
      const text = [
        e.intentTemplate,
        ...e.defaultLimitations,
        ...e.defaultRecommendedActions.flatMap((a) => [a.action, a.standardReference ?? '']),
      ].join(' ')
      for (const std of DC_STANDARDS) {
        expect(text, `${e.conditionType} cites ${std}`).not.toContain(std)
      }
    }
  })
})

describe('the data-center reasoning is gone', () => {
  it('the corrosion hypothesis rule is not registered', () => {
    expect(HYPOTHESIS_RULE_KEYS as ReadonlyArray<string>).not.toContain('hyp_corrosion')
  })

  it('no ConditionType specific to the module survives', () => {
    for (const ct of [
      'particle_screening_only',
      'possible_corrosive_environment',
      'temperature_low_data_center',
    ]) {
      expect(Object.keys(PHRASE_LIBRARY), `${ct} has a phrase entry again`).not.toContain(ct)
    }
  })

  it('a zone still carrying legacy data-center fields scores as an ordinary zone', () => {
    // Saved assessments from before the removal still hold these keys.
    // They must be inert, not crash and not resurrect a finding.
    const legacy = {
      zn: 'Data Hall A', zone_subtype: 'data_hall',
      gaseous_corrosion: 'G3 — Harsh', iso_class: 'ISO Class 8',
      dp_temp: '55', h2_ppm: '15000', h2_monitoring: 'No', exhaust_cfm_sqft: '0.4',
      co2: '900', tf: '74', rh: '52', pm: '14', pmo: '9', co: '2',
    }
    const zs = scoreZone(legacy, { hm: 'Within 6 months' }) as unknown as {
      tot: number | null
      cats: Array<{ l: string; status?: string; r: Array<{ t: string; std?: string }> }>
    }
    expect(Number.isFinite(zs.tot)).toBe(true)

    const all = zs.cats.flatMap((c) => c.r).map((r) => `${r.t} ${r.std ?? ''}`).join(' ')
    for (const std of DC_STANDARDS) {
      expect(all, `a legacy zone still produced a ${std} finding`).not.toContain(std)
    }
    expect(all).not.toContain('H₂')
    // And no category is suppressed — data_hall's Complaints:0 was the only
    // zero weight in the table, so nothing reaches SUPPRESSED any more.
    expect(zs.cats.some((c) => c.status === 'SUPPRESSED')).toBe(false)
  })

  it('no causal chain fires on a data-center-named zone', () => {
    const chains = deriveCausalChains(
      [{ zoneId: 'Z-001', zoneName: 'Data Hall A', categories: [] } as never],
      [],
    )
    expect(chains.map((c) => c.id)).not.toContain('chain_data_center_corrosion')
  })
})
