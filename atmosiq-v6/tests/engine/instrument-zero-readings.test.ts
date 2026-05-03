/**
 * v2.5 §7 acceptance — Instrument zero-readings filtering.
 *
 * Validates:
 *   1. An InstrumentRef with zero readings does not appear in
 *      Sampling Methodology.
 *   2. A console warning is logged at render time.
 *   3. Filter helper omits zero-reading instruments from the kept set.
 *   4. Known-instrument with non-zero readings renders the full
 *      spec paragraph.
 *   5. Unknown-instrument with non-zero readings renders the
 *      qualitative_only disclaimer paragraph.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  buildSamplingMethodology,
  filterInstrumentsWithReadings,
  renderInstrumentMethodologyParagraph,
} from '../../src/engine/report/methodology-narrative'
import { INSTRUMENT_ACCURACY } from '../../src/engine/instruments/accuracy'
import type { InstrumentRef } from '../../src/engine/types/reading'

const QTRAK: InstrumentRef = {
  model: 'TSI Q-Trak 7575',
  serial: 'QT-001',
  lastCalibration: '2026-01-15',
  calibrationStatus: 'Calibrated within manufacturer spec',
}
const MINIRAE: InstrumentRef = {
  model: 'RAE MiniRAE 3000',
  lastCalibration: '',
  calibrationStatus: '',
}

describe('v2.5 §7 — Instrument zero-readings filtering', () => {
  it('filterInstrumentsWithReadings keeps only instruments with non-zero readings', () => {
    const kept = filterInstrumentsWithReadings(
      [QTRAK, MINIRAE],
      { 'TSI Q-Trak 7575': 12, 'RAE MiniRAE 3000': 0 },
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].model).toBe('TSI Q-Trak 7575')
  })

  it('filterInstrumentsWithReadings is a no-op when no readings map is provided', () => {
    const kept = filterInstrumentsWithReadings([QTRAK, MINIRAE], undefined)
    expect(kept).toHaveLength(2)
  })

  it('zero-reading instrument is filtered from Sampling Methodology output', () => {
    const warnings: string[] = []
    const section = buildSamplingMethodology(
      [QTRAK, MINIRAE],
      {
        readingsByInstrument: { 'TSI Q-Trak 7575': 12, 'RAE MiniRAE 3000': 0 },
        warn: (m) => warnings.push(m),
      },
    )
    const joined = section.instrumentParagraphs.join('\n')
    expect(joined).toContain('Q-Trak 7575')
    expect(joined).not.toContain('MiniRAE')
  })

  it('logs a console warning when an instrument is filtered for zero readings', () => {
    const warn = vi.fn()
    buildSamplingMethodology(
      [QTRAK, MINIRAE],
      { readingsByInstrument: { 'TSI Q-Trak 7575': 12, 'RAE MiniRAE 3000': 0 }, warn },
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('RAE MiniRAE 3000')
    expect(warn.mock.calls[0][0]).toMatch(/no readings/i)
  })

  it('known-instrument with non-zero readings renders the full spec paragraph', () => {
    const result = renderInstrumentMethodologyParagraph(
      QTRAK,
      { 'TSI Q-Trak 7575': 12 },
      INSTRUMENT_ACCURACY,
    )
    expect(result.warning).toBeUndefined()
    expect(result.paragraph).toContain('Q-Trak 7575')
    expect(result.paragraph).toContain('accuracy')
    expect(result.paragraph).toContain('±')
  })

  it('unknown-instrument with non-zero readings renders the qualitative_only disclaimer paragraph', () => {
    const minirae: InstrumentRef = { ...MINIRAE }
    const result = renderInstrumentMethodologyParagraph(
      minirae,
      { 'RAE MiniRAE 3000': 5 },
      INSTRUMENT_ACCURACY,
    )
    expect(result.warning).toBeUndefined()
    expect(result.paragraph).toContain('qualitative only')
    expect(result.paragraph).toContain('not in the AtmosFlow accuracy database')
  })

  it('unknown-instrument with zero readings is filtered (paragraph empty + warning)', () => {
    const minirae: InstrumentRef = { ...MINIRAE }
    const result = renderInstrumentMethodologyParagraph(
      minirae,
      { 'RAE MiniRAE 3000': 0 },
      INSTRUMENT_ACCURACY,
    )
    expect(result.paragraph).toBe('')
    expect(result.warning).toContain('RAE MiniRAE 3000')
  })
})
