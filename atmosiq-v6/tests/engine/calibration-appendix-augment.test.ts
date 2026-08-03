/**
 * Wire-up test for the DocxReport calibration-appendix augmentation.
 *
 * `augmentWithCalibrationAppendices()` merges a ClientReport result with
 * appendices B + E built from presurvey data. This is the seam between
 * engine output and DOCX rendering, and the only way derived calibration
 * status reaches the client deliverable.
 *
 * ── Why this file was rewritten ────────────────────────────────────
 *
 * The previous version asserted "engine output wins when present
 * (forward-compat)", on the stated belief that the engine declares but
 * never populates appendix B/E. The engine populates BOTH,
 * unconditionally. The old fixtures supplied an engine result that
 * omitted them, so the tests passed against a shape that never occurs,
 * and the mapper's entire output — including the calibration
 * acknowledgement — was silently discarded in every issued report.
 * Reading a generated DOCX is what found it.
 *
 * So the fixtures below now mirror the REAL engine output
 * (`buildAppendixB` / `buildAppendixE` in src/engine/report/client.ts),
 * verbatim where the text matters. A fixture that does not resemble
 * production is worse than no fixture: it certifies the wrong thing.
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

/** No calibration date at all — the state the interrupt flags. */
const PRESURVEY_UNRECORDED = {
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_serial: 'QT-1',
}

const ACK = {
  version: 1,
  items: ['Last calibration date'],
  justification: 'Factory-calibrated 2026-01-10; certificate is in the project file.',
  assessorName: 'Tsidi Tamakloe',
  assessorCredentials: 'CSP',
  acknowledgedAt: '2026-08-02T13:55:00.000Z',
}

/**
 * The engine's real appendix B + E, copied from
 * src/engine/report/client.ts. The description strings are the point of
 * two of the assertions below, so they are reproduced exactly.
 */
const ENGINE_APPENDICES = {
  appendixB: {
    title: 'APPENDIX B — Sampling Locations and Methodology Detail',
    description:
      'Per-instrument and per-zone documentation supporting reproducibility of the field measurements summarized in the Results section.',
    instrumentRows: [
      { model: 'TSI Q-Trak 7575', serial: 'QT-1', lastCalibration: '', calibrationStatus: '', parametersMeasured: [] },
    ],
    zoneRows: [
      { zoneName: 'Open Office', samplingDuration: 'Single time-point reading', sampleLocations: 'Representative occupied area', outdoorReferenceTaken: false },
    ],
  },
  appendixE: {
    title: 'APPENDIX E — Quality Assurance and Instrument Calibration',
    description:
      'Calibration records and quality-assurance notes for the direct-reading instruments used in this assessment. Calibration was verified to be within manufacturer specification at the time of survey.',
    calibrationRecords: [
      { instrumentModel: 'TSI Q-Trak 7575', serial: 'QT-1', lastCalibration: '', status: '' },
    ],
    qaNotes: [
      'Field instruments were checked against ambient outdoor reference at the start of the survey day.',
      'Where outdoor reference measurements are missing for a parameter, the outdoor differential analysis is omitted from the corresponding Results subsection.',
      'Measurement uncertainty associated with direct-reading instruments is documented in Appendix B and applied throughout the screening-level interpretation.',
    ],
  },
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

/** The realistic case: the engine produced both appendices. */
const realistic = (presurvey: Record<string, string>, ack?: unknown) =>
  augmentWithCalibrationAppendices(fakeResult(ENGINE_APPENDICES), presurvey, {
    calibrationAcknowledgement: ack,
  }).report.appendix

describe('augmentWithCalibrationAppendices — engine produced nothing', () => {
  it('injects appendix B + E from presurvey', () => {
    const augmented = augmentWithCalibrationAppendices(fakeResult(), PRESURVEY_WITH_METER)
    expect(augmented.report.appendix.appendixB).toBeDefined()
    expect(augmented.report.appendix.appendixE).toBeDefined()
    expect(augmented.report.appendix.appendixB.instrumentRows[0].model).toBe('TSI Q-Trak 7575')
  })
})

describe('augmentWithCalibrationAppendices — engine produced both (the real case)', () => {
  it('keeps the engine title and the per-zone sampling table', () => {
    const ap = realistic(PRESURVEY_WITH_METER)
    expect(ap.appendixB.title).toBe(ENGINE_APPENDICES.appendixB.title)
    expect(ap.appendixE.title).toBe(ENGINE_APPENDICES.appendixE.title)
    expect(ap.appendixB.zoneRows).toEqual(ENGINE_APPENDICES.appendixB.zoneRows)
  })

  it('replaces the engine claim that calibration was verified against manufacturer spec', () => {
    // AtmosFlow verifies no such thing — it records a date the assessor
    // typed, and the engine prints that sentence even when there is no
    // date at all. Claiming a control that was never applied is the
    // failure this whole area exists to prevent.
    const ap = realistic(PRESURVEY_UNRECORDED)
    expect(ap.appendixE.description).not.toMatch(/verified to be within manufacturer specification/i)
    expect(ap.appendixE.description).toBeTruthy()
  })

  it('replaces blank status cells with the derived calibration status', () => {
    const ap = realistic(PRESURVEY_UNRECORDED)
    expect(ap.appendixE.calibrationRecords[0].status).toBe('Date not recorded')
    expect(ap.appendixB.instrumentRows[0].calibrationStatus).toBe('Date not recorded')
  })

  it('keeps every engine QA note and appends the derived ones', () => {
    const ap = realistic(PRESURVEY_UNRECORDED)
    for (const note of ENGINE_APPENDICES.appendixE.qaNotes) {
      expect(ap.appendixE.qaNotes, `engine note dropped: ${note}`).toContain(note)
    }
    const text = ap.appendixE.qaNotes.join(' ')
    expect(text).toMatch(/Calibration validity: \d+ days/)
    expect(text).toMatch(/no recorded calibration date/i)
  })

  it('does not duplicate a note present on both sides', () => {
    const ap = realistic(PRESURVEY_WITH_METER)
    const seen = new Set(ap.appendixE.qaNotes)
    expect(seen.size).toBe(ap.appendixE.qaNotes.length)
  })

  it('renders the calibration acknowledgement — the regression that started this', () => {
    // Under the old "engine wins" rule this returned the engine's three
    // constant notes and the acknowledgement never reached a client.
    const text = realistic(PRESURVEY_UNRECORDED, ACK).appendixE.qaNotes.join(' ')
    expect(text).toMatch(/Instrument-record exception acknowledged/)
    expect(text).toMatch(/Tsidi Tamakloe, CSP/)
    expect(text).toContain(ACK.justification)
  })

  it('omits acknowledgement wording when there is none', () => {
    const text = realistic(PRESURVEY_UNRECORDED).appendixE.qaNotes.join(' ')
    expect(text).not.toMatch(/exception acknowledged/i)
  })
})

describe('augmentWithCalibrationAppendices — safety', () => {
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

  it('leaves the engine appendices alone when presurvey has no instruments', () => {
    const ap = augmentWithCalibrationAppendices(fakeResult(ENGINE_APPENDICES), {}).report.appendix
    expect(ap.appendixB).toEqual(ENGINE_APPENDICES.appendixB)
    expect(ap.appendixE).toEqual(ENGINE_APPENDICES.appendixE)
  })

  it('does not mutate the input result', () => {
    const r = fakeResult(ENGINE_APPENDICES)
    const snapshot = JSON.parse(JSON.stringify(r))
    augmentWithCalibrationAppendices(r, PRESURVEY_WITH_METER, { calibrationAcknowledgement: ACK })
    expect(r).toEqual(snapshot)
  })

  it('safely handles a null/undefined result', () => {
    expect(augmentWithCalibrationAppendices(null, PRESURVEY_WITH_METER)).toBeNull()
    expect(augmentWithCalibrationAppendices(undefined, PRESURVEY_WITH_METER)).toBeUndefined()
  })
})
