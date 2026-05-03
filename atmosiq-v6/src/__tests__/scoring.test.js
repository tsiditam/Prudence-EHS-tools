import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs } from '../engines/scoring'

// Engine v2.8.0 — genRecs returns RecommendationAction[] objects per
// bucket instead of legacy "ZoneName: text" strings. txt() flattens
// either shape so existing string-match assertions keep working.
const txt = (r) => typeof r === 'string' ? r : (r?.text || '')

// ── scoreZone ──────────────────────────────────────────────────────────────

describe('scoreZone', () => {
  it('scores a zone with full data as Low Risk', () => {
    const zone = { zn: 'Lobby', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', tv: '100', hc: '0.01', vd: 'None', cx: 'No complaints', cfm_person: '15', ach: '6', sa: 'Normal' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    expect(result.tot).toBeGreaterThanOrEqual(80)
    expect(result.risk).toBe('Low Risk')
    expect(result.zoneName).toBe('Lobby')
    expect(result.cats).toHaveLength(5)
  })

  it('returns Critical for a zone with CO above OSHA PEL', () => {
    const zone = { zn: 'Boiler Room', co: '60', pm: '5' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    expect(contCat.s).toBe(0)
    const coFinding = contCat.r.find(r => r.t.includes('CO') && r.t.includes('OSHA'))
    expect(coFinding.sev).toBe('critical')
    expect(coFinding.std).toBe('OSHA')
  })

  it('flags high CO2 as ventilation deficiency', () => {
    const zone = { co2: '1600' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const ventCat = result.cats.find(c => c.l === 'Ventilation')
    expect(ventCat.s).toBe(0)
    expect(ventCat.r[0].sev).toBe('critical')
  })

  it('scores HVAC maintenance concern', () => {
    const zone = { zn: 'Office' }
    const bldg = { hm: 'Over 12 months' }
    const result = scoreZone(zone, bldg)
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    expect(hvacCat.s).toBeLessThanOrEqual(15)
    expect(hvacCat.r[0].sev).toBe('medium')
  })

  it('treats unknown HVAC maintenance as data gap, not deficiency', () => {
    const zone = { zn: 'Lobby', co2: '450', tf: '72', rh: '45' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    const finding = hvacCat.r.find(r => r.t.includes('Data Gap'))
    expect(finding).toBeDefined()
    expect(finding.sev).toBe('info')
    expect(hvacCat.adminGap).toBe(true)
    expect(result.hvacAdminGap).toBe(true)
  })

  it('uses professional language for gate 5 HVAC findings', () => {
    const zone = { zn: 'Mech Room', sa: 'No airflow detected' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    const gate5Finding = hvacCat.r.find(r => r.t.includes('Critical HVAC Condition Identified'))
    expect(gate5Finding).toBeDefined()
    expect(hvacCat.r.every(r => !r.t.includes('SYSTEM FAILURE'))).toBe(true)
  })

  it('scores complaints with affected occupants', () => {
    const zone = {
      zn: 'Open Office',
      cx: 'Yes — complaints reported',
      ac: 'More than 10',
      sy: ['Headache', 'Fatigue'],
    }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const compCat = result.cats.find(c => c.l === 'Complaints')
    expect(compCat.s).toBe(0)
    expect(compCat.r[0].sev).toBe('critical')
  })

  it('flags extensive water damage in environment', () => {
    const zone = { wd: 'Extensive damage', tf: '72', rh: '45' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const envCat = result.cats.find(c => c.l === 'Environment')
    expect(envCat.s).toBe(0)
    expect(envCat.r.some(r => r.sev === 'critical')).toBe(true)
  })

  it('flags formaldehyde above OSHA PEL', () => {
    const zone = { hc: '1.0', pm: '5', co: '2' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const hchoFinding = contCat.r.find(r => r.t.includes('Formaldehyde'))
    expect(hchoFinding).toBeDefined()
    expect(hchoFinding.sev).toBe('critical')
    expect(hchoFinding.std).toBe('29 CFR 1910.1048')
  })

  it('flags PM2.5 above EPA standard', () => {
    const zone = { pm: '40', co: '2' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const pmFinding = contCat.r.find(r => r.t.includes('PM2.5'))
    expect(pmFinding.sev).toBe('high')
    expect(pmFinding.std).toBe('EPA NAAQS')
  })

  it('flags extensive visible mold', () => {
    const zone = { mi: 'Extensive — >30 sq ft', pm: '5', co: '2' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const moldFinding = contCat.r.find(r => r.t.toLowerCase().includes('mold'))
    expect(moldFinding).toBeDefined()
    expect(moldFinding.sev).toBe('critical')
  })
})

// ── compositeScore ─────────────────────────────────────────────────────────

describe('compositeScore', () => {
  it('returns null for empty array', () => {
    expect(compositeScore([])).toBeNull()
  })

  it('computes weighted mean when no Critical zones (AIHA strategy)', () => {
    const scores = [{ tot: 90 }, { tot: 60 }]
    const result = compositeScore(scores)
    expect(result.avg).toBe(75)
    expect(result.worst).toBe(60)
    expect(result.tot).toBe(75)
    expect(result.count).toBe(2)
    expect(result.logic).toBe('weighted-mean-of-zones')
  })

  it('classifies Low Risk at 85+', () => {
    const scores = [{ tot: 95 }, { tot: 90 }]
    const result = compositeScore(scores)
    expect(result.risk).toBe('Low Risk')
  })

  it('classifies Critical below 50 and uses worst-zone override', () => {
    const scores = [{ tot: 30 }, { tot: 20 }]
    const result = compositeScore(scores)
    expect(result.risk).toBe('Critical')
    expect(result.logic).toBe('worst-zone-override')
    expect(result.tot).toBe(20)
  })

  it('single zone returns that zone score', () => {
    const scores = [{ tot: 80 }]
    const result = compositeScore(scores)
    expect(result.tot).toBe(80)
  })
})

// ── evalOSHA ───────────────────────────────────────────────────────────────

describe('evalOSHA', () => {
  it('flags documented complaints with hazard indicators', () => {
    const d = { cx: 'Yes — complaints reported' }
    const result = evalOSHA(d, 60)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.includes('complaint') || f.includes('Documented'))).toBe(true)
  })

  it('does not flag when no complaints and good score', () => {
    const d = { cx: 'No' }
    const result = evalOSHA(d, 90)
    expect(result.flag).toBe(false)
    expect(result.fl).toHaveLength(0)
  })

  it('flags CO above OSHA PEL', () => {
    const d = { co: '55' }
    const result = evalOSHA(d, 80)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.includes('CO'))).toBe(true)
  })

  it('flags formaldehyde above OSHA PEL', () => {
    const d = { hc: '1.0' }
    const result = evalOSHA(d, 80)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.toLowerCase().includes('formaldehyde'))).toBe(true)
  })

  it('flags water/mold indicators', () => {
    const d = { wd: 'Active leak' }
    const result = evalOSHA(d, 80)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.toLowerCase().includes('water') || f.toLowerCase().includes('mold'))).toBe(true)
  })

  it('reports confidence level for data-rich assessment', () => {
    const d = { co2: '600', tf: '72', rh: '45', pm: '5', co: '2', cx: 'No complaints', hm: 'Within 6 months', fc: 'Clean' }
    const result = evalOSHA(d, 80)
    expect(['High', 'Medium']).toContain(result.conf)
  })

  it('identifies data gaps when no instrument data', () => {
    const d = { hm: 'Unknown' }
    const result = evalOSHA(d, 80)
    expect(result.gaps).toContain('No instrument data')
    expect(result.gaps).toContain('HVAC maintenance unknown')
  })
})

// ── calcVent ───────────────────────────────────────────────────────────────

describe('calcVent', () => {
  it('returns null when missing inputs', () => {
    expect(calcVent(null, 500, 10)).toBeNull()
    expect(calcVent('office', null, 10)).toBeNull()
    expect(calcVent('office', 500, null)).toBeNull()
  })

  it('returns null for unknown space use', () => {
    expect(calcVent('swimming_pool', 500, 10)).toBeNull()
  })

  it('calculates office ventilation correctly', () => {
    const result = calcVent('office', 1000, 20)
    expect(result.pOA).toBe(100)
    expect(result.aOA).toBe(60)
    expect(result.tot).toBe(160)
    expect(result.pp).toBe(8)
  })

  it('calculates classroom ventilation (EPA TfS 15 cfm/person)', () => {
    // classroom: pp=15, ps=0.12
    const result = calcVent('classroom', 800, 30)
    expect(result.pOA).toBe(450) // 15 * 30
    expect(result.aOA).toBeCloseTo(96, 1) // 0.12 * 800
    expect(result.tot).toBeCloseTo(546, 1)
  })
})

// ── genRecs ────────────────────────────────────────────────────────────────

describe('genRecs', () => {
  it('generates immediate action for CO critical', () => {
    const zoneScores = [{
      zoneName: 'Boiler Room',
      cats: [{ l: 'Contaminants', r: [{ t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical' }] }],
    }]
    const recs = genRecs(zoneScores, { hm: 'Within 6 months' })
    expect(recs.imm.length).toBeGreaterThan(0)
    expect(recs.imm.some(r => txt(r).toLowerCase().includes('evacuate') || txt(r).toLowerCase().includes('combustion'))).toBe(true)
  })

  it('recommends HVAC maintenance schedule for unknown maintenance', () => {
    const zoneScores = [{
      zoneName: 'Office',
      cats: [{ l: 'HVAC', r: [{ t: 'Maintenance unknown', sev: 'info' }] }],
    }]
    const recs = genRecs(zoneScores, { hm: 'Unknown' })
    expect(recs.adm.some(r => txt(r).toLowerCase().includes('hvac') && txt(r).toLowerCase().includes('maintenance'))).toBe(true)
  })

  it('always includes monitoring recommendation', () => {
    const zoneScores = [{
      zoneName: 'Lobby',
      cats: [{ l: 'Ventilation', r: [{ t: 'CO2 450 ppm — good', sev: 'pass' }] }],
    }]
    const recs = genRecs(zoneScores, { hm: 'Within 6 months' })
    expect(recs.mon.length).toBeGreaterThan(0)
    expect(recs.mon.some(r => txt(r).toLowerCase().includes('reassessment'))).toBe(true)
  })

  it('deduplicates recommendations', () => {
    const zoneScores = [
      { zoneName: 'Z1', cats: [{ l: 'Contaminants', r: [{ t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical' }] }] },
      { zoneName: 'Z1', cats: [{ l: 'Contaminants', r: [{ t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical' }] }] },
    ]
    const recs = genRecs(zoneScores, {})
    const evacuate = recs.imm.filter(r => txt(r).toLowerCase().includes('evacuate') || txt(r).toLowerCase().includes('combustion'))
    expect(evacuate.length).toBe(1)
  })
})
