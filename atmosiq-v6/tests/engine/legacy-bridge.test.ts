import { describe, it, expect } from 'vitest'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { classifyCondition } from '../../src/engine/bridge/classify'
import { renderClientReport } from '../../src/engine/report/client'
import { renderInternalReport } from '../../src/engine/report/internal'
import { assertNoInternalFields } from '../../src/engine/report/validators'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Test Facility',
  siteAddress: '123 Main St',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH', 'CSP'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC' },
  // v2.2 §2/§3 — required project number and transmittal recipient.
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: {
    fullName: 'Test Recipient',
    organization: 'Test Client Org',
  },
}

const META_NO_CIH: AssessmentMeta = {
  ...META,
  preparingAssessor: { fullName: 'J. Doe', credentials: ['OSHA 30-Hour'] },
}

// ── Classifier Smoke Tests ──

describe('classifyCondition — Ventilation', () => {
  it('CO₂-only zone with elevated reading classifies as ventilation_inadequate_outdoor_air', () => {
    const c = classifyCondition(
      { t: 'CO₂ 1180 ppm — ventilation rate appears inadequate', sev: 'high' },
      'Ventilation',
      { co2: '1180' },
    )
    expect(c).toBe('ventilation_inadequate_outdoor_air')
  })

  it('CO₂-only zone within range classifies as ventilation_co2_only', () => {
    const c = classifyCondition(
      { t: 'CO₂ 850 ppm — within screening range for ventilation adequacy', sev: 'pass' },
      'Ventilation',
      { co2: '850' },
    )
    expect(c).toBe('ventilation_co2_only')
  })

  it('observational-only ventilation classifies as ventilation_observational_only', () => {
    const c = classifyCondition(
      { t: 'No airflow data — minor indicators observed', sev: 'low' },
      'Ventilation',
      {},
    )
    expect(c).toBe('ventilation_observational_only')
  })
})

describe('classifyCondition — Contaminants', () => {
  it('CO above OSHA PEL → co_above_pel_documented', () => {
    const c = classifyCondition(
      { t: 'CO 60 ppm — EXCEEDS OSHA PEL', sev: 'critical', std: 'OSHA' },
      'Contaminants',
      { co: '60' },
    )
    expect(c).toBe('co_above_pel_documented')
  })

  it('CO above NIOSH only → co_screening_elevated', () => {
    const c = classifyCondition(
      { t: 'CO 30 — exceeds NIOSH REL', sev: 'high', std: 'NIOSH' },
      'Contaminants',
      { co: '30' },
    )
    expect(c).toBe('co_screening_elevated')
  })

  it('formaldehyde at NIOSH REL → hcho_screening_elevated', () => {
    const c = classifyCondition(
      { t: 'Formaldehyde 0.022 ppm — exceeds NIOSH REL Ceiling', sev: 'medium' },
      'Contaminants',
      { hc: '0.022' },
    )
    expect(c).toBe('hcho_screening_elevated')
  })

  it('TVOC elevated → tvoc_screening_elevated', () => {
    const c = classifyCondition(
      { t: 'TVOCs 680 µg/m³ — elevated', sev: 'medium' },
      'Contaminants',
      { tv: '680' },
    )
    expect(c).toBe('tvoc_screening_elevated')
  })

  it('PM2.5 above NAAQS → pm_above_naaqs_documented', () => {
    const c = classifyCondition(
      { t: 'PM2.5 38 µg/m³ — exceeds EPA NAAQS', sev: 'high', std: 'EPA NAAQS' },
      'Contaminants',
      { pm: '38' },
    )
    expect(c).toBe('pm_above_naaqs_documented')
  })

  it('PM2.5 indoor/outdoor ratio elevated → pm_indoor_amplification_screening', () => {
    const c = classifyCondition(
      { t: 'Indoor/outdoor PM2.5 ratio: 2.3 — significant indoor source', sev: 'medium' },
      'Contaminants',
      { pm: '28', pmo: '12' },
    )
    expect(c).toBe('pm_indoor_amplification_screening')
  })

  it('mold (small area) → apparent_microbial_growth', () => {
    const c = classifyCondition(
      { t: 'Small area mold — IICRC S520 Condition 1', sev: 'medium', std: 'IICRC S520' },
      'Contaminants',
      { mi: 'Small (< 10 sq ft)' },
    )
    expect(c).toBe('apparent_microbial_growth')
  })

  it('moderate odor → objectionable_odor', () => {
    const c = classifyCondition(
      { t: 'Moderate odor', sev: 'medium' },
      'Contaminants',
      { op: 'Moderate persistent' },
    )
    expect(c).toBe('objectionable_odor')
  })

  it('data hall ISO Class 8 screening → particle_screening_only', () => {
    const c = classifyCondition(
      { t: 'Particle conditions observed during walkthrough may indicate elevated particulate levels. ISO Class cannot be determined…', sev: 'medium', std: 'ISO 14644-1:2015 (screening)' },
      'Contaminants',
      { zone_subtype: 'data_hall', iso_class: 'ISO Class 8' },
    )
    expect(c).toBe('particle_screening_only')
  })

  it('data hall gaseous corrosion screening → possible_corrosive_environment', () => {
    const c = classifyCondition(
      { t: 'Screening indicators consistent with elevated risk of G2 or worse environment per ANSI/ISA 71.04-2013', sev: 'medium', std: 'ANSI/ISA 71.04-2013 (screening)' },
      'Contaminants',
      { zone_subtype: 'data_hall' },
    )
    expect(c).toBe('possible_corrosive_environment')
  })
})

describe('classifyCondition — HVAC', () => {
  it('drain pan standing water → hvac_drain_pan_microbial_reservoir', () => {
    const c = classifyCondition(
      { t: 'Drain pan: standing water — Critical Moisture/Hygiene Deficiency', sev: 'critical', std: 'ASHRAE 188' },
      'HVAC',
      { dp: 'Standing water' },
    )
    expect(c).toBe('hvac_drain_pan_microbial_reservoir')
  })

  it('heavily loaded filter → hvac_filter_loaded', () => {
    const c = classifyCondition(
      { t: 'Filter condition: heavily loaded — degraded filtration performance', sev: 'high' },
      'HVAC',
      { fc: 'Heavily loaded' },
    )
    expect(c).toBe('hvac_filter_loaded')
  })

  it('OA damper closed → hvac_outdoor_air_damper_compromised', () => {
    const c = classifyCondition(
      { t: 'Outdoor air damper closed / minimum', sev: 'high' },
      'HVAC',
      { od: 'Closed / minimum' },
    )
    expect(c).toBe('hvac_outdoor_air_damper_compromised')
  })

  it('maintenance overdue >12mo → hvac_maintenance_overdue', () => {
    const c = classifyCondition(
      { t: 'HVAC maintenance overdue (>12 months)', sev: 'medium' },
      'HVAC',
      { hm: 'Over 12 months' },
    )
    expect(c).toBe('hvac_maintenance_overdue')
  })
})

describe('classifyCondition — Complaints', () => {
  it('symptoms resolve away from building', () => {
    const c = classifyCondition(
      { t: 'Symptoms resolve away from building', sev: 'high' },
      'Complaints',
      { sr: 'Yes — clear pattern' },
    )
    expect(c).toBe('symptoms_resolve_away_from_building')
  })

  it('zone clustering → occupant_cluster_anecdotal', () => {
    const c = classifyCondition(
      { t: 'Symptom clustering in this zone', sev: 'medium' },
      'Complaints',
      { cc: 'Yes — this zone' },
    )
    expect(c).toBe('occupant_cluster_anecdotal')
  })

  it('generic symptoms → occupant_symptoms_anecdotal', () => {
    const c = classifyCondition(
      { t: '3–5 occupants reporting symptoms', sev: 'high' },
      'Complaints',
      {},
    )
    expect(c).toBe('occupant_symptoms_anecdotal')
  })
})

describe('classifyCondition — Environment', () => {
  it('water damage active leak → active_or_historical_water_damage', () => {
    const c = classifyCondition(
      { t: 'Active water intrusion', sev: 'high' },
      'Environment',
      { wd: 'Active leak' },
    )
    expect(c).toBe('active_or_historical_water_damage')
  })

  it('historical water staining → active_or_historical_water_damage', () => {
    const c = classifyCondition(
      { t: 'Historical water staining', sev: 'low' },
      'Environment',
      { wd: 'Old staining' },
    )
    expect(c).toBe('active_or_historical_water_damage')
  })

  it('temperature outside ASHRAE 55 → temperature_outside_comfort', () => {
    const c = classifyCondition(
      { t: 'Temperature 77°F — outside 68–75°F range (per ASHRAE 55)', sev: 'high', std: 'ASHRAE 55' },
      'Environment',
      { tf: '77' },
    )
    expect(c).toBe('temperature_outside_comfort')
  })

  it('high RH (≥65%) → humidity_microbial_amplification_range', () => {
    const c = classifyCondition(
      { t: 'RH 68% — outside recommended range', sev: 'high' },
      'Environment',
      { rh: '68' },
    )
    expect(c).toBe('humidity_microbial_amplification_range')
  })

  it('low RH → humidity_below_comfort_lower_bound', () => {
    const c = classifyCondition(
      { t: 'RH 18% — outside recommended range', sev: 'medium' },
      'Environment',
      { rh: '18' },
    )
    expect(c).toBe('humidity_below_comfort_lower_bound')
  })
})

// ── Bridge — Status / Confidence / Tier Mapping ──

describe('legacyToAssessmentScore — status and confidence mapping', () => {
  it('legacy "Critical" risk → v2.1 Tier "Critical"', () => {
    const lz = scoreZone({ zn: 'Z1', su: 'office', co2: '2500' }, {}) // way above threshold
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ co2: '2500' } as any], { meta: META })
    expect(score.zones[0].tier).toBe('Critical')
    expect(score.siteTier).toBe('Critical')
  })

  it('insufficient zone confidence maps to insufficient_data', () => {
    const lz = scoreZone({ zn: 'Z1', su: 'office' }, {}) // no data at all
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{} as any], { meta: META })
    expect(score.confidenceBand).toBe('insufficient_data')
  })

  it('SUPPRESSED legacy category → v2.1 status "suppressed"', () => {
    // data_hall sets Complaints weight to 0 → suppressed
    const lz = scoreZone({ zn: 'DC1', su: 'office', zone_subtype: 'data_hall', co2: '600' }, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ zone_subtype: 'data_hall' } as any], { meta: META })
    const complaints = score.zones[0].categories.find(c => c.category === 'Complaints')
    expect(complaints?.status).toBe('suppressed')
  })
})

// ── Bridge — Finding Shape (29 fields) ──

describe('legacyToAssessmentScore — Finding shape', () => {
  it('every Finding has all 29 v2.1 domain fields populated', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '1180', co: '2', tv: '680', hc: '0.022', tf: '77', rh: '62', wd: 'Old staining', mi: 'Small (< 10 sq ft)', cx: 'Yes — complaints reported', ac: '3-5', sy: ['Headache'], cc: 'Yes — this zone', sr: 'Yes — clear pattern', op: 'Moderate persistent', dp: 'Standing water', fc: 'Heavily loaded', hm: 'Over 12 months', od: 'Closed / minimum', sa: 'Weak / reduced' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    expect(findings.length).toBeGreaterThan(0)

    for (const f of findings) {
      expect(f.id).toMatch(/^F-\d{4}$/)
      expect(typeof f.category).toBe('string')
      // v2.2 §1b — building-scoped findings (HVAC) carry zoneId=null;
      // zone-scoped findings carry a Z-### ID. Both shapes are valid.
      expect(['zone', 'building', 'hvac_system']).toContain(f.scope)
      if (f.scope === 'zone') {
        expect(f.zoneId).toMatch(/^Z-\d{3}$/)
      } else {
        expect(f.zoneId).toBeNull()
      }
      expect(typeof f.severityInternal).toBe('string')
      expect(typeof f.titleInternal).toBe('string')
      expect(typeof f.observationInternal).toBe('string')
      expect(typeof f.deductionInternal).toBe('number')
      expect(typeof f.conditionType).toBe('string')
      expect(typeof f.confidenceTier).toBe('string')
      expect(typeof f.definitiveConclusionAllowed).toBe('boolean')
      expect(typeof f.causationSupported).toBe('boolean')
      expect(typeof f.regulatoryConclusionAllowed).toBe('boolean')
      expect(typeof f.approvedNarrativeIntent).toBe('string')
      expect(f.approvedNarrativeIntent.length).toBeGreaterThan(0)
      expect(f.evidenceBasis).toBeDefined()
      expect(typeof f.evidenceBasis.kind).toBe('string')
      expect(typeof f.evidenceBasis.rationale).toBe('string')
      expect(Array.isArray(f.evidenceBasis.citationRefs)).toBe(true)
      expect(f.samplingAdequacy).toBeDefined()
      expect(typeof f.samplingAdequacy.forConclusion).toBe('boolean')
      expect(typeof f.samplingAdequacy.forScreening).toBe('boolean')
      expect(typeof f.samplingAdequacy.forHypothesis).toBe('boolean')
      expect(f.instrumentAccuracyConsidered).toBeDefined()
      expect(typeof f.instrumentAccuracyConsidered.checked).toBe('boolean')
      expect(typeof f.instrumentAccuracyConsidered.withinNoiseFloor).toBe('boolean')
      expect(Array.isArray(f.limitations)).toBe(true)
      expect(Array.isArray(f.recommendedActions)).toBe(true)
      expect(typeof f.thresholdSource).toBe('string')
    }
  })

  it('CO above OSHA PEL — Finding has regulatoryConclusionAllowed=false (screening-grade evidence)', () => {
    const zone = { zn: 'Z1', su: 'office', co: '60' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const coFinding = score.zones[0].categories
      .find(c => c.category === 'Contaminants')!.findings
      .find(f => f.conditionType === 'co_above_pel_documented')
    expect(coFinding).toBeDefined()
    // Bridge does not promote walkthrough screening to documented_8hr_twa, so
    // regulatory language must remain blocked.
    expect(coFinding!.regulatoryConclusionAllowed).toBe(false)
    expect(coFinding!.definitiveConclusionAllowed).toBe(false)
  })
})

// ── Bridge — Defensibility Flags ──

describe('legacyToAssessmentScore — defensibility flags', () => {
  it('all flags true with calibrated instrument and CIH assessor', () => {
    const lz = scoreZone({ zn: 'Z1', su: 'office', co2: '900' }, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ co2: '900' } as any], {
      meta: META,
      presurvey: { ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec' } as any,
    })
    expect(score.defensibilityFlags.hasInstrumentData).toBe(true)
    expect(score.defensibilityFlags.hasCalibrationRecords).toBe(true)
    expect(score.defensibilityFlags.hasSufficientZoneCoverage).toBe(true)
    expect(score.defensibilityFlags.hasQualifiedAssessor).toBe(true)
    expect(score.defensibilityFlags.overallDefensible).toBe(true)
  })

  it('non-CIH/CSP/PE assessor → hasQualifiedAssessor=false', () => {
    const lz = scoreZone({ zn: 'Z1', su: 'office', co2: '900' }, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{ co2: '900' } as any], { meta: META_NO_CIH })
    expect(score.defensibilityFlags.hasQualifiedAssessor).toBe(false)
    expect(score.defensibilityFlags.overallDefensible).toBe(false)
  })

  it('no measurements → hasInstrumentData=false', () => {
    const lz = scoreZone({ zn: 'Z1', su: 'office' }, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [{} as any], { meta: META })
    expect(score.defensibilityFlags.hasInstrumentData).toBe(false)
  })
})

// ── End-to-End: Bridge → Renderers ──

describe('legacyToAssessmentScore — round-trip through renderers', () => {
  function buildDemoScore() {
    const lzs = DEMO_ZONES.map((z: any) => scoreZone(z, DEMO_BUILDING))
    const cs = compositeScore(lzs)
    return legacyToAssessmentScore(lzs as any, cs as any, DEMO_ZONES as any, {
      meta: META,
      presurvey: DEMO_PRESURVEY as any,
      building: DEMO_BUILDING as any,
    })
  }

  it('bridged score renders as InternalReport with severityInternal preserved', () => {
    const score = buildDemoScore()
    const internal = renderInternalReport(score)
    const allFindings = internal.zones.flatMap(z => z.categories.flatMap(c => c.findings))
    expect(allFindings.length).toBeGreaterThan(0)
    const severities = new Set(allFindings.map(f => f.severityInternal))
    expect(severities.size).toBeGreaterThan(0)
  })

  it('bridged score renders as ClientReport with no internal fields', () => {
    const score = buildDemoScore()
    const result = renderClientReport(score)
    if (result.kind !== 'report') {
      // If the demo data triggers refusal-to-issue, the memo path is still defensibility-correct.
      expect(result.kind).toBe('pre_assessment_memo')
      return
    }
    expect(() => assertNoInternalFields(result.report)).not.toThrow()
    const json = JSON.stringify(result.report)
    expect(json).not.toContain('severityInternal')
    expect(json).not.toContain('deductionInternal')
    expect(json).not.toContain('rawScore')
  })

  it('bridged score has zone professionalOpinion set', () => {
    const score = buildDemoScore()
    for (const z of score.zones) {
      expect(z.professionalOpinion).toMatch(/^(no_significant_concerns_identified|conditions_warrant_)/)
    }
  })

  it('site siteScore matches legacy composite tot', () => {
    const lzs = DEMO_ZONES.map((z: any) => scoreZone(z, DEMO_BUILDING))
    const cs = compositeScore(lzs)
    const score = legacyToAssessmentScore(lzs as any, cs as any, DEMO_ZONES as any, { meta: META })
    expect(score.siteScore).toBe((cs as any).tot)
  })

  it('prioritization queue ordered by deduction × confidence', () => {
    const score = buildDemoScore()
    const internal = renderInternalReport(score)
    const queue = internal.prioritizationQueue
    if (queue.length >= 2) {
      for (let i = 1; i < queue.length; i++) {
        expect(queue[i - 1].priority).toBeGreaterThanOrEqual(queue[i].priority)
      }
    }
  })
})

// ── Edge Cases ──

describe('legacyToAssessmentScore — edge cases', () => {
  it('empty zone array → site siteScore null and zero zones', () => {
    const score = legacyToAssessmentScore([], null, [], { meta: META })
    expect(score.siteScore).toBeNull()
    expect(score.zones.length).toBe(0)
  })

  it('zone with all-pass findings → non-empty findings, severities all pass/info', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '650', co2o: '420', tf: '73', rh: '45', pm: '8' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const findings = score.zones[0].categories.flatMap(c => c.findings)
    expect(findings.length).toBeGreaterThan(0)
    for (const f of findings) {
      expect(['pass', 'info']).toContain(f.severityInternal)
    }
  })

  it('all-pass zone yields professionalOpinion = no_significant_concerns_identified', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '650', co2o: '420', tf: '73', rh: '45', pm: '8' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    expect(score.zones[0].professionalOpinion).toBe('no_significant_concerns_identified')
  })

  it('pass-severity finding gets qualitative_only or provisional_screening_level confidence', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '650', co2o: '420' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone as any], { meta: META })
    const passFinding = score.zones[0].categories.flatMap(c => c.findings).find(f => f.severityInternal === 'pass')
    if (passFinding) {
      expect(['qualitative_only', 'provisional_screening_level']).toContain(passFinding.confidenceTier)
    }
  })
})
