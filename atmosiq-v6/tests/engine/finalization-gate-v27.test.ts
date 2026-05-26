/**
 * Engine finalization gate — hard vs dismissible tiers (v2.8).
 *
 * HARD blockers (canFinalize === false):
 *   - client name, site contact name + role
 *   - Critical/High findings need photos OR photo-override
 *   - (plus instrument registration + calibration, exercised elsewhere)
 *
 * DISMISSIBLE blockers (surfaced with field + location, but do NOT
 * block finalization):
 *   - requested_by equal to the facility name
 *   - zones with symptom findings missing an occupant denominator
 *   - assessor name placeholder pattern
 *   - findings without matching recommendations
 *
 * Client identity autowires from presurvey.ps_recipient_* when no
 * explicit client object is supplied. Every blocker is a structured
 * { id, field, label, message, location, severity } object.
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

  it('flags requested_by equal to the facility name as dismissible, not a hard block', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: {
        name: 'Meridian Property Holdings LLC',
        contact_name: 'Pat Doe',
        contact_role: 'Facility Manager',
        requested_by: 'Meridian Commerce Tower',
      },
    }))
    expect(r.canFinalize).toBe(true)
    expect(r.dismissibleBlockers.some((b: any) => /Requested-by.*facility name/i.test(b.message))).toBe(true)
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

  it('flags symptom-zone missing occupant denominator as dismissible, not a hard block', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      zones: [{ zn: '3rd Floor' }],
      zoneScores: [{
        zoneName: '3rd Floor',
        cats: [{ l: 'Complaints', r: [{ t: 'Multiple occupants reporting symptoms', sev: 'medium' }] }],
      }],
      photos: { '3rd Floor': [{ id: 'p1' }] },
    }))
    expect(r.canFinalize).toBe(true)
    expect(r.dismissibleBlockers.some((b: any) => /3rd Floor.*occupant denominator/i.test(b.message))).toBe(true)
  })

  it('flags assessor placeholder name as dismissible, not a hard block', () => {
    for (const placeholder of ['Hobo Lobo', 'Test User', 'Lorem Ipsum', 'John Doe', 'Jane Doe']) {
      const r = validateAssessment(makeAssessmentWithFullData({
        presurvey: {
          ps_inst_iaq: 'TSI Q-Trak 7575',
          ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
          ps_assessor: placeholder,
        },
      }))
      expect(r.canFinalize).toBe(true)
      expect(r.dismissibleBlockers.some((b: any) => /placeholder pattern/i.test(b.message))).toBe(true)
    }
  })

  it('autowires client identity from presurvey.ps_recipient_* when no client object is supplied', () => {
    const r = validateAssessment(makeAssessmentWithFullData({
      client: {},
      presurvey: {
        ps_inst_iaq: 'TSI Q-Trak 7575',
        ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
        ps_assessor: 'J. Smith, CIH, CSP',
        ps_recipient_organization: 'Meridian Property Holdings LLC',
        ps_recipient_name: 'Pat Doe',
        ps_recipient_title: 'Facility Manager',
      },
    }))
    expect(r.canFinalize).toBe(true)
    expect(r.hardBlockers.some((b: any) => /client name|site contact/i.test(b.message))).toBe(false)
  })

  it('returns structured hard + dismissible blocker lists, not a generic error string', () => {
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
    // Hard: client name, contact name, contact role, photos
    expect(r.hardBlockers.length).toBeGreaterThanOrEqual(4)
    expect(r.hardBlockers.every((b: any) => b.severity === 'hard' && b.message && b.location)).toBe(true)
    // back-compat: blockers mirrors the hard messages
    expect(r.blockers.length).toBe(r.hardBlockers.length)
    // Dismissible: assessor placeholder + occupant denominator
    expect(r.dismissibleBlockers.some((b: any) => /placeholder pattern/i.test(b.message))).toBe(true)
    expect(r.dismissibleBlockers.some((b: any) => /occupant denominator/i.test(b.message))).toBe(true)
  })
})
