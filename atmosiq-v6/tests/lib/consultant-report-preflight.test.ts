/**
 * Consultant report preflight — engine refusal detection.
 *
 * Pins the contract that:
 *   • preflight runs cleanly on report data the engine would refuse
 *   • each fired engine trigger surfaces with IH-facing guidance
 *   • triggers correctly partition into overridable vs non-overridable
 *   • applying the IH override actually mutates the score so the
 *     engine no longer refuses
 */
import { describe, it, expect } from 'vitest'
import { runConsultantPreflight } from '../../src/utils/consultantReportPreflight'
import { applyOverrideToScore } from '../../src/utils/consultantReportOverride'
import { evaluateRefusalTriggers } from '../../src/engine/report/pre-assessment-memo'

function emptyReportData() {
  // Deliberately thin — no instrument readings, no calibration, no
  // credentials. The engine should refuse on multiple triggers.
  return {
    building: { fn: 'Test Site', fl: '123 Test Way' },
    presurvey: { ps_assessor: 'J. Smith' },
    zones: [{ zn: 'Zone A' }],
    zoneScores: [{
      zoneName: 'Zone A',
      cats: [{ l: 'Ventilation', r: [] }],
    }],
    comp: null,
    profile: { name: 'J. Smith', firm: 'Prudence EHS' },
    ts: '2026-05-23',
  }
}

describe('runConsultantPreflight', () => {
  it('returns wouldRefuse=true when the engine would refuse to issue', () => {
    const pf = runConsultantPreflight(emptyReportData())
    expect(pf.wouldRefuse).toBe(true)
    expect(pf.triggers.length).toBeGreaterThan(0)
  })

  it('surfaces every fired trigger with IH-facing guidance', () => {
    const pf = runConsultantPreflight(emptyReportData())
    for (const trig of pf.triggers) {
      expect(typeof trig.id).toBe('string')
      expect(typeof trig.label).toBe('string')
      expect(trig.label.length).toBeGreaterThan(0)
      expect(typeof trig.description).toBe('string')
      expect(typeof trig.fixWhere).toBe('string')
      expect(typeof trig.overridable).toBe('boolean')
    }
  })

  it('marks credential_absence as non-overridable', () => {
    const pf = runConsultantPreflight(emptyReportData())
    const cred = pf.triggers.find(t => t.id === 'credential_absence')
    if (cred) expect(cred.overridable).toBe(false)
  })

  it('marks bulk_insufficiency, confidence_collapse, no_measurement, calibration_absence as overridable', () => {
    const pf = runConsultantPreflight(emptyReportData())
    for (const id of ['bulk_insufficiency', 'confidence_collapse', 'no_measurement', 'calibration_absence']) {
      const t = pf.triggers.find(x => x.id === id)
      if (t) expect(t.overridable).toBe(true)
    }
  })

  it('still detects refusal triggers when the assessment has photos but no readings', () => {
    const pf = runConsultantPreflight({
      ...emptyReportData(),
      photos: { 'Zone A': [{ id: 'p1' }] },
    })
    expect(pf.wouldRefuse).toBe(true)
  })
})

describe('applyOverrideToScore', () => {
  it('flips hasCalibrationRecords when calibration_absence is overridden', () => {
    const { score } = runConsultantPreflight(emptyReportData())
    const before = score.defensibilityFlags?.hasCalibrationRecords
    const out = applyOverrideToScore(score, {
      triggers: ['calibration_absence'],
      justification: 'Calibration on file at office',
    })
    expect(before).toBe(false)
    expect(out.score.defensibilityFlags.hasCalibrationRecords).toBe(true)
    expect(out.mutations.some((m: { id: string }) => m.id === 'calibration_absence')).toBe(true)
  })

  it('flips hasInstrumentData when no_measurement is overridden', () => {
    const { score } = runConsultantPreflight(emptyReportData())
    const out = applyOverrideToScore(score, {
      triggers: ['no_measurement'],
      justification: 'Field walkthrough only',
    })
    expect(out.score.defensibilityFlags.hasInstrumentData).toBe(true)
    expect(out.mutations.some((m: { id: string }) => m.id === 'no_measurement')).toBe(true)
  })

  it('upgrades a finding\'s evidence kind when no_measurement is overridden + a finding is present', () => {
    const dataWithFinding = {
      ...emptyReportData(),
      zoneScores: [{
        zoneName: 'Zone A',
        cats: [{ l: 'Complaints', r: [{ t: 'Occupant headache symptoms', sev: 'medium' }] }],
      }],
    }
    const { score } = runConsultantPreflight(dataWithFinding)
    const out = applyOverrideToScore(score, {
      triggers: ['no_measurement'],
      justification: 'Walkthrough',
    })
    // The mutated score should contain at least one finding whose
    // evidence kind is no longer observation-only.
    const upgraded = (out.score.zones || []).some(
      (z: { categories: Array<{ findings: Array<{ evidenceBasis?: { kind?: string } }> }> }) =>
        (z.categories || []).some(c =>
          (c.findings || []).some(f =>
            f.evidenceBasis?.kind !== 'visual_olfactory_screening' &&
            f.evidenceBasis?.kind !== 'occupant_report_anecdotal',
          ),
        ),
    )
    expect(upgraded).toBe(true)
  })

  it('does not mutate the original score (clean clone)', () => {
    const { score } = runConsultantPreflight(emptyReportData())
    const originalCalib = score.defensibilityFlags?.hasCalibrationRecords
    applyOverrideToScore(score, {
      triggers: ['calibration_absence'],
      justification: 'X',
    })
    expect(score.defensibilityFlags?.hasCalibrationRecords).toBe(originalCalib)
  })

  it('returns no mutations when triggers list is empty', () => {
    const { score } = runConsultantPreflight(emptyReportData())
    const out = applyOverrideToScore(score, { triggers: [], justification: '' })
    expect(out.mutations).toEqual([])
  })

  it('the mutated score, when re-evaluated by the engine, no longer fires the overridden triggers', () => {
    const dataWithFinding = {
      ...emptyReportData(),
      zoneScores: [{
        zoneName: 'Zone A',
        cats: [{ l: 'Complaints', r: [{ t: 'Occupant headache symptoms', sev: 'medium' }] }],
      }],
    }
    const { score } = runConsultantPreflight(dataWithFinding)
    const triggers = ['calibration_absence', 'no_measurement']
    const out = applyOverrideToScore(score, {
      triggers,
      justification: 'Test override',
    })
    const reTriggered = evaluateRefusalTriggers(out.score)
    for (const id of triggers) {
      const t = reTriggered.find(x => x.id === id)
      if (t) expect(t.fired).toBe(false)
    }
  })
})
