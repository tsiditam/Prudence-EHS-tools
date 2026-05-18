/**
 * Readiness Verdict — integration of validation.js + defensibility-gaps.js
 * + confidenceCounts into the unified shape consumed by the UI panel
 * and the chat agent's context block.
 */

import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict.js'

function fullyCleanAssessment(overrides: Record<string, any> = {}) {
  return {
    assessmentMode: 'SCREENING',
    presurvey: {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
      ps_assessor: 'J. Smith, CIH, CSP',
    },
    building: { fn: 'Demo Tower', ht: 'VAV with rooftop AHU' },
    client: {
      name: 'Demo Holdings LLC',
      contact_name: 'Pat Doe',
      contact_role: 'Facility Manager',
      requested_by: 'Pat Doe',
    },
    zones: [{ zn: 'Zone 1', co2: '850', co2o: '420', meas_conditions: 'Yes — normal operations' }],
    zoneScores: [{ zoneName: 'Zone 1', cats: [{ l: 'Vent', r: [{ t: 'CO2 normal', sev: 'low' }] }] }],
    photos: { 'Zone 1': [{ id: 'p1' }] },
    recs: { imm: [], eng: [], adm: [], mon: [] },
    confidence: 'Medium',
    ...overrides,
  }
}

describe('readiness verdict', () => {
  it('returns status=ready on a clean assessment with no gaps', () => {
    const v = buildReadinessVerdict(fullyCleanAssessment())
    expect(v.status).toBe('ready')
    expect(v.ready).toBe(true)
    expect(v.can_finalize).toBe(true)
    expect(v.finalization_blockers).toEqual([])
    expect(v.defensibility_gaps).toEqual([])
    expect(v.summary).toMatch(/Ready for sign-off/)
  })

  it('returns status=gaps when finalization passes but gaps exist', () => {
    const v = buildReadinessVerdict(
      fullyCleanAssessment({
        zones: [{ zn: 'Zone 1', co2: '1180' /* no co2o */, meas_conditions: 'Yes' }],
      }),
    )
    expect(v.status).toBe('gaps')
    expect(v.ready).toBe(false)
    expect(v.can_finalize).toBe(true)
    expect(v.defensibility_gaps.length).toBeGreaterThan(0)
    expect(v.defensibility_gaps[0].kind).toBe('missing_outdoor_co2')
    expect(v.summary).toMatch(/gap/)
  })

  it('returns status=blocked when finalization blockers exist', () => {
    const v = buildReadinessVerdict(
      fullyCleanAssessment({
        client: { name: 'Not Specified', contact_name: '', contact_role: '' },
      }),
    )
    expect(v.status).toBe('blocked')
    expect(v.ready).toBe(false)
    expect(v.can_finalize).toBe(false)
    expect(v.finalization_blockers.length).toBeGreaterThan(0)
    expect(v.summary).toMatch(/blocker/)
  })

  it('handles a null/empty assessment gracefully', () => {
    const v = buildReadinessVerdict(null)
    expect(v.status).toBe('blocked')
    expect(v.ready).toBe(false)
    expect(v.summary).toMatch(/No assessment loaded/)
  })

  it('reports a confidence breakdown across findings', () => {
    const v = buildReadinessVerdict(
      fullyCleanAssessment({
        zoneScores: [
          {
            zoneName: 'Zone 1',
            cats: [
              {
                l: 'Vent',
                r: [
                  { t: 'A', sev: 'high' },
                  { t: 'B', sev: 'medium' },
                  { t: 'C', sev: 'low' },
                  { t: 'D', qualitative_only: true },
                ],
              },
            ],
          },
        ],
      }),
    )
    expect(v.confidence.high).toBe(1)
    expect(v.confidence.medium).toBe(1)
    expect(v.confidence.low).toBe(1)
    expect(v.confidence.qualitative_only).toBe(1)
  })
})
