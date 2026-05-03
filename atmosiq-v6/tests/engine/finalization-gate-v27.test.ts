/**
 * Engine v2.7 Fix 4 — extended finalization gate.
 *
 * Verifies the six new blockers added to validateAssessment beyond
 * the existing instrument-calibration check:
 *   1. client name placeholder
 *   2. site contact name + role both required
 *   3. requested_by must be a person, not the facility name
 *   4. Critical/High findings need photos OR photo-override
 *   5. zones with symptom findings need occupant denominator
 *   6. assessor name placeholder pattern
 *
 * The gate returns a structured blocker list — callers surface each
 * item explicitly, not as a generic error.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { validateAssessment } from '../../src/engines/validation.js'

function makeAssessmentWithFullData(overrides: Record<string, any> = {}) {
  return {
    // SCREENING mode bypasses pre-existing sufficiency + instrument
    // gates that aren't part of Fix 4. The Fix 4 blockers are mode-
    // independent.
    assessmentMode: 'SCREENING',
    presurvey: {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
      ps_assessor: 'J. Smith, CIH, CSP',
    },
    building: { fn: 'Meridian Commerce Tower', client_name: 'Meridian Property Holdings LLC' },
    client: {
      name: 'Meridian Property Holdings LLC',
      contact_name: 'Pat Doe',
      contact_role: 'Facility Manager',
      requested_by: 'Pat Doe',
    },
    zones: [{ zn: 'Zone 1', total_count: 12, affected_count: 4 }],
    zoneScores: [{
      zoneName: 'Zone 1',
      cats: [{ l: 'Complaints', r: [{ t: 'Occupant headache symptoms reported', sev: 'medium' }] }],
    }],
    photos: { 'Zone 1': [{ id: 'p1' }] },
    recs: { imm: [], eng: [], adm: [], mon: [] },
    confidence: 'Medium',
    ...overrides,
  }
}

describe('finalization gate — v2.7 Fix 4 extensions', () => {
  it('passes with full Meridian-style data', () => {
    const r = validateAssessment(makeAssessmentWithFullData())
    expect(r.canFinalize).toBe(true)
    expect(r.blockers).toEqual([])
  })

  it('blocks when client name is missing', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: { contact_name: 'Pat Doe', contact_role: 'Facility Manager' },
      building: { fn: 'Meridian Commerce Tower' },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Client name/i.test(b))).toBe(true)
  })

  it('blocks when client name is "Not Specified"', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: { name: 'Not Specified', contact_name: 'Pat Doe', contact_role: 'Facility Manager' },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Client name.*"Not Specified"/i.test(b))).toBe(true)
  })

  it('blocks when site contact name is missing', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: { name: 'X Corp', contact_role: 'Facility Manager' },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Site contact name/i.test(b))).toBe(true)
  })

  it('blocks when site contact role is missing', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: { name: 'X Corp', contact_name: 'Pat Doe' },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Site contact role/i.test(b))).toBe(true)
  })

  it('blocks when requested_by equals the facility name (no person attached)', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: {
        name: 'Meridian Property Holdings LLC',
        contact_name: 'Pat Doe',
        contact_role: 'Facility Manager',
        requested_by: 'Meridian Commerce Tower',
      },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Requested-by.*facility name/i.test(b))).toBe(true)
  })

  it('blocks when Critical/High zone has no photos and no override', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      photos: {},
      zoneScores: [{
        zoneName: 'Conference Room B',
        cats: [{ l: 'Environment', r: [{ t: 'Active water intrusion', sev: 'critical' }] }],
      }],
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /Conference Room B.*Critical or High.*no photo/i.test(b))).toBe(true)
  })

  it('passes the photo gate when override is provided with justification', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      photos: {},
      photoOverrides: { 'Conference Room B': { reason: 'Active water leak — could not safely access ceiling void.' } },
      zoneScores: [{
        zoneName: 'Conference Room B',
        cats: [{ l: 'Environment', r: [{ t: 'Active water intrusion', sev: 'critical' }] }],
      }],
      // Critical findings require an Immediate recommendation per the
      // pre-existing gate (line 51 of validation.js); satisfy it here
      // so we isolate the photo-override behavior under test.
      recs: { imm: ['Conference Room B: Arrest water intrusion.'], eng: [], adm: [], mon: [] },
    }))
    expect(r.canFinalize).toBe(true)
  })

  it('blocks when symptom-zone is missing occupant denominator', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      zones: [{ zn: '3rd Floor' }],
      zoneScores: [{
        zoneName: '3rd Floor',
        cats: [{ l: 'Complaints', r: [{ t: 'Multiple occupants reporting symptoms', sev: 'medium' }] }],
      }],
      photos: { '3rd Floor': [{ id: 'p1' }] },
    }))
    expect(r.canFinalize).toBe(false)
    expect(r.blockers.some((b: string) => /3rd Floor.*occupant denominator/i.test(b))).toBe(true)
  })

  it('blocks when assessor name matches placeholder pattern', () => {
    for (const placeholder of ['Hobo Lobo', 'Test User', 'Lorem Ipsum', 'John Doe', 'Jane Doe']) {
      const r = validateAssessment(makeAssessmentWithFullData({
        presurvey: {
          ps_inst_iaq: 'TSI Q-Trak 7575',
          ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
          ps_assessor: placeholder,
        },
      }))
      expect(r.canFinalize).toBe(false)
      expect(r.blockers.some((b: string) => /placeholder pattern/i.test(b))).toBe(true)
    }
  })

  it('returns a structured blocker list, not a generic error string', () => {
    // Many fields missing → expect MANY blockers, not one bundled error
    const r = validateAssessment({
      assessmentMode: 'FULL_ASSESSMENT',
      presurvey: { ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_iaq_cal_status: 'Calibrated', ps_assessor: 'Hobo Lobo' },
      building: { fn: 'Meridian Commerce Tower' },
      client: {},
      zones: [{ zn: 'Z1' }],
      zoneScores: [{ zoneName: 'Z1', cats: [{ l: 'Env', r: [{ t: 'Critical occupant symptom event', sev: 'critical' }] }] }],
      photos: {},
      recs: { imm: ['Z1: Address.'], eng: [], adm: [], mon: [] },
    })
    expect(r.canFinalize).toBe(false)
    // Expect AT LEAST 5 distinct blockers (client name, contact name,
    // contact role, photos, occupant denominator, assessor placeholder)
    expect(r.blockers.length).toBeGreaterThanOrEqual(5)
  })
})
