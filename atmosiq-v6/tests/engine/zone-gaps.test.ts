/**
 * The in-walkthrough gap surface.
 *
 * The property that matters most here is NEGATIVE: this module must not
 * decide anything. Every item it returns has to trace to `sufficiency.js` or
 * `defensibility-gaps.js`, because a third opinion about completeness is how
 * the assessor ends up being told two different things on two screens.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { zoneGaps, zoneGapCounts } from '../../src/engines/zone-gaps.js'
import { evaluateCategorySufficiency } from '../../src/engines/sufficiency.js'

/** A zone with every required input captured across all five categories. */
const completeZone = () => ({
  zn: 'Room 214',
  co2: '850', cfm_person: '18',        // Ventilation
  pm: '8', co: '1',                    // Contaminants
  cx: 'No complaints',                 // Complaints (skips its optionals)
  tf: '72', rh: '45',                  // Environment
})

const draft = (zone: any, extra: any = {}) => ({
  zones: [zone], presurvey: {}, bldg: {}, recs: {}, zoneScores: [], ...extra,
})

describe('it surfaces what the sufficiency engine already found', () => {
  it('a bare zone reports its missing required inputs', () => {
    const gaps = zoneGaps(draft({ zn: 'Room 101' }), 0)
    const labels = gaps.map((g) => g.label)
    expect(labels).toContain('CO₂ reading')
    expect(labels).toContain('PM2.5 reading')
    expect(labels).toContain('Temperature')
    expect(gaps.every((g) => g.source === 'sufficiency' || g.source === 'defensibility')).toBe(true)
  })

  it('agrees exactly with evaluateCategorySufficiency — it does not re-derive', () => {
    const zone = { zn: 'Z', co2: '900' }
    const fromEngine = evaluateCategorySufficiency('Environment', zone).missing
    const fromModule = zoneGaps(draft(zone), 0)
      .filter((g) => g.kind === 'required' && g.id.startsWith('req:Environment:'))
      .map((g) => g.label)
    expect(fromModule.sort()).toEqual([...fromEngine].sort())
  })

  it('a complete zone reports no required gaps', () => {
    const required = zoneGaps(draft(completeZone()), 0).filter((g) => g.kind === 'required')
    expect(required).toEqual([])
  })

  it('does not ask for complaint follow-ups when there are no complaints', () => {
    // sufficiency.js suppresses these via skipOptionalWhen, and the question
    // list suppresses them via `cond`. Both must stay in step.
    const labels = zoneGaps(draft(completeZone()), 0).map((g) => g.label)
    expect(labels).not.toContain('Affected occupant count')
    expect(labels).not.toContain('Symptom list')
  })

  it('asks for them once complaints are reported', () => {
    const zone = { ...completeZone(), cx: 'Yes — complaints reported' }
    const labels = zoneGaps(draft(zone), 0).map((g) => g.label)
    expect(labels).toContain('Affected occupant count')
  })
})

describe('it surfaces defensibility rules, scoped to the zone', () => {
  it('flags a zone with indoor CO₂ and no outdoor baseline', () => {
    const zone = { ...completeZone(), co2: '1200', co2o: '' }
    const gaps = zoneGaps(draft(zone), 0)
    const g = gaps.find((x) => x.id === 'gap:missing_outdoor_co2')
    expect(g, 'the outdoor-CO₂ rule should reach the walkthrough').toBeTruthy()
    expect(g!.source).toBe('defensibility')
    expect(g!.label).toBe('Outdoor CO₂ baseline not recorded')
    expect(g!.why.length).toBeGreaterThan(20)
  })

  it('does not attribute another zone\'s gap to this one', () => {
    const a = { ...completeZone(), zn: 'Room A', co2: '1200', co2o: '420' }
    const b = { ...completeZone(), zn: 'Room B', co2: '1300', co2o: '' }
    const d = { zones: [a, b], presurvey: {}, bldg: {}, recs: {}, zoneScores: [] }
    expect(zoneGaps(d, 0).some((g) => g.id === 'gap:missing_outdoor_co2')).toBe(false)
    expect(zoneGaps(d, 1).some((g) => g.id === 'gap:missing_outdoor_co2')).toBe(true)
  })

  it('works before scoring has run — zoneScores-dependent rules just stay quiet', () => {
    // Mid-walkthrough there are no zoneScores. That must not throw, and must
    // not invent a substitute for the rules that need them.
    const gaps = zoneGaps({ zones: [completeZone()], presurvey: {}, bldg: {} } as any, 0)
    expect(Array.isArray(gaps)).toBe(true)
    expect(gaps.some((g) => g.id === 'gap:recommendation_without_location')).toBe(false)
  })
})

describe('ordering and shape', () => {
  it('required inputs rank above optional ones', () => {
    const gaps = zoneGaps(draft({ zn: 'Z' }), 0)
    const firstOptional = gaps.findIndex((g) => g.kind === 'optional')
    const lastRequired = gaps.map((g) => g.kind).lastIndexOf('required')
    if (firstOptional >= 0 && lastRequired >= 0) expect(lastRequired).toBeLessThan(firstOptional)
  })

  it('every item carries a label, a why and a traceable source', () => {
    for (const g of zoneGaps(draft({ zn: 'Z', co2: '1200' }), 0)) {
      expect(g.label, g.id).toBeTruthy()
      expect(g.why, g.id).toBeTruthy()
      expect(['sufficiency', 'defensibility']).toContain(g.source)
    }
  })

  it('ids are unique within a zone', () => {
    const ids = zoneGaps(draft({ zn: 'Z' }), 0).map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic — the same record gives the same list', () => {
    const z = { ...completeZone(), co2: '1400', co2o: '' }
    expect(JSON.stringify(zoneGaps(draft(z), 0))).toBe(JSON.stringify(zoneGaps(draft(z), 0)))
  })

  it('an absent zone yields nothing rather than throwing', () => {
    expect(zoneGaps(draft(completeZone()), 7)).toEqual([])
    expect(zoneGaps(null as never, 0)).toEqual([])
  })

  it('zoneGapCounts returns one count per zone', () => {
    const d = { zones: [completeZone(), { zn: 'Bare' }], presurvey: {}, bldg: {}, recs: {}, zoneScores: [] }
    const counts = zoneGapCounts(d)
    expect(counts).toHaveLength(2)
    expect(counts[1]).toBeGreaterThan(counts[0])
  })
})

describe('it adds no judgement of its own', () => {
  it('holds no thresholds and no severity logic', () => {
    // Whether a reading is elevated is the criterion registry's answer. A
    // number in this file would be a second, uncitable opinion about it.
    const src = readFileSync(new URL('../../src/engines/zone-gaps.js', import.meta.url), 'utf8')
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\b\d{3,}\b/)           // no thresholds
    expect(code).not.toMatch(/\bSTD\b|criteria\.js/) // no threshold registry read
    // Reading `g.severity` off a defensibility gap is consumption and is
    // fine; AUTHORING one would be this module forming its own opinion about
    // how bad something is. Only the second is forbidden.
    expect(code).not.toMatch(/severity:\s*['"]/)
    expect(code).not.toMatch(/['"]critical['"]/)
  })

  it('imports only the two engines it composes', () => {
    const src = readFileSync(new URL('../../src/engines/zone-gaps.js', import.meta.url), 'utf8')
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.sort()).toEqual(['./defensibility-gaps.js', './sufficiency.js'])
  })
})
