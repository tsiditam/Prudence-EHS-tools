/**
 * assessmentVerdict — the single verdict every surface reads.
 *
 * Each case here is a contradiction that shipped: the app and the report
 * disagreeing about the same assessment because each derived its own answer
 * from a different input.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveVerdict, countFindings, worstFindingSeverity, hasPartialData,
  hasAnyAction, isFinding,
} from '../../src/utils/assessmentVerdict'

const zone = (...sev: string[]) => ({ cats: [{ l: 'X', r: sev.map(s => ({ t: 't', sev: s })) }] })

describe('the composite is a floor, never a ceiling', () => {
  it('a critical finding overrides a passing composite', () => {
    // A CO reading over the OSHA PEL zeroes Contaminants but leaves the other
    // four categories intact, so the zone lands in MODERATE and the composite
    // stays >= 70. professional-opinion.ts calls that "corrective action";
    // the card used to call it "within acceptable range".
    const v = resolveVerdict({ comp: { tot: 78 }, zoneScores: [zone('critical', 'pass')] })
    expect(v.severity).toBe('critical')
    expect(v.label).toBe('Critical Concern')
    expect(v.escalatedBy).toBe('finding')
    expect(v.prose).not.toMatch(/within acceptable range/i)
  })

  it('an escalation trigger overrides a passing composite', () => {
    const v = resolveVerdict({
      comp: { tot: 92 },
      zoneScores: [zone('pass')],
      escalationTriggers: [{ rule: 'combustion_byproducts', severity: 'critical' }],
    })
    expect(v.severity).toBe('critical')
    expect(v.escalatedBy).toBe('escalation')
  })

  it('a good score never softens a bad finding, and a bad score is never softened', () => {
    expect(resolveVerdict({ comp: { tot: 12 }, zoneScores: [zone('pass')] }).severity).toBe('critical')
    expect(resolveVerdict({ comp: { tot: 99 }, zoneScores: [zone('high')] }).severity).toBe('high')
  })

  it('a low finding alone does not move the verdict', () => {
    const v = resolveVerdict({ comp: { tot: 85 }, zoneScores: [zone('low', 'pass')] })
    expect(v.severity).toBe('pass')
    expect(v.escalatedBy).toBeNull()
    // ...but it is still a finding, so the headline must not deny it.
    expect(v.findings.total).toBe(1)
    expect(v.findings.attention).toBe(0)
  })
})

describe('one definition of "finding"', () => {
  it('counts low and above, never pass or info', () => {
    expect(isFinding({ sev: 'low' })).toBe(true)
    expect(isFinding({ sev: 'pass' })).toBe(false)
    expect(isFinding({ sev: 'info' })).toBe(false)
    // The zone list used to count every row, so a clean zone read "3 findings".
    expect(countFindings([zone('pass', 'pass', 'info')]).total).toBe(0)
  })

  it('agrees with the header count on the same data', () => {
    const zs = [zone('critical', 'pass'), zone('low', 'medium', 'info')]
    const c = countFindings(zs)
    expect(c.total).toBe(3)
    expect(c.attention).toBe(2)
    expect(worstFindingSeverity(zs)).toBe('critical')
  })

  it('reports no worst severity for a clean assessment', () => {
    expect(worstFindingSeverity([zone('pass')])).toBeNull()
  })
})

describe('partial data never reads as a clean bill of health', () => {
  it('flags an incomplete composite', () => {
    expect(hasPartialData([zone('pass')], { partialComposite: true })).toBe(true)
    expect(hasPartialData([{ ...zone('pass'), insufficientCats: ['HVAC'] }], {})).toBe(true)
    expect(hasPartialData([zone('pass')], {})).toBe(false)
  })

  it('appends a data-gap caveat to otherwise reassuring prose', () => {
    const v = resolveVerdict({ comp: { tot: 88, partialComposite: true }, zoneScores: [zone('pass')] })
    expect(v.severity).toBe('pass')
    expect(v.prose).toMatch(/incomplete data/i)
    expect(v.partialData).toBe(true)
  })
})

describe('hasAnyAction covers every tier', () => {
  it('is true when only non-immediate recommendations exist', () => {
    // The card checked `imm` alone, then printed "no actions" above a link to
    // the engineering recommendations it had just denied.
    expect(hasAnyAction({ imm: [], eng: ['balance the VAV branch'], adm: [], mon: [] }, null, [])).toBe(true)
    expect(hasAnyAction({ imm: [], eng: [], adm: ['update the O&M log'] }, null, [])).toBe(true)
    expect(hasAnyAction({ imm: [], eng: [], adm: [], mon: ['log CO2 for 3 days'] }, null, [])).toBe(true)
  })

  it('is true for a sampling plan or an escalation alone', () => {
    expect(hasAnyAction({}, { plan: [{ parameter: 'CO2' }] }, [])).toBe(true)
    expect(hasAnyAction({}, null, [{ rule: 'x', severity: 'critical' }])).toBe(true)
  })

  it('is false only when everything is empty', () => {
    expect(hasAnyAction({ imm: [], eng: [], adm: [], mon: [] }, { plan: [] }, [])).toBe(false)
    expect(hasAnyAction(null, null, null)).toBe(false)
  })
})

describe('app and report cannot disagree', () => {
  // The report surfaces branch on verdict.severity now, not comp.tot. These
  // pin the mapping each of them relies on, so a future edit that reverts one
  // surface to raw scoring fails here.
  it('a passing composite with a critical finding is not "pass" on any surface', () => {
    const v = resolveVerdict({ comp: { tot: 78 }, zoneScores: [zone('critical', 'pass')] })
    // PrintReport p2 / sections-core riskDesc take the acceptable branch only
    // on 'pass'; sections-technical triages P4 — Routine only on 'pass'.
    expect(v.severity).not.toBe('pass')
  })

  it('maps cleanly onto the three-way prose branches every report uses', () => {
    const sev = (tot: number) => resolveVerdict({ comp: { tot }, zoneScores: [zone('pass')] }).severity
    expect(sev(85)).toBe('pass')     // "within acceptable ranges"
    expect(sev(60)).toBe('medium')   // "moderate concerns"
    expect(sev(45)).toBe('high')     // "significant concerns"
    expect(sev(20)).toBe('critical') // "significant concerns" + P1
  })

  it('an escalation trigger alone reaches the report triage', () => {
    const v = resolveVerdict({
      comp: { tot: 95 },
      zoneScores: [zone('pass')],
      escalationTriggers: [{ rule: 'mold_condition_3', severity: 'critical' }],
    })
    expect(v.severity).toBe('critical')  // P1 — Critical, not P4 — Routine
  })
})
