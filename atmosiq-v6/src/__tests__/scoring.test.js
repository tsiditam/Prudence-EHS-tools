import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore, evalOSHA, calcVent, genRecs } from '../engines/scoring'

// ── scoreZone ──────────────────────────────────────────────────────────────

describe('scoreZone', () => {
  it('returns Low Risk for a clean zone with no issues', () => {
    const zone = { zn: 'Lobby', co2: '450', tf: '72', rh: '45' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    expect(result.tot).toBeGreaterThanOrEqual(85)
    expect(result.risk).toBe('Low Risk')
    expect(result.zoneName).toBe('Lobby')
    expect(result.cats).toHaveLength(5)
  })

  it('returns Critical for a zone with CO above OSHA PEL', () => {
    const zone = { zn: 'Boiler Room', co: '60' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    // CO above OSHA PEL (50) -> contaminant score drops by 25
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    expect(contCat.s).toBe(0)
    const coFinding = contCat.r.find(r => r.t.includes('CO'))
    expect(coFinding.sev).toBe('critical')
    expect(coFinding.std).toBe('OSHA')
  })

  it('flags high CO2 as ventilation deficiency', () => {
    const zone = { co2: '1600' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const ventCat = result.cats.find(c => c.l === 'Ventilation')
    expect(ventCat.s).toBe(0) // CO2 > 1500 = action level
    expect(ventCat.r[0].sev).toBe('critical')
  })

  it('scores HVAC maintenance concern', () => {
    const zone = { zn: 'Office' }
    const bldg = { hm: 'Over 12 months' }
    const result = scoreZone(zone, bldg)
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    expect(hvacCat.s).toBeLessThanOrEqual(15) // 20 - 5 = 15, capped to min(15, maxAwardable=10) = 10
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
    const zone = { wd: 'Extensive damage' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const envCat = result.cats.find(c => c.l === 'Environment')
    expect(envCat.s).toBe(0) // 15 - 15 = 0
    expect(envCat.r[0].sev).toBe('critical')
  })

  it('flags formaldehyde above OSHA PEL', () => {
    const zone = { hc: '1.0' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const hchoFinding = contCat.r.find(r => r.t.includes('HCHO'))
    expect(hchoFinding.sev).toBe('critical')
    expect(hchoFinding.std).toBe('OSHA')
  })

  it('flags PM2.5 above EPA standard', () => {
    const zone = { pm: '40' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const pmFinding = contCat.r.find(r => r.t.includes('PM2.5'))
    expect(pmFinding.sev).toBe('high')
    expect(pmFinding.std).toBe('EPA')
  })

  it('flags extensive visible mold', () => {
    const zone = { mi: 'Extensive — >30 sq ft' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const moldFinding = contCat.r.find(r => r.t.includes('mold'))
    expect(moldFinding.sev).toBe('critical')
  })
})

// ── compositeScore ─────────────────────────────────────────────────────────

describe('compositeScore', () => {
  it('returns null for empty array', () => {
    expect(compositeScore([])).toBeNull()
  })

  it('computes weighted average of 60% avg + 40% worst', () => {
    const scores = [{ tot: 90 }, { tot: 60 }]
    const result = compositeScore(scores)
    // avg = 75, worst = 60, comp = 75*0.6 + 60*0.4 = 45+24 = 69
    expect(result.tot).toBe(69)
    expect(result.avg).toBe(75)
    expect(result.worst).toBe(60)
    expect(result.count).toBe(2)
    expect(result.risk).toBe('High Risk') // 69 falls in 50-69 range
  })

  it('classifies Low Risk at 85+', () => {
    const scores = [{ tot: 95 }, { tot: 90 }]
    const result = compositeScore(scores)
    expect(result.risk).toBe('Low Risk')
  })

  it('classifies Critical below 50', () => {
    const scores = [{ tot: 30 }, { tot: 20 }]
    const result = compositeScore(scores)
    expect(result.risk).toBe('Critical')
  })

  it('single zone returns that zone score', () => {
    const scores = [{ tot: 80 }]
    const result = compositeScore(scores)
    // avg=80, worst=80 -> 80*0.6+80*0.4=80
    expect(result.tot).toBe(80)
  })
})

// ── evalOSHA ───────────────────────────────────────────────────────────────

describe('evalOSHA', () => {
  it('flags documented complaints with hazard indicators', () => {
    const d = { cx: 'Yes — complaints reported' }
    const result = evalOSHA(d, 60) // tot < 70
    expect(result.flag).toBe(true)
    expect(result.fl).toContain('Documented complaints + hazard indicators')
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
    expect(result.fl).toContain('CO exceeds OSHA PEL')
  })

  it('flags HCHO above OSHA PEL', () => {
    const d = { hc: '1.0' }
    const result = evalOSHA(d, 80)
    expect(result.flag).toBe(true)
    expect(result.fl).toContain('HCHO exceeds OSHA PEL')
  })

  it('flags water/mold indicators', () => {
    const d = { wd: 'Active leak' }
    const result = evalOSHA(d, 80)
    expect(result.flag).toBe(true)
    expect(result.fl).toContain('Water/mold indicators')
  })

  it('reports confidence as High when all data present', () => {
    const d = { co2: '600', tf: '72', cx: 'Yes — complaints reported', hm: 'Within 6 months' }
    const result = evalOSHA(d, 80)
    expect(result.conf).toBe('High')
  })

  it('reports confidence as Limited when no data', () => {
    const d = { hm: 'Unknown' }
    const result = evalOSHA(d, 80)
    expect(result.conf).toBe('Limited')
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
    // office: pp=5, ps=0.06
    const result = calcVent('office', 1000, 20)
    expect(result.pOA).toBe(100) // 5 * 20
    expect(result.aOA).toBe(60)  // 0.06 * 1000
    expect(result.tot).toBe(160) // 100 + 60
    expect(result.pp).toBe(8)    // 160 / 20
  })

  it('calculates classroom ventilation', () => {
    // classroom: pp=10, ps=0.12
    const result = calcVent('classroom', 800, 30)
    expect(result.pOA).toBe(300) // 10 * 30
    expect(result.aOA).toBeCloseTo(96, 1) // 0.12 * 800
    expect(result.tot).toBeCloseTo(396, 1)
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
    expect(recs.imm.some(r => r.includes('Evacuate'))).toBe(true)
  })

  it('recommends HVAC PM schedule for unknown maintenance', () => {
    const zoneScores = [{
      zoneName: 'Office',
      cats: [{ l: 'HVAC', r: [{ t: 'Maintenance unknown', sev: 'high' }] }],
    }]
    const recs = genRecs(zoneScores, { hm: 'Unknown' })
    expect(recs.adm.some(r => r.includes('HVAC PM'))).toBe(true)
  })

  it('always includes monitoring recommendation', () => {
    const zoneScores = [{
      zoneName: 'Lobby',
      cats: [{ l: 'Ventilation', r: [{ t: 'CO2 450 ppm — good', sev: 'pass' }] }],
    }]
    const recs = genRecs(zoneScores, { hm: 'Within 6 months' })
    expect(recs.mon).toContain('Periodic reassessment recommended.')
  })

  it('deduplicates recommendations', () => {
    const zoneScores = [
      { zoneName: 'Z1', cats: [{ l: 'Contaminants', r: [{ t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical' }] }] },
      { zoneName: 'Z1', cats: [{ l: 'Contaminants', r: [{ t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical' }] }] },
    ]
    const recs = genRecs(zoneScores, {})
    const evac = recs.imm.filter(r => r.includes('Evacuate'))
    // Same zone name + same text = should be deduped
    expect(evac.length).toBe(1)
  })
})
