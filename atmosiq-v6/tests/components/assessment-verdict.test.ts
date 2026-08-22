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

// This block was named "the composite is a floor, never a ceiling", and every
// case passed a `comp: { tot: N }`. The floor went with the composite in
// v3.0; the block is re-pinned rather than deleted, because the property it
// was protecting is the one that mattered and still holds: a finding or a
// trigger decides the verdict, and nothing softens either.
//
// One case DID change, and it is kept below as its own test rather than
// quietly dropped: `tot: 12` with no findings used to be Critical on the
// strength of the number alone. It is now `pass`. That is the whole of the
// behaviour change, and it only ever fires for an assessment with nothing to
// point at.
describe('the verdict rests on what was found', () => {
  it('a critical finding decides the verdict', () => {
    // A CO reading over the OSHA PEL. professional-opinion.ts calls that
    // "corrective action"; the card used to call it "within acceptable
    // range", because the composite over the other four categories stayed
    // above 70.
    const v = resolveVerdict({ zoneScores: [zone('critical', 'pass')] })
    expect(v.severity).toBe('critical')
    expect(v.label).toBe('Critical Concern')
    expect(v.escalatedBy).toBe('finding')
    expect(v.prose).not.toMatch(/within acceptable range/i)
  })

  it('an escalation trigger decides the verdict on its own', () => {
    const v = resolveVerdict({
      zoneScores: [zone('pass')],
      escalationTriggers: [{ rule: 'combustion_byproducts', severity: 'critical' }],
    })
    expect(v.severity).toBe('critical')
    expect(v.escalatedBy).toBe('escalation')
  })

  it('a stale composite on a pre-v3.0 record changes nothing', () => {
    // Legacy records still carry `comp`. Passing one must not resurrect the
    // band — the argument is not read, and the finding decides.
    const legacy: any = { comp: { tot: 12 }, zoneScores: [zone('high')] }
    expect(resolveVerdict(legacy).severity).toBe('high')
    expect(resolveVerdict({ ...legacy, comp: { tot: 99 } }).severity).toBe('high')
  })

  it('nothing found is nothing found — the floor is gone', () => {
    // Under the composite this was `critical` on the number alone, with no
    // finding and no trigger behind it. It is the one verdict that moved.
    expect(resolveVerdict({ zoneScores: [zone('pass')] } as any).severity).toBe('pass')
    expect(resolveVerdict({ comp: { tot: 12 }, zoneScores: [zone('pass')] } as any).severity).toBe('pass')
  })

  it('a low finding alone does not move the verdict', () => {
    const v = resolveVerdict({ zoneScores: [zone('low', 'pass')] })
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
    expect(hasPartialData([{ ...zone('pass'), partialScore: true }])).toBe(true)
    expect(hasPartialData([{ ...zone('pass'), insufficientCats: ['HVAC'] }])).toBe(true)
    expect(hasPartialData([zone('pass')])).toBe(false)
  })

  it('appends a data-gap caveat to otherwise reassuring prose', () => {
    const v = resolveVerdict({ zoneScores: [{ ...zone('pass'), partialScore: true }] })
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
  // The report surfaces branch on verdict.severity. These pin the mapping
  // each of them relies on, so a future edit that reverts one surface to
  // deriving its own answer fails here.
  it('a critical finding is not "pass" on any surface', () => {
    const v = resolveVerdict({ zoneScores: [zone('critical', 'pass')] })
    // PrintReport p2 / sections-core riskDesc take the acceptable branch only
    // on 'pass'; sections-technical triages P4 — Routine only on 'pass'.
    expect(v.severity).not.toBe('pass')
  })

  it('maps cleanly onto the prose branches every report uses', () => {
    // Was a sweep over composite values (85/60/45/20). The same four
    // branches, reached the way they are reached now — by severity.
    const sev = (s: string) => resolveVerdict({ zoneScores: [zone(s)] }).severity
    expect(sev('low')).toBe('pass')       // "within acceptable ranges"
    expect(sev('medium')).toBe('medium')  // "moderate concerns"
    expect(sev('high')).toBe('high')      // "significant concerns"
    expect(sev('critical')).toBe('critical') // "significant concerns" + P1
  })

  it('an escalation trigger alone reaches the report triage', () => {
    const v = resolveVerdict({
      zoneScores: [zone('pass')],
      escalationTriggers: [{ rule: 'mold_condition_3', severity: 'critical' }],
    })
    expect(v.severity).toBe('critical')  // P1 — Critical, not P4 — Routine
  })
})

describe('complaints are a symptom, not a driver', () => {
  const withComplaints = (sev: string) => [{
    cats: [
      { l: 'Ventilation', r: [{ t: 'ok', sev: 'pass' }] },
      { l: 'Complaints', r: [{ t: '6-10 occupants reporting symptoms', sev }] },
    ],
  }]

  it('caps a complaints-only critical at high', () => {
    // Scoring rates 6+ occupants reporting symptoms as `critical`. That is an
    // occupant report, not a measurement, and it must not make the BUILDING
    // CONDITION critical or drive the report to P1 triage.
    const v = resolveVerdict({ zoneScores: withComplaints('critical') })
    expect(v.severity).toBe('high')
    expect(v.escalatedBy).toBe('finding')
  })

  it('still lets a symptom cluster raise the verdict — capped, not ignored', () => {
    expect(resolveVerdict({ zoneScores: withComplaints('critical') }).severity)
      .not.toBe('pass')
  })

  it('leaves a measured critical in another category at critical', () => {
    const zs = [{
      cats: [
        { l: 'Contaminants', r: [{ t: 'CO', sev: 'critical' }] },
        { l: 'Complaints', r: [{ t: 'symptoms', sev: 'critical' }] },
      ],
    }]
    expect(resolveVerdict({ zoneScores: zs }).severity).toBe('critical')
  })

  it('counts complaint findings in the totals regardless of the cap', () => {
    // The cap governs escalation only. The finding is still a finding.
    expect(countFindings(withComplaints('critical')).total).toBe(1)
    expect(countFindings(withComplaints('critical')).attention).toBe(1)
  })

  it('preserves a low complaint severity rather than promoting it', () => {
    expect(worstFindingSeverity(withComplaints('low'))).toBe('low')
    expect(worstFindingSeverity(withComplaints('medium'))).toBe('medium')
  })
})
