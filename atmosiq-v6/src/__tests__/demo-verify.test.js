import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore } from '../engines/scoring'
import { DEMO_BUILDING, DEMO_ZONES } from '../constants/demoData'
import { DEMO_FM_BUILDING, DEMO_FM_ZONES } from '../constants/demoDataFM'
import { DEMO_DC_BUILDING, DEMO_DC_ZONES } from '../constants/demoDataDC'

describe('IH Demo — Meridian Commerce Tower', () => {
  const scores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(scores)

  it('produces valid zone scores', () => {
    scores.forEach(zs => {
      expect(zs.tot).not.toBeNull()
      expect(zs.tot).not.toBeNaN()
      expect(zs.tot).toBeGreaterThanOrEqual(0)
      expect(zs.tot).toBeLessThanOrEqual(100)
    })
  })

  it('no forbidden language in any finding', () => {
    const forbidden = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override', 'emergency']
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      forbidden.forEach(f => expect(r.t).not.toContain(f))
    })))
  })

  it('HVAC gate5 fires (standing water in drain pan)', () => {
    const hvac0 = scores[0].cats.find(c => c.l === 'HVAC')
    expect(hvac0.gate5).toBe(true)
    expect(scores[0].tot).toBeLessThanOrEqual(40)
  })

  it('composite score is valid', () => {
    expect(comp.tot).not.toBeNull()
    expect(comp.tot).not.toBeNaN()
    expect(comp.risk).toBeDefined()
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
    const forbidden = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override', 'emergency']
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      forbidden.forEach(f => expect(r.t).not.toContain(f))
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

describe('DC Demo — Hizinburg Data Center', () => {
  const scores = DEMO_DC_ZONES.map(z => scoreZone(z, DEMO_DC_BUILDING))
  const comp = compositeScore(scores)

  it('produces valid zone scores', () => {
    scores.forEach(zs => {
      expect(zs.tot).not.toBeNull()
      expect(zs.tot).not.toBeNaN()
    })
  })

  it('no forbidden language in any finding', () => {
    const forbidden = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override', 'emergency']
    scores.forEach(zs => zs.cats.forEach(c => c.r.forEach(r => {
      forbidden.forEach(f => expect(r.t).not.toContain(f))
    })))
  })

  it('HVAC scores full credit with maintenance current + clean filter', () => {
    scores.forEach(zs => {
      const hvac = zs.cats.find(c => c.l === 'HVAC')
      if (hvac.s !== null && !hvac.suppressed) {
        expect(hvac.s).toBe(hvac.mx)
      }
    })
  })

  it('G3 corrosion triggers Critical override on Data Hall B', () => {
    const hallB = scores.find(zs => zs.zoneName === 'Data Hall B — Expansion')
    expect(hallB.tot).toBeLessThanOrEqual(39)
    expect(hallB.risk).toBe('Critical')
  })

  it('composite uses worst-zone override (Critical zone present)', () => {
    expect(comp.logic).toBe('worst-zone-override')
  })
})
