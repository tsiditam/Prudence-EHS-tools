/**
 * v2.2 §7 — methodology narrative tests.
 */

import { describe, it, expect } from 'vitest'
import { buildSamplingMethodology, buildInstrumentParagraph } from '../../src/engine/report/methodology-narrative'

describe('v2.2 §7 — buildInstrumentParagraph', () => {
  it('TSI Q-Trak 7575 produces a paragraph mentioning CO₂, CO, T, RH with accuracy specs', () => {
    const para = buildInstrumentParagraph({
      model: 'TSI Q-Trak 7575',
      serial: 'QT-2024-08712',
      lastCalibration: '2026-01-15',
    })
    expect(para).not.toBeNull()
    expect(para!).toMatch(/Carbon dioxide|CO₂/i)
    expect(para!).toMatch(/Carbon monoxide|CO/i)
    expect(para!).toMatch(/Temperature/i)
    expect(para!).toMatch(/[Rr]elative humidity/i)
    expect(para!).toMatch(/2026-01-15|Last calibrated/i)
    expect(para!).toMatch(/±50|±0\.5|±3/) // some accuracy spec
  })

  it('Unknown instrument model produces a paragraph noting accuracy not citable', () => {
    const para = buildInstrumentParagraph({
      model: 'Acme Brand 9000',
      lastCalibration: '2026-02-01',
    })
    expect(para).not.toBeNull()
    expect(para!).toMatch(/not in the AtmosFlow accuracy database|could not be cited/i)
  })

  it('Missing calibration date produces "not recorded" clause', () => {
    const para = buildInstrumentParagraph({ model: 'TSI Q-Trak 7575' })
    expect(para).not.toBeNull()
    expect(para!).toMatch(/Calibration date not recorded/i)
  })
})

describe('v2.2 §7 — buildSamplingMethodology section assembly', () => {
  it('Multiple instruments yield one paragraph each plus an overall paragraph', () => {
    const section = buildSamplingMethodology([
      { model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15' },
      { model: 'TSI DustTrak DRX 8534', lastCalibration: '2026-02-01' },
    ])
    expect(section.instrumentParagraphs.length).toBe(2)
    expect(section.overallParagraph).toMatch(/Sample locations/i)
    expect(section.overallParagraph).toMatch(/Appendix B/)
  })

  it('Empty instrument list still produces section with fallback paragraph', () => {
    const section = buildSamplingMethodology([])
    expect(section.instrumentParagraphs.length).toBe(1)
    expect(section.instrumentParagraphs[0]).toMatch(/not captured|operator notes/i)
  })

  it('Outdoor reference location flows into overall paragraph when supplied', () => {
    const section = buildSamplingMethodology(
      [{ model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15' }],
      { outdoorReferenceLocation: 'the building parking lot' },
    )
    expect(section.overallParagraph).toMatch(/the building parking lot/)
  })
})
