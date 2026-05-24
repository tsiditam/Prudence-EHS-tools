/**
 * buildSensorGraphsAppendix — DOCX appendix for included sensor graphs.
 */

import { describe, it, expect } from 'vitest'
import { buildSensorGraphsAppendix } from '../../src/components/docx/sections-sensor'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('buildSensorGraphsAppendix', () => {
  it('is a no-op (null) when there is no sensor data or no included graphs', () => {
    expect(buildSensorGraphsAppendix(null)).toBeNull()
    expect(buildSensorGraphsAppendix({ graphs: {} })).toBeNull()
    expect(buildSensorGraphsAppendix({ graphs: { co2: { include: false } } })).toBeNull()
    // included but no usable image → still skipped
    expect(buildSensorGraphsAppendix({ graphs: { co2: { include: true } } })).toBeNull()
  })

  it('returns a { title, children } descriptor for an included graph', () => {
    const section = buildSensorGraphsAppendix({
      fileName: 'qtrak.csv',
      summary: { count: 100, start: Date.now() - 3600000, end: Date.now() },
      units: { co2: 'ppm' },
      quality: { level: 'minor', status: 'Data has minor gaps — review before final reporting.' },
      graphs: { co2: { include: true, imageDataUrl: PNG, title: 'CO₂ Over Time', series: ['CO₂'], caption: 'CO₂ rose during occupied periods.' } },
    })
    // Builder owns only the title text + body; the pipeline renders the
    // shared "Appendix <letter> — " heading.
    expect(section.title).toBe('Environmental Evidence Graphs')
    expect(Array.isArray(section.children)).toBe(true)
    expect(section.children.length).toBeGreaterThan(3) // disclaimer + source + graph blocks
  })
})
