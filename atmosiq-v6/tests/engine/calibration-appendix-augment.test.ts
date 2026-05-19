/**
 * Wire-up test for the DocxReport calibration-appendix augmentation.
 *
 * augmentWithCalibrationAppendices() merges a ClientReport result with
 * appendices B + E built from presurvey data. Engine output wins when
 * present (forward-compat). Memo-kind results pass through unchanged.
 *
 * This is the seam between engine output and DOCX rendering — the only
 * way calibration data reaches the client deliverable today, since the
 * engine declares but does not populate appendix B + E.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — DocxReport is a .js module without type declarations
import { augmentWithCalibrationAppendices } from '../../src/components/DocxReport'

const PRESURVEY_WITH_METER = {
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT-1',
  ps_inst_iaq_cal: '2026-04-01',
  ps_inst_iaq_cal_status: 'Factory',
}

function fakeResult(appendixOverrides: Record<string, unknown> = {}) {
  return {
    kind: 'client_report',
    report: {
      cover: { facilityName: 'X' },
      reviewStatus: 'draft',
      appendix: {
        standardsManifest: [],
        ...appendixOverrides,
      },
    },
  }
}

describe('augmentWithCalibrationAppendices', () => {
  it('injects appendix B + E when engine produces neither and presurvey has data', () => {
    const augmented = augmentWithCalibrationAppendices(fakeResult(), PRESURVEY_WITH_METER)
    expect(augmented.report.appendix.appendixB).toBeDefined()
    expect(augmented.report.appendix.appendixE).toBeDefined()
    expect(augmented.report.appendix.appendixB.instrumentRows[0].model).toBe('TSI Q-Trak 7575')
  })

  it('preserves engine-produced appendix B (forward-compat)', () => {
    const enginePayload = {
      appendixB: {
        title: 'ENGINE-PRODUCED',
        description: '',
        instrumentRows: [{ model: 'engine-meter', serial: '', lastCalibration: '', calibrationStatus: '', parametersMeasured: [] }],
        zoneRows: [],
      },
    }
    const augmented = augmentWithCalibrationAppendices(fakeResult(enginePayload), PRESURVEY_WITH_METER)
    expect(augmented.report.appendix.appendixB.title).toBe('ENGINE-PRODUCED')
    expect(augmented.report.appendix.appendixB.instrumentRows[0].model).toBe('engine-meter')
    // Appendix E should still be filled by the mapper since the engine
    // didn't produce it
    expect(augmented.report.appendix.appendixE).toBeDefined()
    expect(augmented.report.appendix.appendixE.calibrationRecords[0].instrumentModel).toBe('TSI Q-Trak 7575')
  })

  it('passes pre-assessment memo results through unchanged', () => {
    const memo = { kind: 'pre_assessment_memo', memo: { headline: 'x' }, reasons: [] }
    const out = augmentWithCalibrationAppendices(memo, PRESURVEY_WITH_METER)
    expect(out).toBe(memo)
  })

  it('returns the result unchanged when both engine + presurvey are empty', () => {
    const r = fakeResult()
    const out = augmentWithCalibrationAppendices(r, {})
    expect(out).toBe(r)
  })

  it('does not mutate the input result', () => {
    const r = fakeResult()
    const snapshot = JSON.parse(JSON.stringify(r))
    augmentWithCalibrationAppendices(r, PRESURVEY_WITH_METER)
    expect(r).toEqual(snapshot)
  })

  it('safely handles a null/undefined result', () => {
    expect(augmentWithCalibrationAppendices(null, PRESURVEY_WITH_METER)).toBeNull()
    expect(augmentWithCalibrationAppendices(undefined, PRESURVEY_WITH_METER)).toBeUndefined()
  })
})
