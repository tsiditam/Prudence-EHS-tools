/**
 * One `cond` evaluator, two legacy dialects.
 *
 * The IAQ path (MobileApp) and the mold path (MoldModeScreen) each had their
 * own copy, and they disagreed: IAQ checked operators for TRUTHINESS, so
 * `ne: ''` was ignored and the question always showed; mold checked for
 * PRESENCE, so `neq: ''` worked and four mold questions rely on it.
 *
 * These tests pin both legacy behaviors through the unified evaluator before
 * anything is built on top of it, and pin the live catalogs so a question
 * that shows today still shows.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { evalCondition, visibleQuestions, conditionFields } from '../../src/utils/conditions.js'
import { Q_ZONE, Q_DETAILS, Q_QUICKSTART } from '../../src/constants/questions.js'
import { Q_MOLD_ZONE, Q_MOLD_PRESURVEY } from '../../src/constants/moldQuestions.js'

describe('legacy IAQ dialect — eq / ne', () => {
  it('eq shows only on an exact match', () => {
    const c = { f: 'cx', eq: 'Yes — complaints reported' }
    expect(evalCondition(c, { cx: 'Yes — complaints reported' })).toBe(true)
    expect(evalCondition(c, { cx: 'No complaints' })).toBe(false)
    expect(evalCondition(c, {})).toBe(false)
  })

  it('ne hides only on an exact match', () => {
    const c = { f: 'wd', ne: 'None' }
    expect(evalCondition(c, { wd: 'None' })).toBe(false)
    expect(evalCondition(c, { wd: 'Active leak' })).toBe(true)
    // Unanswered normalizes to '', which is not 'None', so it shows —
    // matching the old inline check.
    expect(evalCondition(c, {})).toBe(true)
  })

  it('eq and ne on one leaf AND together, as the inline copies did', () => {
    const c = { f: 'x', eq: 'a', ne: 'b' }
    expect(evalCondition(c, { x: 'a' })).toBe(true)
    expect(evalCondition(c, { x: 'b' })).toBe(false)
  })
})

describe('legacy mold dialect — neq / in', () => {
  it("neq:'' means answered, which the IAQ dialect could not express", () => {
    const c = { f: 'mz_water_source', neq: '' }
    expect(evalCondition(c, { mz_water_source: 'Roof leak' })).toBe(true)
    expect(evalCondition(c, { mz_water_source: '' })).toBe(false)
    expect(evalCondition(c, {})).toBe(false)
  })

  it('in matches membership', () => {
    const c = { f: 'ps_reason', in: ['Occupant complaint(s)', 'Water intrusion event'] }
    expect(evalCondition(c, { ps_reason: 'Water intrusion event' })).toBe(true)
    expect(evalCondition(c, { ps_reason: 'Routine survey' })).toBe(false)
  })
})

describe('new predicates', () => {
  it('empty distinguishes answered from blank', () => {
    expect(evalCondition({ f: 'a', empty: true }, {})).toBe(true)
    expect(evalCondition({ f: 'a', empty: true }, { a: '   ' })).toBe(true)
    expect(evalCondition({ f: 'a', empty: true }, { a: 'x' })).toBe(false)
    expect(evalCondition({ f: 'a', empty: false }, { a: 'x' })).toBe(true)
    expect(evalCondition({ f: 'a', empty: false }, { a: [] })).toBe(false)
  })

  it('includes matches a substring or a multi-select member', () => {
    expect(evalCondition({ f: 'op', includes: 'Musty' }, { op: 'Musty / earthy' })).toBe(true)
    expect(evalCondition({ f: 'sy', includes: 'Headache' }, { sy: ['Headache', 'Fatigue'] })).toBe(true)
    expect(evalCondition({ f: 'sy', includes: 'Nausea' }, { sy: ['Headache'] })).toBe(false)
    expect(evalCondition({ f: 'sy', includes: 'Headache' }, {})).toBe(false)
  })

  it('all requires every branch', () => {
    const c = { all: [{ f: 'cx', eq: 'Yes' }, { f: 'sy_time', empty: true }] }
    expect(evalCondition(c, { cx: 'Yes' })).toBe(true)
    expect(evalCondition(c, { cx: 'Yes', sy_time: 'Afternoon' })).toBe(false)
    expect(evalCondition(c, { sy_time: '' })).toBe(false)
  })

  it('any requires one branch', () => {
    const c = { any: [{ f: 'wd', ne: 'None' }, { f: 'op', includes: 'Musty' }] }
    expect(evalCondition(c, { wd: 'None', op: 'Musty / earthy' })).toBe(true)
    expect(evalCondition(c, { wd: 'Active leak', op: 'None' })).toBe(true)
    expect(evalCondition(c, { wd: 'None', op: 'None' })).toBe(false)
  })

  it('not inverts, and groups nest', () => {
    expect(evalCondition({ not: { f: 'a', eq: 'x' } }, { a: 'x' })).toBe(false)
    const nested = { all: [{ f: 'a', eq: 'x' }, { any: [{ f: 'b', eq: '1' }, { f: 'c', eq: '2' }] }] }
    expect(evalCondition(nested, { a: 'x', c: '2' })).toBe(true)
    expect(evalCondition(nested, { a: 'x', b: '9', c: '9' })).toBe(false)
  })
})

describe('failure direction', () => {
  it('an absent or unparseable condition shows the question', () => {
    // Failing OPEN is deliberate: a condition nobody can parse must not be
    // able to hide a question the assessor is supposed to answer.
    expect(evalCondition(null, {})).toBe(true)
    expect(evalCondition(undefined, {})).toBe(true)
    expect(evalCondition({} as never, {})).toBe(true)
    expect(evalCondition({ nonsense: true } as never, {})).toBe(true)
  })

  it('tolerates a missing answer map', () => {
    expect(evalCondition({ f: 'a', eq: 'x' }, undefined as never)).toBe(false)
  })
})

describe('the live catalogs still behave', () => {
  it('every condition in every catalog parses to a boolean', () => {
    const all = [...Q_ZONE, ...Q_DETAILS, ...Q_QUICKSTART, ...Q_MOLD_ZONE, ...Q_MOLD_PRESURVEY]
    for (const q of all as any[]) {
      if (!q.cond) continue
      expect(typeof evalCondition(q.cond, {}), `${q.id} on an empty record`).toBe('boolean')
    }
  })

  it('every condition names a field that exists in its own catalog', () => {
    // A cond pointing at a field id nothing declares is a question that can
    // never show, or shows always — either way it is a typo, not a rule.
    const check = (catalog: any[], label: string) => {
      const ids = new Set(catalog.map((q) => q.id))
      for (const q of catalog) {
        for (const f of conditionFields(q.cond)) {
          expect(ids.has(f), `${label}.${q.id} depends on "${f}", which the catalog does not declare`).toBe(true)
        }
      }
    }
    check(Q_ZONE as any[], 'Q_ZONE')
    check(Q_MOLD_ZONE as any[], 'Q_MOLD_ZONE')
  })

  it('the complaint chain opens on cx and stays shut otherwise', () => {
    // The live example: sy/sr/ac/cc and the interview fields all gate on cx.
    const shut = visibleQuestions(Q_ZONE as any[], { cx: 'No complaints' }).map((q: any) => q.id)
    const open = visibleQuestions(Q_ZONE as any[], { cx: 'Yes — complaints reported' }).map((q: any) => q.id)
    expect(shut).not.toContain('sy')
    expect(open).toContain('sy')
    expect(open.length).toBeGreaterThan(shut.length)
  })

  it('mold water-source follow-ups open once a source is named', () => {
    const shut = visibleQuestions(Q_MOLD_ZONE as any[], { mz_water_source: '' }).map((q: any) => q.id)
    const open = visibleQuestions(Q_MOLD_ZONE as any[], { mz_water_source: 'Roof leak' }).map((q: any) => q.id)
    expect(open.length).toBeGreaterThan(shut.length)
  })
})

describe('conditionFields', () => {
  it('collects dependencies through nested groups, deduped', () => {
    const c = { all: [{ f: 'a', eq: '1' }, { any: [{ f: 'b', eq: '2' }, { not: { f: 'a', eq: '3' } }] }] }
    expect(conditionFields(c).sort()).toEqual(['a', 'b'])
  })

  it('returns nothing for an unconditional question', () => {
    expect(conditionFields(null)).toEqual([])
  })
})

describe('no threshold operator exists', () => {
  it('numeric comparison is not expressible — that belongs to the engine', () => {
    // A `{f:'co2', gt:1000}` here would be a second opinion about a number
    // the criterion registry already judges, and would drift the moment a
    // threshold moved. An unknown operator is ignored, so such a condition
    // shows the question rather than silently applying a made-up threshold.
    const src = readFileSync(new URL('../../src/utils/conditions.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/['"]gt['"]|['"]lt['"]|['"]gte['"]|['"]lte['"]/)
    expect(evalCondition({ f: 'co2', gt: 1000 } as never, { co2: '2000' })).toBe(true)
  })
})
