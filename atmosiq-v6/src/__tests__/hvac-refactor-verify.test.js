import { describe, it, expect } from 'vitest'
import { scoreZone, compositeScore, genRecs } from '../engines/scoring'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from '../engines/sufficiency'

// ── Sufficiency Engine — HVAC category ────────────────────────────────────

describe('HVAC sufficiency after refactor', () => {
  it('HVAC with zero fields → scorable, maxAwardable=0', () => {
    const r = evaluateCategorySufficiency('HVAC', {})
    expect(r.isInsufficient).toBe(false)       // never insufficient (minSufficiency=0)
    expect(r.reqSufficiency).toBe(1)            // no required fields → 1
    expect(r.sufficiency).toBe(0)               // 0 of 2 optional met
    expect(r.maxAwardable).toBe(0)              // round(0 * 20) = 0
    expect(r.missing).toHaveLength(0)           // nothing is "missing" (all optional)
  })

  it('HVAC with only hm=Unknown → sufficiency=1/2, maxAwardable=10', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Unknown' })
    expect(r.isInsufficient).toBe(false)
    expect(r.sufficiency).toBeCloseTo(1/2, 4)
    expect(r.maxAwardable).toBe(10)             // round(0.5 * 20) = 10
  })

  it('HVAC with only hm=Within 6 months → sufficiency=1/2, maxAwardable=10', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months' })
    expect(r.isInsufficient).toBe(false)
    expect(r.maxAwardable).toBe(10)
  })

  it('HVAC with hm + fc → sufficiency=1.0, maxAwardable=20 (full credit)', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months', fc: 'Clean' })
    expect(r.sufficiency).toBe(1)
    expect(r.maxAwardable).toBe(20)
  })

  it('gate5 fields (sa, dp, fm, od) do not affect HVAC sufficiency', () => {
    const withoutGate5 = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months' })
    const withGate5 = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months', sa: 'Normal', dp: 'Dry', fm: 'MERV 13', od: 'Open' })
    expect(withoutGate5.sufficiency).toBe(withGate5.sufficiency)
    expect(withoutGate5.maxAwardable).toBe(withGate5.maxAwardable)
  })

  it('non-HVAC categories still require their required fields', () => {
    expect(evaluateCategorySufficiency('Ventilation', {}).isInsufficient).toBe(true)
    expect(evaluateCategorySufficiency('Environment', {}).isInsufficient).toBe(true)
    expect(evaluateCategorySufficiency('Complaints', {}).isInsufficient).toBe(true)
  })
})

// ── Ventilation & Contaminants sufficiency — non-scoring fields removed ───

describe('Ventilation sufficiency', () => {
  it('bld_pressure does not affect sufficiency (not used by scoreVent)', () => {
    const without = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15' })
    const withBP = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15', bld_pressure: '0.02' })
    expect(without.sufficiency).toBe(withBP.sufficiency)
    expect(without.maxAwardable).toBe(withBP.maxAwardable)
  })

  it('co2 only → maxAwardable=6 (not 5 with old 5-field denominator)', () => {
    // co2 meets 1 of 2 required, reqSufficiency=0.5 → not insufficient
    // sufficiency = 1/4 = 0.25, maxAwardable = round(0.25 * 25) = 6
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500' })
    expect(r.isInsufficient).toBe(false)
    expect(r.maxAwardable).toBe(6)
  })

  it('co2 + cfm_person → maxAwardable=13 (2 of 4)', () => {
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15' })
    expect(r.maxAwardable).toBe(13)
  })

  it('all scoring fields → maxAwardable=25', () => {
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15', ach: '6', sa: 'Normal' })
    expect(r.sufficiency).toBe(1)
    expect(r.maxAwardable).toBe(25)
  })
})

describe('Contaminants sufficiency', () => {
  it('mi and od_smell do not affect sufficiency (not used by scoreCont)', () => {
    const without = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2' })
    const withExtra = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2', mi: 'None', od_smell: 'None' })
    expect(without.sufficiency).toBe(withExtra.sufficiency)
    expect(without.maxAwardable).toBe(withExtra.maxAwardable)
  })

  it('pm + co only → maxAwardable=10 (not 7 with old 7-field denominator)', () => {
    const r = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2' })
    expect(r.isInsufficient).toBe(false)
    // 2 req of 2 + 0 opt of 3 = 2/5 = 0.4, maxAwardable = round(0.4 * 25) = 10
    expect(r.maxAwardable).toBe(10)
  })

  it('pm + co + tv + hc + vd → maxAwardable=25 (full credit)', () => {
    const r = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2', tv: '100', hc: '0.01', vd: 'None' })
    expect(r.sufficiency).toBe(1)
    expect(r.maxAwardable).toBe(25)
  })
})

// ── scoreHVAC deductions and findings ─────────────────────────────────────

describe('scoreHVAC scoring paths', () => {
  // Helper: call scoreZone and extract HVAC category
  const hvac = (zone, bldg = {}) => {
    const r = scoreZone(zone, bldg)
    return { zone: r, cat: r.cats.find(c => c.l === 'HVAC') }
  }

  it('Within 6 months → no deduction, pass finding', () => {
    const { cat } = hvac({}, { hm: 'Within 6 months' })
    // Raw s=20. With sufficiency 1/2 → capped to 10
    expect(cat.r[0].t).toBe('HVAC maintenance current')
    expect(cat.r[0].sev).toBe('pass')
    expect(cat.adminGap).toBeFalsy()
    expect(cat.gate5).toBe(false)
  })

  it('6-12 months ago → -3 deduction, sev=low', () => {
    const { cat } = hvac({}, { hm: '6-12 months ago' })
    // Raw s = 20 - 3 = 17. Capped to min(17, 3) = 3
    expect(cat.r[0].t).toContain('6–12 months')
    expect(cat.r[0].sev).toBe('low')
    expect(cat.adminGap).toBeFalsy()
  })

  it('Over 12 months → -5 deduction, sev=medium', () => {
    const { cat } = hvac({}, { hm: 'Over 12 months' })
    // Raw s = 20 - 5 = 15. Capped to min(15, 3) = 3
    expect(cat.r[0].t).toContain('overdue')
    expect(cat.r[0].sev).toBe('medium')
    expect(cat.adminGap).toBeFalsy()
  })

  it('Unknown → no deduction, sev=info, adminGap=true', () => {
    const { cat, zone } = hvac({}, { hm: 'Unknown' })
    // Raw s = 20 (no deduction). Capped to min(20, 3) = 3
    const finding = cat.r.find(r => r.t.includes('Data Gap'))
    expect(finding).toBeDefined()
    expect(finding.sev).toBe('info')
    expect(cat.adminGap).toBe(true)
    expect(zone.hvacAdminGap).toBe(true)
  })

  it('No hm provided at all → no deduction, no adminGap', () => {
    const { cat } = hvac({}, {})
    expect(cat.adminGap).toBeFalsy()
    expect(cat.gate5).toBe(false)
  })

  // Physical deficiency tests
  it('No filter → gate5, -15 deduction, professional language', () => {
    const { cat } = hvac({}, { hm: 'Within 6 months', fm: 'No filter' })
    expect(cat.gate5).toBe(true)
    const finding = cat.r.find(r => r.t.includes('No filtration'))
    expect(finding.t).toContain('Major HVAC Deficiency')
    expect(finding.t).not.toContain('SYSTEM FAILURE')
    expect(finding.sev).toBe('critical')
  })

  it('No airflow → gate5, -20 deduction, professional language', () => {
    const { cat } = hvac({ sa: 'No airflow detected' }, { hm: 'Within 6 months' })
    expect(cat.gate5).toBe(true)
    const finding = cat.r.find(r => r.t.includes('No supply airflow'))
    expect(finding.t).toContain('Critical HVAC Condition Identified')
    expect(finding.t).not.toContain('SYSTEM FAILURE')
  })

  it('Drain pan standing water → gate5, professional language', () => {
    const { cat } = hvac({}, { hm: 'Within 6 months', dp: 'Standing water' })
    expect(cat.gate5).toBe(true)
    const finding = cat.r.find(r => r.t.includes('Drain pan'))
    expect(finding.t).toContain('Critical Moisture/Hygiene Deficiency')
    expect(finding.t).not.toContain('biological concern')
  })

  it('gate5 cap finding uses professional language', () => {
    const { cat } = hvac({ sa: 'No airflow detected' }, { hm: 'Within 6 months' })
    const capFinding = cat.r.find(r => r.t.includes('active physical deficiency caps'))
    expect(capFinding).toBeDefined()
    expect(capFinding.t).toContain('Critical HVAC Condition Identified')
    expect(capFinding.t).not.toContain('HVAC System Integrity Override')
  })

  it('no forbidden language in any HVAC finding text', () => {
    const scenarios = [
      hvac({}, { hm: 'Within 6 months', fm: 'No filter' }),
      hvac({ sa: 'No airflow detected' }, { hm: 'Within 6 months' }),
      hvac({}, { hm: 'Within 6 months', dp: 'Bio growth observed' }),
      hvac({}, { hm: 'Unknown' }),
      hvac({}, { hm: 'Over 12 months' }),
    ]
    const forbidden = ['SYSTEM FAILURE', 'SYNERGISTIC', 'TOXICITY', 'System Integrity Override']
    scenarios.forEach(({ cat }) => {
      cat.r.forEach(r => {
        forbidden.forEach(f => {
          expect(r.t).not.toContain(f)
        })
      })
    })
  })
})

// ── scoreZone integration ─────────────────────────────────────────────────

describe('scoreZone HVAC integration', () => {
  it('gate5 still caps zone total at 40', () => {
    const zone = { zn: 'Z1', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', sa: 'No airflow detected' }
    const bldg = { hm: 'Within 6 months', cx: 'No complaints' }
    const result = scoreZone(zone, bldg)
    expect(result.tot).toBeLessThanOrEqual(40)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.gate5).toBe(true)
  })

  it('adminGap reduces confidence from High to Medium', () => {
    // Provide enough data for all categories so confidence would be High
    const zone = { zn: 'Z1', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', cfm_person: '15', cx: 'No complaints' }
    const bldg = { hm: 'Unknown', fc: 'Clean', sa: 'Normal', dp: 'Dry', fm: 'MERV 13', od: 'Open' }
    const result = scoreZone(zone, bldg)
    // With adminGap, confidence should not be High
    expect(result.hvacAdminGap).toBe(true)
    // Confidence may be Medium due to adminGap or other caps
    expect(result.confidence).not.toBe('High')
  })

  it('synergistic override text uses professional language', () => {
    const zone = { zn: 'Z1', co: '55', hc: '1.0' }  // both exceed OSHA PEL
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const contCat = result.cats.find(c => c.l === 'Contaminants')
    const synFinding = contCat.r.find(r => r.t.includes('Multiple Contaminant Exceedance'))
    expect(synFinding).toBeDefined()
    expect(synFinding.t).not.toContain('SYNERGISTIC')
    expect(synFinding.t).not.toContain('TOXICITY')
    expect(synFinding.t).toContain('Immediate Follow-Up Sampling Required')
    // synergistic override caps at 39
    expect(result.tot).toBeLessThanOrEqual(39)
  })

  it('non-HVAC categories are NOT affected by refactor', () => {
    // Ventilation
    const zone = { zn: 'Z1', co2: '1600', tf: '72', rh: '45', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const vent = result.cats.find(c => c.l === 'Ventilation')
    expect(vent.s).toBe(0)
    expect(vent.r[0].sev).toBe('critical')

    // Complaints
    const compCat = result.cats.find(c => c.l === 'Complaints')
    expect(compCat.r[0].t).toBe('No complaints')

    // Environment
    const envCat = result.cats.find(c => c.l === 'Environment')
    expect(envCat.s).not.toBeNull()
  })

  it('missing HVAC data is excluded from total (DATA_GAP), not scored as 0/20', () => {
    const zone = { zn: 'Z1', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', cx: 'No complaints' }
    const bldg = {}  // no HVAC data
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.s).toBeNull()
    expect(hvac.status).toBe('DATA_GAP')
    // HVAC excluded from available max (80, not 100)
    expect(result.availableMax).toBe(80)
    // Score is normalized up from 4 scorable categories, not dragged down by 0/20 HVAC
    expect(result.normalizedFrom).not.toBeNull()
    expect(result.insufficientCats).toContain('HVAC')
  })

  it('zone with full data + missing HVAC normalizes correctly', () => {
    // Provide enough data for non-HVAC categories to score well
    const zone = { zn: 'Z1', cfm_person: '15', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', tv: '100', cx: 'No complaints' }
    const bldg = {}  // no HVAC data
    const result = scoreZone(zone, bldg)
    // With high-sufficiency non-HVAC data + HVAC excluded → should normalize to reasonable score
    expect(result.risk).not.toBe('Critical')
    expect(result.availableMax).toBe(80) // HVAC excluded
  })

  it('hm=Unknown scores HVAC at 10/20 (not 3/20), total stays Moderate', () => {
    // User's live scenario: good readings everywhere, HVAC maintenance = Unknown
    const zone = { zn: 'Daycare', co2: '500', tf: '73', rh: '42', pm: '4', co: '1', cx: 'No complaints' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    // With 2-field sufficiency model: hm=1/2 → maxAwardable=10, raw=20, capped to 10
    expect(hvac.s).toBe(10)
    expect(hvac.adminGap).toBe(true)
    // Total should be reasonable, not dragged down to High Risk
    expect(result.risk).not.toBe('Critical')
  })

  it('hm + fc gives full HVAC credit when no deficiencies', () => {
    const zone = { zn: 'Z1', co2: '500', tf: '73', rh: '42', pm: '4', co: '1', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    // hm + fc = 2/2 sufficiency → maxAwardable=20, no deductions → score=20
    expect(hvac.s).toBe(20)
  })
})

// ── genRecs — recommendation generation ───────────────────────────────────

describe('genRecs with refactored HVAC', () => {
  it('No filtration finding still triggers immediate recommendation', () => {
    const zoneScores = [{
      zoneName: 'Z1',
      cats: [{
        l: 'HVAC',
        r: [{ t: 'No filtration installed — Major HVAC Deficiency', sev: 'critical' }],
      }],
    }]
    const recs = genRecs(zoneScores, {})
    expect(recs.imm.some(r => r.includes('no filtration'))).toBe(true)
    // Should say "immediate" not "emergency"
    expect(recs.imm.some(r => r.includes('immediate'))).toBe(true)
    expect(recs.imm.every(r => !r.includes('emergency'))).toBe(true)
  })

  it('No airflow finding still triggers immediate recommendation', () => {
    const zoneScores = [{
      zoneName: 'Z1',
      cats: [{
        l: 'HVAC',
        r: [{ t: 'No supply airflow detected — Critical HVAC Condition Identified', sev: 'critical' }],
      }],
    }]
    const recs = genRecs(zoneScores, {})
    expect(recs.imm.some(r => r.includes('airflow'))).toBe(true)
  })

  it('Drain pan finding still triggers immediate recommendation', () => {
    const zoneScores = [{
      zoneName: 'Z1',
      cats: [{
        l: 'HVAC',
        r: [{ t: 'Drain pan: standing water — Critical Moisture/Hygiene Deficiency', sev: 'critical' }],
      }],
    }]
    const recs = genRecs(zoneScores, {})
    expect(recs.imm.some(r => r.includes('Drain pan') || r.includes('drain pan'))).toBe(true)
  })

  it('Over 12 months (sev=medium) still generates HVAC inspection recommendation', () => {
    const zoneScores = [{
      zoneName: 'Z1',
      cats: [{
        l: 'HVAC',
        r: [{ t: 'HVAC maintenance overdue (>12 months)', sev: 'medium' }],
      }],
    }]
    const recs = genRecs(zoneScores, {})
    // Must still generate either the direct "Schedule comprehensive HVAC inspection"
    // OR the data-gap driven "Conduct comprehensive HVAC system assessment"
    const hasHVACRec = recs.eng.some(r =>
      r.includes('HVAC') && (r.includes('inspection') || r.includes('assessment'))
    )
    expect(hasHVACRec).toBe(true)
  })

  it('Unknown maintenance still generates admin recommendation', () => {
    const recs = genRecs([{
      zoneName: 'Z1',
      cats: [{ l: 'HVAC', r: [{ t: 'HVAC maintenance history unknown — Data Gap', sev: 'info' }] }],
    }], { hm: 'Unknown' })
    expect(recs.adm.some(r => r.includes('HVAC maintenance') || r.includes('preventive'))).toBe(true)
  })

  it('data-gap rec fires when HVAC category is capped with low sufficiency', () => {
    const zoneScores = [{
      zoneName: 'Z1',
      cats: [{
        l: 'HVAC',
        r: [{ t: 'HVAC system conditions acceptable', sev: 'pass' }],
        capped: true,
        sufficiency: { sufficiency: 0.17 },  // simulates low sufficiency
      }],
    }]
    const recs = genRecs(zoneScores, {})
    expect(recs.eng.some(r => r.includes('HVAC system assessment'))).toBe(true)
  })
})

// ── compositeScore is completely unaffected ────────────────────────────────

describe('compositeScore unchanged', () => {
  it('still returns null for empty array', () => {
    expect(compositeScore([])).toBeNull()
  })

  it('still uses weighted mean when no Critical zones', () => {
    const scores = [{ tot: 90 }, { tot: 80 }]
    const result = compositeScore(scores)
    expect(result.logic).toBe('weighted-mean-of-zones')
    expect(result.avg).toBe(85)
  })

  it('still uses worst-zone-override when a zone is Critical', () => {
    const scores = [{ tot: 90 }, { tot: 30 }]
    const result = compositeScore(scores)
    expect(result.logic).toBe('worst-zone-override')
    expect(result.tot).toBe(30)
  })
})
