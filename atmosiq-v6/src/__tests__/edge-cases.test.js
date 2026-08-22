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
  it('non-numeric CO2 does not crash', () => {
    const result = scoreZone({ co2: 'abc', tf: '72', rh: '45' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    const vent = result.cats.find(c => c.l === 'Ventilation')
    // A garbage reading must not become a finding that states it.
    expect(vent.r.every(r => !String(r.t).includes('abc'))).toBe(true)
  })

  it('empty string measurements', () => {
    const result = scoreZone({ co2: '', tf: '', rh: '', pm: '', co: '' }, { hm: '' })
    expect(result).toBeDefined()
    expect(result.cats).toHaveLength(5)
  })

  it('negative measurement values', () => {
    const result = scoreZone({ co2: '-100', tf: '-10', rh: '-5', pm: '-1', co: '-1' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    // Every finding still carries a severity the rest of the engine can read.
    result.cats.forEach(c => c.r.forEach(r => {
      expect(['critical', 'high', 'medium', 'low', 'pass', 'info']).toContain(r.sev)
    }))
  })

  it('extremely large measurement values', () => {
    const result = scoreZone({ co2: '99999', tf: '999', rh: '999', pm: '9999', co: '9999' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    result.cats.forEach(c => c.r.forEach(r => {
      expect(['critical', 'high', 'medium', 'low', 'pass', 'info']).toContain(r.sev)
    }))
  })

  it('zero values for all measurements', () => {
    const result = scoreZone({ co2: '0', tf: '0', rh: '0', pm: '0', co: '0' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    expect(result.cats).toHaveLength(5)
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
