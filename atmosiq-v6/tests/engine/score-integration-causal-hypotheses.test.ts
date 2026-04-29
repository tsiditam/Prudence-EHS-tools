/**
 * v2.6 §4 acceptance — score() integration test.
 *
 * Drives the public engine entry point with the canonical
 * Hizinburg-style data-center fixture and asserts that
 * causalChains and hypotheses are populated end-to-end.
 */

import { describe, it, expect } from 'vitest'
import { score } from '../../src/engine'
import type { AssessmentInput, AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Hizinburg Data Center — Building 2',
  siteAddress: '8100 Gateway Blvd, Newark, NJ 07102',
  assessmentDate: '2026-04-29',
  preparingAssessor: { fullName: 'Tester', credentials: ['CIH'] },
  reviewStatus: 'reviewed_by_qualified_professional',
  reviewingProfessional: { fullName: 'Reviewer', credentials: ['CIH'], signatureDate: '2026-04-29' },
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC' },
  projectNumber: 'PSEC-TEST-2.6',
  transmittalRecipient: {
    fullName: 'Sarah Lin',
    organization: 'Meridian Properties LLC',
    title: 'Director of Property Operations',
  },
  instrumentsUsed: [
    { model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15', calibrationStatus: 'Calibrated' },
    { model: 'TSI DustTrak DRX 8534', lastCalibration: '2026-02-01' },
  ],
}

function buildCanonicalInput(): AssessmentInput {
  return {
    meta: META,
    zonesData: [
      // Data Hall A — sick-building pattern + thermal/PM elevated +
      // gaseous corrosion indicator. Drives 4 chains and 4 hypotheses.
      {
        zn: 'Data Hall A — Primary',
        su: 'office',
        zone_subtype: 'data_hall',
        co2: '1180', co2o: '420',
        tf: '74', rh: '52',
        pm: '12', tv: '600',
        co: '2', hc: '0.05',
        cx: 'Yes — complaints reported',
        ac: '6-10',
        cc: 'Yes — this zone',
        sr: 'Yes — clear pattern',
        sy: ['Headache', 'Fatigue', 'Eye irritation'],
        gaseous_corrosion: 'G2 (moderate)',
      },
      {
        zn: 'Conference Room B',
        su: 'conference',
        co2: '1100', co2o: '420', tf: '76', rh: '58', pm: '8',
        co: '1', hc: '0.04',
        cx: 'Yes — complaints reported',
        cc: 'Yes — this zone',
        sy: ['Headache'],
      },
    ],
    buildingData: { hm: 'Over 12 months', fc: 'Heavily loaded', dp: 'Bio growth observed' },
    presurvey: {
      ps_assessor: 'Tester',
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal: '2026-01-15',
      ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
    },
  }
}

describe('v2.6 §4 — score() integration', () => {
  it('canonical input produces at least 2 causal chains', () => {
    const result = score(buildCanonicalInput())
    expect(result.causalChains.length).toBeGreaterThanOrEqual(2)
  })

  it('canonical input produces at least 2 hypotheses', () => {
    const result = score(buildCanonicalInput())
    expect(result.hypotheses.length).toBeGreaterThanOrEqual(2)
  })

  it('every chain has non-empty relatedFindingIds', () => {
    const result = score(buildCanonicalInput())
    for (const c of result.causalChains) {
      expect(c.relatedFindingIds.length).toBeGreaterThan(0)
    }
  })

  it('every hypothesis has at least one SamplingRecommendation', () => {
    const result = score(buildCanonicalInput())
    for (const h of result.hypotheses) {
      expect(h.suggestedSampling.length).toBeGreaterThan(0)
    }
  })

  it('canonical input emits the data-center cleanliness chain (specialty)', () => {
    const result = score(buildCanonicalInput())
    const dc = result.causalChains.find(c => c.id === 'chain_data_center_corrosion')
    expect(dc).toBeDefined()
  })

  it('canonical input emits the inadequate-outdoor-air chain (general)', () => {
    const result = score(buildCanonicalInput())
    expect(result.causalChains.find(c => c.id === 'chain_inadequate_outdoor_air')).toBeDefined()
  })

  it('canonical input emits the moisture/microbial chain (drain pan reservoir)', () => {
    const result = score(buildCanonicalInput())
    // The fixture's buildingData.dp = 'Bio growth observed' should
    // produce hvac_drain_pan_microbial_reservoir → moisture chain.
    expect(result.causalChains.find(c => c.id === 'chain_moisture_microbial')).toBeDefined()
  })

  it('canonical input emits the corrosion + ventilation hypotheses', () => {
    const result = score(buildCanonicalInput())
    expect(result.hypotheses.find(h => h.name.includes('Atmospheric corrosion'))).toBeDefined()
    expect(result.hypotheses.find(h => h.name.includes('ventilation'))).toBeDefined()
  })

  it('clean input produces zero chains and zero hypotheses', () => {
    const result = score({
      meta: META,
      zonesData: [{ zn: 'Clean Office', co2: '450', tf: '72', rh: '45', pm: '4' }],
      buildingData: {},
      presurvey: { ps_assessor: 'Tester' },
    })
    expect(result.causalChains).toHaveLength(0)
    expect(result.hypotheses).toHaveLength(0)
  })
})
