/**
 * The assessment engine's core behaviour.
 *
 * The `compositeScore` describe block went with the 100-point score, and
 * every `.tot` / `.risk` / `cat.s` assertion elsewhere in this file went
 * with it. What each of those was really pinning — that a CO reading
 * above the PEL produces a critical finding with the right citation and
 * averaging caveat, that CO2 is capped at high, that unknown maintenance
 * is a data gap rather than a deficiency — is asserted on the findings
 * themselves, where it was always observable.
 */

import { describe, it, expect } from 'vitest'
import { countFindings } from '../utils/assessmentVerdict'
import { scoreZone, summarizeAssessment, evalOSHA, calcVent, genRecs } from '../engines/scoring'

// Engine v2.8.0 — genRecs returns RecommendationAction[] objects per
// bucket instead of legacy "ZoneName: text" strings. txt() flattens
// either shape so existing string-match assertions keep working.
const txt = (r) => typeof r === 'string' ? r : (r?.text || '')

// ── scoreZone ──────────────────────────────────────────────────────────────

describe('scoreZone', () => {
  it('assesses a zone with full data and finds nothing to act on', () => {
    // 74°F and a pinned date. Was 72°F with no date, which relied on the
    // old 67–82°F band being wide enough to hold any reading in any season;
    // against the real summer band (73–79) it is below range, so the test
    // would have passed or failed by the month it ran in. Pinning the date is
    // the standing advice for this engine — see CLAUDE.md pitfall #3.
    const zone = { zn: 'Lobby', co2: '450', tf: '74', rh: '45', pm: '5', co: '2', tv: '100', hc: '0.01', vd: 'None', cx: 'No complaints', cfm_person: '15', ach: '6', sa: 'Normal' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean', assessmentDate: '2026-07-15' }
    const result = scoreZone(zone, bldg)
    expect(result.zoneName).toBe('Lobby')
    expect(result.cats).toHaveLength(5)
    // Was `tot >= 80` / 'Low Risk'. The observable property is that a
    // well-run zone produces no finding warranting attention.
    expect(countFindings([result]).attention).toBe(0)
    expect(result.assessedCats.length).toBeGreaterThan(0)
  })

  it('returns Critical for a zone with CO above the OSHA PEL value', () => {
    const zone = { zn: 'Boiler Room', co: '60', pm: '5' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const coFinding = contCat.r.find(r => r.t.includes('CO') && r.t.includes('OSHA'))
    expect(coFinding.sev).toBe('critical')
    // Asserted as a substring, not an exact match: the citation now carries
    // the regulation rather than just the agency, and 'osha' is what
    // bridge/classify.ts keys on.
    expect(coFinding.std).toContain('OSHA')
    expect(coFinding.std).toContain('1910.1000')
    // The PEL is an 8-hour TWA and this is a grab reading — the finding must
    // say so rather than assert a bare exceedance.
    expect(coFinding.t).toMatch(/8-hour time-weighted average/)
  })

  it('flags high CO2 as ventilation deficiency — capped at high, never critical', () => {
    const zone = { co2: '1600' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const ventCat = result.cats.find(c => c.l === 'Ventilation')
    // The deficiency is real, and CO2 indexes outdoor-air delivery per occupant; it is not a
    // contaminant measure, and no concentration of it alone is a critical
    // finding. This was `critical` until 2026-08, which rated a stuffy
    // meeting room the same as a hydrogen reading at 25% of the LEL — and
    // since the verdict layer escalates the whole assessment on any critical
    // finding, that reached the report's triage priority.
    // Enforced by the criterion class, not by a literal here.
    expect(ventCat.r[0].sev).toBe('high')
  })

  it('reports overdue HVAC maintenance as a medium finding', () => {
    const zone = { zn: 'Office' }
    const bldg = { hm: 'Over 12 months' }
    const result = scoreZone(zone, bldg)
    const hvacCat = result.cats.find(c => c.l === 'HVAC')
    expect(hvacCat.r[0].sev).toBe('medium')
    expect(hvacCat.r[0].t).toMatch(/overdue/i)
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

  it('reports complaints with affected occupants', () => {
    const zone = {
      zn: 'Open Office',
      cx: 'Yes — complaints reported',
      ac: 'More than 10',
      sy: ['Headache', 'Fatigue'],
    }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const compCat = result.cats.find(c => c.l === 'Complaints')
    expect(compCat.r[0].sev).toBe('critical')
  })

  it('flags extensive water damage in environment', () => {
    const zone = { wd: 'Extensive damage', tf: '72', rh: '45' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const envCat = result.cats.find(c => c.l === 'Environment')
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
    // Substring, not exact: the criterion registry cites the specific
    // paragraph (…(c)(1) for the PEL) rather than the standard as a whole.
    expect(hchoFinding.std).toContain('1910.1048')
  })

  it('flags PM2.5 above EPA standard', () => {
    const zone = { pm: '40', co: '2' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const pmFinding = contCat.r.find(r => r.t.includes('PM2.5'))
    expect(pmFinding.sev).toBe('high')
    // Substring, not exact: the criterion registry cites the specific
    // NAAQS paragraph rather than the standard as a whole. The criterion
    // id is the stable contract — the citation text belongs to the registry.
    expect(pmFinding.cid).toBe('pm25_epa_24h')
    expect(pmFinding.std).toContain('50.18')
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

// ── summarizeAssessment ────────────────────────────────────────────────────
//
// This was `describe('compositeScore')`: a weighted mean, a worst-zone
// override, and the band a given total classified into. What replaces it
// rolls zones up without ranking them.

describe('summarizeAssessment', () => {
  const zoneWith = (findings) => ({
    cats: [{ l: 'Contaminants', r: findings }],
    confidence: 'High',
    partialScore: false,
    insufficientCats: [],
  })

  it('returns null for an empty array', () => {
    expect(summarizeAssessment([])).toBeNull()
  })

  it('counts findings across zones without averaging them', () => {
    const result = summarizeAssessment([
      zoneWith([{ t: 'a', sev: 'critical' }, { t: 'b', sev: 'low' }]),
      zoneWith([{ t: 'c', sev: 'medium' }]),
    ])
    expect(result.count).toBe(2)
    expect(result.findings.total).toBe(3)
    expect(result.findings.attention).toBe(2)
    expect(result.findings.bySeverity).toEqual({ critical: 1, high: 0, medium: 1, low: 1 })
  })

  it('takes the LOWEST zone confidence — a building is not better understood than its least-measured zone', () => {
    const high = { ...zoneWith([]), confidence: 'High' }
    const low = { ...zoneWith([]), confidence: 'Low' }
    expect(summarizeAssessment([high, low]).confidence).toBe('Low')
    expect(summarizeAssessment([high, high]).confidence).toBe('High')
  })

  it('reports partial data when any zone left a category unassessed', () => {
    const partial = { ...zoneWith([]), partialScore: true, insufficientCats: ['HVAC'] }
    expect(summarizeAssessment([zoneWith([]), partial]).partialData).toBe(true)
    expect(summarizeAssessment([zoneWith([])]).partialData).toBe(false)
  })

  it('a single zone summarizes to that zone', () => {
    const result = summarizeAssessment([zoneWith([{ t: 'a', sev: 'high' }])])
    expect(result.count).toBe(1)
    expect(result.findings.total).toBe(1)
  })
})

describe('evalOSHA', () => {
  it('flags documented complaints WITH a concurrent hazard indicator', () => {
    // The rule used to fire on complaints plus a composite under 70.
    // Callers passed `composite?.tot || 0`, so a missing composite scored
    // zero and it fired by default — on the assessments with the least
    // evidence behind them. It now needs an actual concurrent indicator.
    const d = { cx: 'Yes — complaints reported', co: '55' }
    const result = evalOSHA(d)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.includes('complaint') || f.includes('Documented'))).toBe(true)
  })

  it('does not flag complaints on their own', () => {
    const result = evalOSHA({ cx: 'Yes — complaints reported' })
    expect(result.fl.some(f => f.includes('Documented complaint'))).toBe(false)
  })

  it('does not flag when there are no complaints and nothing measured', () => {
    const d = { cx: 'No' }
    const result = evalOSHA(d)
    expect(result.flag).toBe(false)
    expect(result.fl).toHaveLength(0)
  })

  it('flags CO above OSHA PEL', () => {
    const d = { co: '55' }
    const result = evalOSHA(d)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.includes('CO'))).toBe(true)
  })

  it('flags formaldehyde above OSHA PEL', () => {
    const d = { hc: '1.0' }
    const result = evalOSHA(d)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.toLowerCase().includes('formaldehyde'))).toBe(true)
  })

  it('flags water/mold indicators', () => {
    const d = { wd: 'Active leak' }
    const result = evalOSHA(d)
    expect(result.flag).toBe(true)
    expect(result.fl.some(f => f.toLowerCase().includes('water') || f.toLowerCase().includes('mold'))).toBe(true)
  })

  it('reports confidence level for data-rich assessment', () => {
    const d = { co2: '600', tf: '72', rh: '45', pm: '5', co: '2', cx: 'No complaints', hm: 'Within 6 months', fc: 'Clean' }
    const result = evalOSHA(d)
    expect(['High', 'Medium']).toContain(result.conf)
  })

  it('identifies data gaps when no instrument data', () => {
    const d = { hm: 'Unknown' }
    const result = evalOSHA(d)
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

  it('calculates classroom ventilation on the ASHRAE 62.1 code basis', () => {
    // classroom: pp=10, ps=0.12 — ASHRAE 62.1 Table 6.2.2.1, age 9 plus.
    // Was 15 cfm/person (EPA Tools for Schools guidance) until 2026-08, which
    // this table is not: scoring reports its value as the "ASHRAE 62.1
    // minimum", so a code-compliant classroom was reported non-compliant.
    // The EPA target is surfaced separately by buildingProfiles.
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
