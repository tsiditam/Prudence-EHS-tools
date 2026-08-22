/**
 * The sufficiency denominators, and the engine behaviour that rests on
 * them.
 *
 * Written as `maxAwardable` assertions — `round(sufficiency * maxPoints)`
 * — because points were how sufficiency was observable. The points are
 * gone; the DENOMINATOR is the property this file exists to protect (2
 * fields for HVAC, 4 for Ventilation, 5 for Contaminants), and it is now
 * asserted on `sufficiency` directly, which is both the real quantity
 * and free of the rounding the old numbers had to account for.
 */

import { describe, it, expect } from 'vitest'
import { scoreZone, summarizeAssessment, genRecs } from '../engines/scoring'
import { evaluateCategorySufficiency, evaluateAllSufficiency } from '../engines/sufficiency'

// Engine v2.8.0 — coerce action objects | legacy strings to plain text.
const txt = (r) => typeof r === 'string' ? r : (r?.text || '')

// ── Sufficiency Engine — HVAC category ────────────────────────────────────

describe('HVAC sufficiency after refactor', () => {
  it('HVAC with zero fields → assessable, sufficiency=0', () => {
    const r = evaluateCategorySufficiency('HVAC', {})
    expect(r.isInsufficient).toBe(false)       // never insufficient (minSufficiency=0)
    expect(r.reqSufficiency).toBe(1)            // no required fields → 1
    expect(r.sufficiency).toBe(0)               // 0 of 2 optional met
    expect(r.missing).toHaveLength(0)           // nothing is "missing" (all optional)
  })

  it('HVAC with only hm=Unknown → sufficiency=1/2', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Unknown' })
    expect(r.isInsufficient).toBe(false)
    expect(r.sufficiency).toBeCloseTo(1/2, 4)
  })

  it('HVAC with only hm=Within 6 months → sufficiency=1/2', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months' })
    expect(r.isInsufficient).toBe(false)
    expect(r.sufficiency).toBeCloseTo(1 / 2, 4)
  })

  it('HVAC with hm + fc → sufficiency=1.0 (complete record)', () => {
    const r = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months', fc: 'Clean' })
    expect(r.sufficiency).toBe(1)
  })

  it('gate5 fields (sa, dp, fm, od) do not affect HVAC sufficiency', () => {
    const withoutGate5 = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months' })
    const withGate5 = evaluateCategorySufficiency('HVAC', { hm: 'Within 6 months', sa: 'Normal', dp: 'Dry', fm: 'MERV 13', od: 'Open' })
    expect(withoutGate5.sufficiency).toBe(withGate5.sufficiency)
    expect(withoutGate5.sufficiency).toBe(withGate5.sufficiency)
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
    expect(without.sufficiency).toBe(withBP.sufficiency)
  })

  it('co2 only → sufficiency=1/4 (not 1/5 with the old denominator)', () => {
    // co2 meets 1 of 2 required, reqSufficiency=0.5 → not insufficient
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500' })
    expect(r.isInsufficient).toBe(false)
    expect(r.sufficiency).toBeCloseTo(1 / 4, 4)
  })

  it('co2 + cfm_person → sufficiency=2/4', () => {
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15' })
    expect(r.sufficiency).toBeCloseTo(2 / 4, 4)
  })

  it('all ventilation fields → sufficiency=1', () => {
    const r = evaluateCategorySufficiency('Ventilation', { co2: '500', cfm_person: '15', ach: '6', sa: 'Normal' })
    expect(r.sufficiency).toBe(1)
    expect(r.sufficiency).toBe(1)
  })
})

describe('Contaminants sufficiency', () => {
  it('mi and od_smell do not affect sufficiency (not used by scoreCont)', () => {
    const without = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2' })
    const withExtra = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2', mi: 'None', od_smell: 'None' })
    expect(without.sufficiency).toBe(withExtra.sufficiency)
    expect(without.sufficiency).toBe(withExtra.sufficiency)
  })

  it('pm + co only → sufficiency=2/5 (not 2/7 with the old denominator)', () => {
    const r = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2' })
    expect(r.isInsufficient).toBe(false)
    // 2 required of 2, 0 optional of 3 → 2/5
    expect(r.sufficiency).toBeCloseTo(2 / 5, 4)
  })

  it('pm + co + tv + hc + vd → sufficiency=1 (complete record)', () => {
    const r = evaluateCategorySufficiency('Contaminants', { pm: '5', co: '2', tv: '100', hc: '0.01', vd: 'None' })
    expect(r.sufficiency).toBe(1)
    expect(r.sufficiency).toBe(1)
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

  it('the gate5 finding uses professional language and describes the condition', () => {
    const { cat } = hvac({ sa: 'No airflow detected' }, { hm: 'Within 6 months' })
    // Two findings mention the condition: the airflow observation that
    // tripped it, and the gate's own summary. This is the summary.
    const gateFinding = cat.r.find(r => r.t.startsWith('Critical HVAC Condition Identified:'))
    expect(gateFinding).toBeDefined()
    // The sentence used to end "…caps category at 30%", describing what
    // the condition did to the score rather than what it is.
    expect(gateFinding.t).not.toMatch(/caps category|30%/)
    expect(gateFinding.t).toContain('active physical deficiency')
    expect(gateFinding.t).not.toContain('HVAC System Integrity Override')
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
  it('gate5 fires and states itself as a critical finding', () => {
    const zone = { zn: 'Z1', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', sa: 'No airflow detected' }
    const bldg = { hm: 'Within 6 months', cx: 'No complaints' }
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.gate5).toBe(true)
    // Was `result.tot <= 40` — the cap. The condition the cap expressed
    // is the critical finding itself, which is what a reader acts on.
    expect(hvac.r.some(r => r.sev === 'critical')).toBe(true)
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
    expect(synFinding.sev).toBe('critical')
    expect(contCat.synergistic).toBe(true)
  })

  it('non-HVAC categories are NOT affected by refactor', () => {
    // Ventilation
    const zone = { zn: 'Z1', co2: '1600', tf: '72', rh: '45', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months' }
    const result = scoreZone(zone, bldg)
    const vent = result.cats.find(c => c.l === 'Ventilation')
    // CO2 is capped at `high` by its criterion class — see constants/criteria.js.
    expect(vent.r[0].sev).toBe('high')

    // Complaints
    const compCat = result.cats.find(c => c.l === 'Complaints')
    expect(compCat.r[0].t).toBe('No complaints')

    // Environment
    const envCat = result.cats.find(c => c.l === 'Environment')
    expect(envCat.status).toBeUndefined()
  })

  it('missing HVAC data is reported as a DATA_GAP, not as a deficiency', () => {
    const zone = { zn: 'Z1', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', cx: 'No complaints' }
    const bldg = {}  // no HVAC data
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.status).toBe('DATA_GAP')
    expect(result.insufficientCats).toContain('HVAC')
    expect(result.assessedCats).not.toContain('HVAC')
    // Was also `availableMax === 80` and `normalizedFrom !== null` — the
    // normalization that stopped an unassessed category from dragging the
    // score down. With no score, an unassessed category is simply named
    // as unassessed, which is what the normalization was protecting.
    expect(hvac.r.some(r => r.sev === 'critical' || r.sev === 'high')).toBe(false)
  })

  it('a missing HVAC record does not make the rest of the zone look worse', () => {
    const zone = { zn: 'Z1', cfm_person: '15', co2: '450', tf: '72', rh: '45', pm: '5', co: '2', tv: '100', cx: 'No complaints' }
    const bldg = {}  // no HVAC data
    const result = scoreZone(zone, bldg)
    expect(result.insufficientCats).toEqual(['HVAC'])
    expect(result.assessedCats.length).toBe(4)
    // No finding anywhere claims a deficiency the data cannot support.
    const flagged = result.cats.flatMap(c => c.r).filter(r => r.sev === 'critical' || r.sev === 'high')
    expect(flagged).toEqual([])
  })

  it('hm=Unknown is an administrative gap, not a physical deficiency', () => {
    // User's live scenario: good readings everywhere, HVAC maintenance = Unknown
    const zone = { zn: 'Daycare', co2: '500', tf: '73', rh: '42', pm: '4', co: '1', cx: 'No complaints' }
    const bldg = { hm: 'Unknown' }
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.adminGap).toBe(true)
    expect(hvac.gate5).toBeFalsy()
    // The distinction the old 10/20-not-3/20 assertion was drawing: an
    // unknown maintenance history reduces confidence, it does not assert
    // a physical problem.
    expect(hvac.r.some(r => r.sev === 'critical' || r.sev === 'high')).toBe(false)
    expect(hvac.r.some(r => r.t.includes('Data Gap'))).toBe(true)
  })

  it('hm + fc records a complete HVAC picture with nothing flagged', () => {
    const zone = { zn: 'Z1', co2: '500', tf: '73', rh: '42', pm: '4', co: '1', cx: 'No complaints' }
    const bldg = { hm: 'Within 6 months', fc: 'Clean' }
    const result = scoreZone(zone, bldg)
    const hvac = result.cats.find(c => c.l === 'HVAC')
    expect(hvac.sufficiency.sufficiency).toBe(1)
    expect(hvac.adminGap).toBeFalsy()
    expect(hvac.r.every(r => r.sev === 'pass' || r.sev === 'info')).toBe(true)
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
    // Engine v2.8.0 — recs are RecommendationAction objects with
    // .text. txt() coerces both legacy strings and new objects.
    expect(recs.imm.some(r => txt(r).includes('no filtration'))).toBe(true)
    // Should say "immediate" not "emergency"
    expect(recs.imm.some(r => txt(r).includes('immediate'))).toBe(true)
    expect(recs.imm.every(r => !txt(r).includes('emergency'))).toBe(true)
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
    expect(recs.imm.some(r => txt(r).includes('airflow'))).toBe(true)
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
    expect(recs.imm.some(r => txt(r).includes('Drain pan') || txt(r).includes('drain pan'))).toBe(true)
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
      txt(r).includes('HVAC') && (txt(r).includes('inspection') || txt(r).includes('assessment'))
    )
    expect(hasHVACRec).toBe(true)
  })

  it('Unknown maintenance still generates admin recommendation', () => {
    const recs = genRecs([{
      zoneName: 'Z1',
      cats: [{ l: 'HVAC', r: [{ t: 'HVAC maintenance history unknown — Data Gap', sev: 'info' }] }],
    }], { hm: 'Unknown' })
    expect(recs.adm.some(r => txt(r).includes('HVAC maintenance') || txt(r).includes('preventive'))).toBe(true)
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
    expect(recs.eng.some(r => txt(r).includes('HVAC system assessment'))).toBe(true)
  })
})

// ── summarizeAssessment is unaffected by the HVAC sufficiency model ────────

describe('summarizeAssessment unchanged', () => {
  const zone = (findings, extra = {}) => ({
    cats: [{ l: 'HVAC', r: findings }],
    confidence: 'High', partialScore: false, insufficientCats: [], ...extra,
  })

  it('still returns null for an empty array', () => {
    expect(summarizeAssessment([])).toBeNull()
  })

  it('counts across zones regardless of how HVAC sufficiency resolved', () => {
    const result = summarizeAssessment([
      zone([{ t: 'a', sev: 'high' }]),
      zone([], { insufficientCats: ['HVAC'], partialScore: true }),
    ])
    expect(result.count).toBe(2)
    expect(result.findings.total).toBe(1)
    expect(result.partialData).toBe(true)
  })
})
