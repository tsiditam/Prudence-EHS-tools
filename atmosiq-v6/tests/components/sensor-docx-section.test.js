/**
 * buildSensorGraphsAppendix — DOCX appendix for included sensor graphs.
 */

import { describe, it, expect } from 'vitest'
import { buildSensorGraphsAppendix } from '../../src/components/docx/sections-sensor'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('buildSensorGraphsAppendix', () => {
  it('is a no-op when there is no sensor data or no included graphs', () => {
    expect(buildSensorGraphsAppendix(null)).toEqual([])
    expect(buildSensorGraphsAppendix({ graphs: {} })).toEqual([])
    expect(buildSensorGraphsAppendix({ graphs: { co2: { include: false } } })).toEqual([])
    // included but no usable image → still skipped
    expect(buildSensorGraphsAppendix({ graphs: { co2: { include: true } } })).toEqual([])
  })

  it('emits paragraphs for an included graph without throwing', () => {
    const out = buildSensorGraphsAppendix({
      fileName: 'qtrak.csv',
      summary: { count: 100, start: Date.now() - 3600000, end: Date.now() },
      units: { co2: 'ppm' },
      quality: { level: 'minor', status: 'Data has minor gaps — review before final reporting.' },
      graphs: { co2: { include: true, imageDataUrl: PNG, title: 'CO₂ Over Time', series: ['CO₂'], caption: 'CO₂ rose during occupied periods.' } },
    })
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(3) // heading + disclaimer + source + graph blocks
  })
})
