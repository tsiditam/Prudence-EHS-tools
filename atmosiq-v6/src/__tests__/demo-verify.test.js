import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore } from '../engines/scoring'
import { DEMO_CLEAN_BUILDING, DEMO_CLEAN_ZONES } from '../constants/demoDataClean'
import { DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_FINDINGS_BUILDING, DEMO_FINDINGS_ZONES } from '../constants/demoDataFindings'

const FORBIDDEN = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override', 'emergency']

describe('Demo A — Lakeside Professional Center (well-run office)', () => {
  const scores = DEMO_CLEAN_ZONES.map(z => scoreZone(z, DEMO_CLEAN_BUILDING))
  const comp = compositeScore(scores)

  it('produces valid zone scores in range', () => {
    scores.forEach(zs => {
      expect(zs.tot).not.toBeNull()
      expect(zs.tot).not.toBeNaN()
      expect(zs.tot).toBeGreaterThanOrEqual(0)
      expect(zs.tot).toBeLessThanOrEqual(100)
    })
  })

  it('no forbidden language in any finding', () => {
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      FORBIDDEN.forEach(f => expect(r.t).not.toContain(f))
    })))
  })

  it('clean HVAC: no gate5, full category credit', () => {
    scores.forEach(zs => {
      const hvac = zs.cats.find(c => c.l === 'HVAC')
      expect(hvac.gate5).toBeFalsy()
      expect(hvac.s).toBe(hvac.mx)
    })
  })

  it('no occupant complaints in either zone', () => {
    scores.forEach(zs => {
      const comp = zs.cats.find(c => c.l === 'Complaints')
      expect(comp.s).toBe(comp.mx)
    })
  })

  it('composite is a low-risk, weighted-mean result (no critical override)', () => {
    expect(comp.tot).not.toBeNull()
    expect(comp.logic).toBe('weighted-mean-of-zones')
    expect(comp.risk).toBe('Low Risk')
  })

  it('no null/NaN in any category score', () => {
    scores.forEach(zs => zs.cats.forEach(c => {
      if (c.s !== null) {
        expect(c.s).not.toBeNaN()
        expect(c.s).toBeGreaterThanOrEqual(0)
        expect(c.s).toBeLessThanOrEqual(c.mx)
      }
    }))
  })
})

describe('FM Demo — Greenfield Office Park', () => {
  const scores = DEMO_FM_ZONES.map(z => scoreZone(z, DEMO_FM_BUILDING))
  const comp = compositeScore(scores)

  it('produces valid zone scores', () => {
    scores.forEach(zs => {
      expect(zs.tot).not.toBeNull()
      expect(zs.tot).not.toBeNaN()
    })
  })

  it('no forbidden language in any finding', () => {
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      FORBIDDEN.forEach(f => expect(r.t).not.toContain(f))
    })))
  })

  it('Unknown HVAC maintenance → adminGap, not Critical HVAC', () => {
    scores.forEach(zs => {
      const hvac = zs.cats.find(c => c.l === 'HVAC')
      if (hvac.s !== null) {
        expect(hvac.adminGap).toBe(true)
        expect(hvac.s).toBeGreaterThan(3)  // not capped at old 3/20
      }
    })
  })

  it('composite score is valid', () => {
    expect(comp.tot).not.toBeNull()
    expect(comp.risk).toBeDefined()
  })
})

describe('Demo B — Harborview Corporate Center (building with findings)', () => {
  const scores = DEMO_FINDINGS_ZONES.map(z => scoreZone(z, DEMO_FINDINGS_BUILDING))
  const comp = compositeScore(scores)

  it('produces valid zone scores in range', () => {
    scores.forEach(zs => {
      expect(zs.tot).not.toBeNull()
      expect(zs.tot).not.toBeNaN()
      expect(zs.tot).toBeGreaterThanOrEqual(0)
      expect(zs.tot).toBeLessThanOrEqual(100)
    })
  })

  it('no forbidden language in any finding', () => {
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      FORBIDDEN.forEach(f => expect(r.t).not.toContain(f))
    })))
  })

  it('critical HVAC gate5 fires (standing water in drain pan)', () => {
    const hvac0 = scores[0].cats.find(c => c.l === 'HVAC')
    expect(hvac0.gate5).toBe(true)
    expect(scores[0].tot).toBeLessThanOrEqual(40)
  })

  it('occupant complaints present in both zones', () => {
    scores.forEach(zs => {
      const comp = zs.cats.find(c => c.l === 'Complaints')
      expect(comp.s).toBeLessThan(comp.mx)
    })
  })

  it('composite reflects the worst-zone Critical override', () => {
    expect(comp.tot).not.toBeNull()
    expect(comp.logic).toBe('worst-zone-override')
    expect(comp.risk).toBe('Critical')
  })

  it('no null/NaN in any category score', () => {
    scores.forEach(zs => zs.cats.forEach(c => {
      if (c.s !== null) {
        expect(c.s).not.toBeNaN()
        expect(c.s).toBeGreaterThanOrEqual(0)
        expect(c.s).toBeLessThanOrEqual(c.mx)
      }
    }))
  })
})
