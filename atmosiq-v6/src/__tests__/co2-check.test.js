import { describe, it, expect } from 'vitest'
import { scoreZone } from '../engines/scoring'

describe('CO2 delta fix', () => {
  it('CO2 890 with outdoor 410 (delta 480) should be pass', () => {
    const zone = { zn: 'NOC', co2: '890', co2o: '410', tf: '72', rh: '45', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const r = scoreZone(zone, bldg)
    const vent = r.cats.find(c => c.l === 'Ventilation')
    const co2Finding = vent.r.find(f => f.t.includes('890'))
    expect(co2Finding.sev).toBe('pass')
  })

  it('CO2 1200 with outdoor 410 (delta 790) should be high', () => {
    const zone = { zn: 'Z1', co2: '1200', co2o: '410', tf: '72', rh: '45', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const r = scoreZone(zone, bldg)
    const vent = r.cats.find(c => c.l === 'Ventilation')
    const co2Finding = vent.r.find(f => f.t.includes('1200'))
    expect(co2Finding.sev).toBe('high')
  })

  it('CO2 950 with outdoor 410 (delta 540) should be medium', () => {
    const zone = { zn: 'Z1', co2: '950', co2o: '410', tf: '72', rh: '45', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const r = scoreZone(zone, bldg)
    const vent = r.cats.find(c => c.l === 'Ventilation')
    const co2Finding = vent.r.find(f => f.t.includes('950'))
    expect(co2Finding.sev).toBe('medium')
  })
})
