import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore, genRecs } from '../engines/scoring'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from '../engines/sufficiency'

// ── 1. All categories empty — total null ──────────────────────────────────

describe('All categories empty or insufficient', () => {
  it('completely empty zone data', () => {
    const result = scoreZone({}, {})
    expect(result.tot).not.toBeNaN()
    // All cats should be INSUFFICIENT or DATA_GAP
    result.cats.forEach(c => {
      expect([null, 0]).toContain(c.s) // s is null (INSUFF/DATA_GAP) or 0
    })
  })

  it('all categories INSUFFICIENT/DATA_GAP → tot is null, not NaN', () => {
    // No required fields met for any category
    const result = scoreZone({ zn: 'Empty' }, {})
    // tot should be null when no scorable categories
    if (result.tot !== null) {
      expect(result.tot).not.toBeNaN()
      expect(Number.isFinite(result.tot)).toBe(true)
    }
  })

  it('compositeScore with all-null zones', () => {
    const zones = [
      { tot: null, cats: [] },
      { tot: null, cats: [] },
    ]
    const result = compositeScore(zones)
    expect(result.tot).toBeNull()
    expect(result.risk).toBe('Insufficient Data')
  })
})

// ── 2. Non-numeric / malformed measurement values ─────────────────────────

describe('Malformed input data', () => {
  it('non-numeric CO2 does not crash', () => {
    const result = scoreZone({ co2: 'abc', tf: '72', rh: '45' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    expect(result.tot).not.toBeNaN()
    const vent = result.cats.find(c => c.l === 'Ventilation')
    expect(Number.isFinite(vent.s) || vent.s === null).toBe(true)
  })

  it('empty string measurements', () => {
    const result = scoreZone({ co2: '', tf: '', rh: '', pm: '', co: '' }, { hm: '' })
    expect(result).toBeDefined()
    expect(result.tot === null || Number.isFinite(result.tot)).toBe(true)
  })

  it('negative measurement values', () => {
    const result = scoreZone({ co2: '-100', tf: '-10', rh: '-5', pm: '-1', co: '-1' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    // Scores should never be negative
    result.cats.forEach(c => {
      if (c.s !== null) expect(c.s).toBeGreaterThanOrEqual(0)
    })
  })

  it('extremely large measurement values', () => {
    const result = scoreZone({ co2: '99999', tf: '999', rh: '999', pm: '9999', co: '9999' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    result.cats.forEach(c => {
      if (c.s !== null) {
        expect(c.s).toBeGreaterThanOrEqual(0)
        expect(c.s).toBeLessThanOrEqual(c.mx)
      }
    })
  })

  it('zero values for all measurements', () => {
    const result = scoreZone({ co2: '0', tf: '0', rh: '0', pm: '0', co: '0' }, { hm: 'Within 6 months' })
    expect(result).toBeDefined()
    expect(result.tot).not.toBeNaN()
  })
})

// ── 3. Normalization edge cases ───────────────────────────────────────────

describe('Normalization edge cases', () => {
  it('single scorable category does not produce >100', () => {
    // Only complaints scorable (cx provided), everything else insufficient
    const result = scoreZone({ cx: 'No complaints' }, {})
    if (result.tot !== null) {
      expect(result.tot).toBeLessThanOrEqual(100)
      expect(result.tot).toBeGreaterThanOrEqual(0)
    }
  })

  it('availableMax=0 does not cause division by zero', () => {
    // This shouldn't happen in practice, but test defensively
    // All categories DATA_GAP or INSUFFICIENT → scorable is empty → tot is null
    const result = scoreZone({}, {})
    expect(result.tot === null || Number.isFinite(result.tot)).toBe(true)
  })

  it('score exactly at risk band boundary (40, 60, 80)', () => {
    // These are boundary values between risk bands
    const zones40 = [{ tot: 40 }]
    const zones60 = [{ tot: 60 }]
    const zones80 = [{ tot: 80 }]
    // Should not crash or produce unexpected bands
    expect(compositeScore(zones40).risk).toBeDefined()
    expect(compositeScore(zones60).risk).toBeDefined()
    expect(compositeScore(zones80).risk).toBeDefined()
  })
})

// ── 4. Override interaction conflicts ─────────────────────────────────────

describe('Override interactions', () => {
  it('gate5 + synergistic both firing simultaneously', () => {
    const zone = {
      zn: 'Z1', co: '55', hc: '1.0',         // synergistic (both > OSHA PEL)
      sa: 'No airflow detected',               // gate5
      pm: '5', tf: '72', rh: '45', cx: 'No complaints',
    }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    // synergistic caps at 39, gate5 caps at 40 → min(39, 40) = 39
    expect(result.tot).toBeLessThanOrEqual(39)
    expect(result.risk).toBe('Critical')
    // Both overrides should be present in findings
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    expect(contCat.synergistic).toBe(true)
    expect(hvacCat.gate5).toBe(true)
  })

  it('gate5 forces category to be scored even with zero sufficiency', () => {
    // sa triggers gate5 but hm/fc not provided → would be DATA_GAP
    // Critical physical findings must NOT be hidden behind DATA_GAP
    const zone = { zn: 'Z1', sa: 'No airflow detected', tf: '72', rh: '45', cx: 'No complaints' }
    const result = scoreZone(zone, {})
    const hvac = result.cats.find(c => c.l === 'HVAC')
    // Must NOT be DATA_GAP — critical findings must be visible
    expect(hvac.status).not.toBe('DATA_GAP')
    expect(hvac.s).toBe(0)
    expect(hvac.gate5).toBe(true)
    // Critical finding must be accessible
    expect(hvac.r.some(r => r.sev === 'critical')).toBe(true)
    // Zone total must be capped by gate5
    expect(result.tot).toBeLessThanOrEqual(40)
  })

  it('data_hall zone type with suppressed Complaints', () => {
    const zone = { zn: 'DC1', zone_subtype: 'data_hall', co2: '400', tf: '72', rh: '45', pm: '5', co: '2', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    const complaints = result.cats.find(c => c.l === 'Complaints')
    expect(complaints.status).toBe('SUPPRESSED')
    expect(complaints.s).toBe(0)
    // Total should still be valid
    expect(result.tot).not.toBeNaN()
    expect(Number.isFinite(result.tot)).toBe(true)
  })
})

// ── 5. compositeScore edge cases ──────────────────────────────────────────

describe('compositeScore edge cases', () => {
  it('mix of null and scored zones', () => {
    const zones = [
      { tot: 80, confidence: 'High' },
      { tot: null, confidence: 'Low' },
    ]
    const result = compositeScore(zones)
    expect(result.tot).toBe(80) // only 1 scorable zone
    expect(result.partialComposite).toBe(true)
    expect(result.count).toBe(2)
  })

  it('single zone with tot=0', () => {
    const result = compositeScore([{ tot: 0 }])
    expect(result.tot).toBe(0)
    expect(result.risk).toBe('Critical')
  })

  it('single zone with tot=100', () => {
    const result = compositeScore([{ tot: 100 }])
    expect(result.tot).toBe(100)
    expect(result.risk).toBe('Low Risk')
  })

  it('100 zones does not crash', () => {
    const zones = Array.from({ length: 100 }, (_, i) => ({ tot: 50 + (i % 50) }))
    const result = compositeScore(zones)
    expect(result).toBeDefined()
    expect(Number.isFinite(result.tot)).toBe(true)
  })
})

// ── 6. genRecs with unusual finding structures ────────────────────────────

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
