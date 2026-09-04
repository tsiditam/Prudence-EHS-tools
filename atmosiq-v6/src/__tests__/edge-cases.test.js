/**
 * Edge cases in the assessment engine.
 *
 * Two describe blocks went with the 100-point score — "Normalization
 * edge cases" and "compositeScore edge cases" — along with the numeric
 * halves of the override tests. They asserted that a score never
 * exceeded 100, never divided by zero, and landed on the right side of a
 * band boundary: properties of arithmetic that no longer runs.
 *
 * Everything else stays, because none of it was ever about the number.
 * Malformed input must not crash the engine, a critical finding must not
 * be hidden behind a data gap, and sufficiency must treat odd field
 * values predictably.
 */

import { describe, it, expect } from 'vitest'
import { scoreZone, summarizeAssessment, genRecs } from '../engines/scoring'
import { evaluateCategorySufficiency } from '../engines/sufficiency'

// ── 1. All categories empty — total null ──────────────────────────────────

describe('All categories empty or insufficient', () => {
  it('completely empty zone data', () => {
    const result = scoreZone({}, {})
    // Every category reports why it could not be assessed, rather than
    // silently reporting nothing.
    result.cats.forEach(c => {
      expect(['INSUFFICIENT', 'DATA_GAP']).toContain(c.status)
      expect(c.reason).toBeTruthy()
    })
    expect(result.partialScore).toBe(true)
  })

  it('names every unassessed category', () => {
    const result = scoreZone({ zn: 'Empty' }, {})
    expect(result.insufficientCats.length).toBe(result.cats.length)
    expect(result.assessedCats).toEqual([])
  })

  it('summarizes a set of zones that produced no findings', () => {
    const result = summarizeAssessment([
      { cats: [], confidence: 'Insufficient', partialScore: true, insufficientCats: ['Ventilation'] },
      { cats: [], confidence: 'Insufficient', partialScore: true, insufficientCats: ['Ventilation'] },
    ])
    expect(result.count).toBe(2)
    expect(result.findings.total).toBe(0)
    expect(result.confidence).toBe('Insufficient')
    expect(result.partialData).toBe(true)
  })

  it('summarizes nothing as null, not as an empty assessment', () => {
    expect(summarizeAssessment([])).toBeNull()
    expect(summarizeAssessment(null)).toBeNull()
  })
})

// ── 2. Non-numeric / malformed measurement values ─────────────────────────

describe('Malformed input data', () => {
  // Every reading goes through one parser (audit 2026-09, H1). A field that
  // was ENTERED but cannot be read is a Data Gap the engine states; it is
  // never a `pass`, and the garbage text never reaches a finding.
  const D = { hm: 'Within 6 months', assessmentDate: '2026-07-15' }
  const findingsOf = (result, cat) => result.cats.find(c => c.l === cat).r

  it('non-numeric CO2 is a data gap, not a pass, and does not echo the text', () => {
    const result = scoreZone({ co2: 'abc', tf: '72', rh: '45' }, D)
    const vent = findingsOf(result, 'Ventilation')
    const gap = vent.filter(r => r.dataGap && r.p === 'co2')
    expect(gap).toHaveLength(1)
    expect(gap[0].sev).toBe('info')
    expect(vent.some(r => r.sev === 'pass')).toBe(false)
    expect(vent.every(r => !String(r.t).includes('abc'))).toBe(true)
    expect(result.confidence).not.toBe('High')
  })

  it('empty string measurements are "not captured": no data-gap finding, categories INSUFFICIENT', () => {
    const result = scoreZone({ co2: '', tf: '', rh: '', pm: '', co: '' }, { hm: '' })
    expect(result.cats).toHaveLength(5)
    expect(result.cats.every(c => !c.r.some(r => r.dataGap))).toBe(true)
    expect(findingsOf(result, 'Environment').length === 0 || result.cats.find(c => c.l === 'Environment').status).toBeTruthy()
    for (const cat of ['Ventilation', 'Contaminants', 'Environment']) {
      expect(result.cats.find(c => c.l === cat).status).toBe('INSUFFICIENT')
    }
  })

  it('negative measurement values are evaluated as numbers: below-range RH and temperature are medium, the rest raise nothing', () => {
    const result = scoreZone({ co2: '-100', tf: '-10', rh: '-5', pm: '-1', co: '-1' }, D)
    const env = findingsOf(result, 'Environment')
    expect(env.find(r => r.p === 'temperature').sev).toBe('medium')
    expect(env.find(r => r.p === 'temperature').t).toMatch(/outside the 73–79°F summer comfort range/)
    expect(env.find(r => r.p === 'rh').sev).toBe('medium')
    expect(findingsOf(result, 'Ventilation').find(r => r.p === 'co2').sev).toBe('pass')
    expect(findingsOf(result, 'Contaminants').some(r => r.p === 'co' || r.p === 'pm25')).toBe(false)
  })

  it('extremely large measurement values reach the worst tier of every ladder', () => {
    const result = scoreZone({ co2: '99999', tf: '999', rh: '999', pm: '9999', co: '9999' }, D)
    expect(findingsOf(result, 'Ventilation').find(r => r.p === 'co2').sev).toBe('high')   // capped by the class
    expect(findingsOf(result, 'Contaminants').find(r => r.p === 'co').sev).toBe('critical')
    expect(findingsOf(result, 'Contaminants').find(r => r.p === 'co').cid).toBe('co_niosh_ceiling')
    expect(findingsOf(result, 'Contaminants').find(r => r.p === 'pm25').sev).toBe('high')
    expect(findingsOf(result, 'Environment').find(r => r.p === 'temperature').sev).toBe('medium')
    expect(findingsOf(result, 'Environment').find(r => r.p === 'rh').sev).toBe('medium')
  })

  it('zero values are readings, not missing values', () => {
    const result = scoreZone({ co2: '0', tf: '0', rh: '0', pm: '0', co: '0' }, D)
    expect(result.cats).toHaveLength(5)
    expect(result.cats.every(c => !c.r.some(r => r.dataGap))).toBe(true)
    expect(findingsOf(result, 'Ventilation').find(r => r.p === 'co2').sev).toBe('pass')
    expect(findingsOf(result, 'Environment').find(r => r.p === 'temperature').sev).toBe('medium')
    expect(findingsOf(result, 'Environment').find(r => r.p === 'rh').sev).toBe('medium')
    expect(findingsOf(result, 'Contaminants').some(r => r.p === 'co' || r.p === 'pm25')).toBe(false)
  })

  it('a thousands separator reads as the number it prints', () => {
    const result = scoreZone({ co2: '1,600' }, D)
    const co2 = findingsOf(result, 'Ventilation').find(r => r.p === 'co2')
    expect(co2.sev).toBe('high')
    expect(co2.cid).toBe('co2_action')
  })

  it('"<5", ">x" and "n/a" are data gaps for the field they were entered in', () => {
    const result = scoreZone({ co: '<5', pm: '>x', hc: 'n/a', tf: 'warm', rh: '45' }, D)
    const cont = findingsOf(result, 'Contaminants')
    expect(cont.filter(r => r.dataGap).map(r => r.p).sort()).toEqual(['co', 'hcho', 'pm25'])
    expect(cont.some(r => r.sev === 'pass')).toBe(false)
    expect(findingsOf(result, 'Environment').find(r => r.p === 'temperature').dataGap).toBe(true)
  })
})

// "Normalization edge cases" stood here — a score never exceeding 100, a
// zero availableMax not dividing by zero, and a score landing on the
// right side of a band boundary (40 / 60 / 80). All three were about
// arithmetic that no longer runs.

// ── 3. Override interactions ──────────────────────────────────────────────

describe('Override interactions', () => {
  it('gate5 + synergistic both firing simultaneously', () => {
    const zone = {
      zn: 'Z1', co: '55', hc: '1.0',         // synergistic (both > OSHA PEL)
      sa: 'No airflow detected',               // gate5
      pm: '5', tf: '72', rh: '45', cx: 'No complaints',
    }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    // Both conditions are structural flags, and both survived the score
    // that used to cap on them (synergistic at 39, gate5 at 40).
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    expect(contCat.synergistic).toBe(true)
    expect(hvacCat.gate5).toBe(true)
    // And each one still states itself as a critical finding, which is
    // what the cap was expressing numerically.
    expect(contCat.r.some(r => r.sev === 'critical')).toBe(true)
    expect(hvacCat.r.some(r => r.sev === 'critical')).toBe(true)
  })

  it('gate5 forces category to be scored even with zero sufficiency', () => {
    // sa triggers gate5 but hm/fc not provided → would be DATA_GAP
    // Critical physical findings must NOT be hidden behind DATA_GAP
    const zone = { zn: 'Z1', sa: 'No airflow detected', tf: '72', rh: '45', cx: 'No complaints' }
    const result = scoreZone(zone, {})
    const hvac = result.cats.find(c => c.l === 'HVAC')
    // Must NOT be DATA_GAP — a critical finding cannot be hidden behind
    // an incomplete record. This is the property the whole test exists
    // for, and it is unchanged by the score's removal.
    expect(hvac.status).not.toBe('DATA_GAP')
    expect(hvac.gate5).toBe(true)
    expect(hvac.r.some(r => r.sev === 'critical')).toBe(true)
  })

})

// "compositeScore edge cases" stood here: a mix of null and scored
// zones, a single zone at 0, a single zone at 100, and 100 zones not
// crashing. summarizeAssessment's own edge cases are covered in the
// first describe block above.

// ── 4. genRecs edge cases ─────────────────────────────────────────────────

describe('genRecs edge cases', () => {
  it('empty cats array', () => {
    const recs = genRecs([{ zoneName: 'Z1', cats: [] }], {})
    expect(recs).toBeDefined()
    expect(recs.mon.length).toBeGreaterThan(0)
  })

  it('findings with no text', () => {
    const recs = genRecs([{
      zoneName: 'Z1',
      cats: [{ l: 'HVAC', r: [{ t: '', sev: 'critical' }] }]
    }], {})
    expect(recs).toBeDefined()
  })

  it('findings with undefined sev', () => {
    const recs = genRecs([{
      zoneName: 'Z1',
      cats: [{ l: 'HVAC', r: [{ t: 'something', sev: undefined }] }]
    }], {})
    expect(recs).toBeDefined()
  })
})

// ── 7. Sufficiency with unexpected field values ───────────────────────────

describe('Sufficiency with edge-case values', () => {
  it('boolean field values — false passes hasValue (not a real form scenario)', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: true, fc: false })
    // hasValue: false !== undefined/null/'', typeof false !== 'string' → returns true
    expect(r.sufficiency).toBe(1) // both count as present
  })

  it('numeric 0 as field value', () => {
    // hasValue checks: v === 0 → not undefined/null/'' → returns true? Let me check.
    // Actually: 0 is not undefined, not null, not ''. typeof 0 !== 'string'. So hasValue returns true.
    const r = evaluateCategorySufficiency('Contaminants', { pm: 0, co: 0 })
    expect(r.isInsufficient).toBe(false) // 0 is a valid value
  })

  it('whitespace-only string field', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: '   ' })
    // hasValue: typeof '   ' === 'string', '   '.trim() === '' → false
    expect(r.sufficiency).toBe(0)
  })

  it('unknown category name', () => {
    const r = evaluateCategorySufficiency('NonExistent', {})
    expect(r.isInsufficient).toBe(false)
    expect(r.sufficiency).toBe(1)
  })
})
