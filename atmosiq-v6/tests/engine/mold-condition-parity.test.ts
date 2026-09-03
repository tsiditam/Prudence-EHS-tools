/**
 * IICRC S520 Condition — the IAQ engine and the mold engine agree (audit C3).
 *
 * Under S520 (2015, reaffirmed 2024) ANY actual growth is Condition 3;
 * Condition 2 is settled spores without growth; Condition 1 is normal
 * ecology. Area never lowers the Condition — it sets the EPA (2008) size
 * band (<10 / 10–100 / >100 ft²), which drives the response. The IAQ engine
 * used to print "Condition 2 likely … EPA Level II (10–30 sq ft)" for a
 * 10–100 ft² intake option: wrong Condition, wrong area, and a Level ladder
 * that belongs to NYC DOHMH, not EPA. The mold module had it right.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { scoreZone, evalMold } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { classifyCondition } from '../../src/engines/mold/remediationCondition.js'
// @ts-expect-error — JS module without TS types
import { evaluateEscalation } from '../../src/engines/escalation'
// @ts-expect-error — JS module without TS types
import { Q_ZONE } from '../../src/constants/questions'

const MI_OPTIONS: string[] = (Q_ZONE as any[]).find((q) => q.id === 'mi').opts
const GROWTH_OPTIONS = MI_OPTIONS.filter((o) => /Small|Moderate|Extensive/.test(o))
const EXTENT: Record<string, string> = { Small: '<10 ft²', Moderate: '10–100 ft²', Extensive: '>100 ft²' }
const SEVERITY: Record<string, string> = { Small: 'medium', Moderate: 'high', Extensive: 'critical' }

const moldFinding = (mi: string) =>
  (scoreZone({ zn: 'Z', su: 'office', mi, pm: '5', co: '2' }, {}).cats.find((c: any) => c.l === 'Contaminants')?.r || [])
    .find((r: any) => /mold/i.test(r.t))

describe('the intake options this test reads are the real ones', () => {
  it('has three visible-growth options plus None and Suspected discoloration', () => {
    expect(GROWTH_OPTIONS).toHaveLength(3)
    expect(MI_OPTIONS).toContain('None')
    expect(MI_OPTIONS).toContain('Suspected discoloration')
  })
})

describe('any visible growth is Condition 3 in both engines', () => {
  for (const mi of GROWTH_OPTIONS) {
    const key = Object.keys(EXTENT).find((k) => mi.includes(k))!
    it(`${mi}: IAQ evalMold, the scoring finding and the mold engine all say Condition 3`, () => {
      const iaq = evalMold({ mi })
      const mold = classifyCondition({ visibleGrowth: true })
      expect(iaq.condition).toBe(3)
      expect(mold.conditionId).toBe(3)
      expect(iaq.condition).toBe(mold.conditionId)
      expect(iaq.extent).toBe(EXTENT[key])
      expect(iaq.investigationTriggered).toBe(true)

      const f = moldFinding(mi)
      expect(f).toBeDefined()
      expect(f.moldCondition).toBe(3)
      expect(f.sev).toBe(SEVERITY[key])
      // The printed area IS the intake option, and the band is EPA's.
      expect(f.t).toBe(`Visible mold growth (${mi}) — IICRC S520 Condition 3 (actual growth). Extent: ${EXTENT[key]} per EPA (2008) size bands. Consult applicable state and local regulations for jurisdiction-specific mold remediation requirements.`)
      expect(f.t).not.toMatch(/Condition [12]/)
      expect(f.t).not.toMatch(/Level I/)
      expect(f.t).not.toMatch(/10–30|10-30/)
    })
  }

  it('area (mia) never lowers the Condition', () => {
    for (const mia of [undefined, '', '2', '9.9', '10', '250', 'abc']) {
      expect(evalMold({ mi: 'Small (< 10 sq ft)', mia }).condition).toBe(3)
      expect(evalMold({ mi: 'Moderate (10-100 sq ft)', mia }).condition).toBe(3)
    }
  })

  it('escalation fires the Condition 3 rule for every growth option and never a Condition 2 area gate', () => {
    for (const mi of GROWTH_OPTIONS) {
      const triggers = evaluateEscalation({ zones: [], moldResults: [evalMold({ mi })] }, [], [], { now: new Date('2026-09-01') })
      const rules = triggers.map((t: any) => t.rule)
      expect(rules).toContain('mold_condition_3')
      expect(rules).not.toContain('mold_condition_2')
      expect(rules).not.toContain('mold_condition_2_large')
      const t = triggers.find((x: any) => x.rule === 'mold_condition_3')
      expect(t.severity).toBe('critical')
      expect(t.rationale).toContain('Condition 3 (actual growth)')
      expect(t.rationale).toContain(mi)
    }
  })
})

describe('no growth observed', () => {
  it('None produces no mold result and no finding', () => {
    expect(evalMold({ mi: 'None' })).toBeNull()
    expect(evalMold({})).toBeNull()
    expect(moldFinding('None')).toBeUndefined()
  })

  it('Suspected discoloration is not a growth observation — Condition 1, no finding, not escalated', () => {
    const r = evalMold({ mi: 'Suspected discoloration' })
    expect(r.condition).toBe(1)
    expect(r.investigationTriggered).toBe(false)
    expect(moldFinding('Suspected discoloration')).toBeUndefined()
    const triggers = evaluateEscalation({ zones: [], moldResults: [r] }, [], [], { now: new Date('2026-09-01') })
    expect(triggers.map((t: any) => t.rule)).not.toContain('mold_condition_3')
  })

  it('the mold engine reaches Condition 2 only from settled-spore evidence, never from area', () => {
    expect(classifyCondition({ sporeOutcome: 'possible-amplification-indicator' }).conditionId).toBe(2)
    expect(classifyCondition({ mustyOdor: true, moistureElevated: true }).conditionId).toBe(2)
    expect(classifyCondition({}).conditionId).toBe(1)
  })
})
