/**
 * escalation.js — rules-based triggers (audit 2026-09: H6 clock injection,
 * C3 mold Conditions, H1 numeric parsing, plus first dedicated coverage).
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { evaluateEscalation, hasActiveEscalation, highestSeverity } from '../../src/engines/escalation'

const NOW = new Date('2026-09-01T12:00:00Z')
const rules = (t: any[]) => t.map((x) => x.rule)

describe('the complaint window is measured from an injected clock (audit H6)', () => {
  const complaint = (daysAgo: number, extra: Record<string, unknown> = {}) => ({
    dateReported: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(), symptoms: ['Headache'], ...extra,
  })

  it('a medical-attention complaint inside 30 days fires; the same complaint outside does not', () => {
    const inside = evaluateEscalation({}, [complaint(10, { medicalAttention: true })], [], { now: NOW })
    expect(rules(inside)).toContain('medical_attention')
    const outside = evaluateEscalation({}, [complaint(45, { medicalAttention: true })], [], { now: NOW })
    expect(rules(outside)).not.toContain('medical_attention')
  })

  it('the same input evaluated under two different clocks gives the same answer for the same window', () => {
    const complaints = [complaint(10, { medicalAttention: true })]
    const a = evaluateEscalation({}, complaints, [], { now: NOW })
    const b = evaluateEscalation({}, complaints, [], { now: NOW.getTime() })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // Moved 40 days on, the complaint has aged out — the clock is what moved.
    const later = evaluateEscalation({}, complaints, [], { now: new Date(NOW.getTime() + 40 * 86400000) })
    expect(rules(later)).not.toContain('medical_attention')
  })

  it('three complaints in 30 days with overlapping symptoms cluster', () => {
    const t = evaluateEscalation({}, [complaint(1), complaint(5), complaint(20)], [], { now: NOW })
    const c = t.find((x: any) => x.rule === 'complaint_cluster')
    expect(c).toBeDefined()
    expect(c.severity).toBe('high')
    expect(c.rationale).toContain('Headache')
  })
})

describe('mold Conditions (IICRC S520)', () => {
  it('Condition 3 is critical and carries the extent band', () => {
    const t = evaluateEscalation({ moldResults: [{ condition: 3, visual: 'Small (< 10 sq ft)', extent: '<10 ft²' }] }, [], [], { now: NOW })
    const m = t.find((x: any) => x.rule === 'mold_condition_3')
    expect(m.severity).toBe('critical')
    expect(m.rationale).toBe('Visible mold growth (Small (< 10 sq ft)) — IICRC S520 Condition 3 (actual growth). Extent: <10 ft² per EPA (2008) size bands. Professional mold assessment and remediation required.')
  })
  it('Condition 2 (settled spores) is high with no area gate', () => {
    const t = evaluateEscalation({ moldResults: [{ condition: 2, visual: 'x', sqft: 2 }] }, [], [], { now: NOW })
    expect(rules(t)).toContain('mold_condition_2')
    expect(rules(t)).not.toContain('mold_condition_2_large')
  })
  it('Condition 1 fires nothing', () => {
    expect(rules(evaluateEscalation({ moldResults: [{ condition: 1, visual: 'Suspected discoloration' }] }, [], [], { now: NOW }))).toEqual([])
  })
})

describe('zone readings go through the one parser (audit H1)', () => {
  it('CO above 9 ppm fires; a non-numeric CO does not; a thousands separator reads', () => {
    expect(rules(evaluateEscalation({ zones: [{ zn: 'A', co: '12' }] }, [], [], { now: NOW }))).toContain('combustion_byproducts')
    expect(rules(evaluateEscalation({ zones: [{ zn: 'A', co: 'abc' }] }, [], [], { now: NOW }))).toEqual([])
    expect(rules(evaluateEscalation({ zones: [{ zn: 'A', co: '9' }] }, [], [], { now: NOW }))).toEqual([])
    expect(rules(evaluateEscalation({ zones: [{ zn: 'A', co: '1,000' }] }, [], [], { now: NOW }))).toContain('combustion_byproducts')
  })
  it('TVOC extreme needs a PID and a numeric reading', () => {
    expect(rules(evaluateEscalation({ zones: [{ tv: '3500', pid_lamp: '10.6 eV' }] }, [], [], { now: NOW }))).toContain('tvoc_extreme')
    expect(rules(evaluateEscalation({ zones: [{ tv: '3500', pid_lamp: 'No PID used' }] }, [], [], { now: NOW }))).toEqual([])
    expect(rules(evaluateEscalation({ zones: [{ tv: '>3000', pid_lamp: '10.6 eV' }] }, [], [], { now: NOW }))).toEqual([])
  })
})

describe('history, observations and construction rules', () => {
  it('two consecutive assessments with a critical finding escalate', () => {
    const crit = { zoneScores: [{ cats: [{ r: [{ sev: 'critical' }] }] }] }
    expect(rules(evaluateEscalation({}, [], [crit, crit], { now: NOW }))).toContain('consecutive_critical')
    expect(rules(evaluateEscalation({}, [], [crit, { zoneScores: [] }], { now: NOW }))).not.toContain('consecutive_critical')
  })
  it('qualitative observation rules', () => {
    const t = evaluateEscalation({ observations: { odors: ['Sewer / sulfur', 'Musty / earthy'], waterMoisture: 'Active leak', visibleMold: 'Suspected large (10-100 sq ft)' } }, [], [], { now: NOW })
    expect(rules(t)).toEqual(expect.arrayContaining(['Q1_sewer_sulfur_odor', 'Q3_visible_mold_suspected', 'Q4_moisture_plus_musty', 'Q7_active_leak']))
  })
  it('pre-1980 renovation raises the asbestos rule', () => {
    const t = evaluateEscalation({ building: { fm_activity: 'Active construction / renovation', fm_construction_year: '1975' } }, [], [], { now: NOW })
    expect(rules(t)).toEqual(expect.arrayContaining(['C1_active_construction', 'C2_pre1980_renovation_asbestos_risk']))
  })
  it('helpers', () => {
    expect(hasActiveEscalation([])).toBe(false)
    expect(highestSeverity([{ severity: 'high' }, { severity: 'critical' }])).toBe('critical')
    expect(highestSeverity([{ severity: 'high' }])).toBe('high')
    expect(highestSeverity([])).toBeNull()
  })
})
