// @vitest-environment node
/**
 * generateModernSummaryHTML — concise, plain-language screening summary
 * rendered from RAW assessment data (no engine ClientReport prose path).
 */
import { describe, it, expect } from 'vitest'
import { generateModernSummaryHTML } from '../../src/components/print/modern-summary'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { DEMO_BUILDING, DEMO_ZONES, DEMO_PRESURVEY } from '../../src/constants/demoData.js'

function demoData(extra) {
  const zoneScores = DEMO_ZONES.map(z => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(zoneScores)
  return {
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones: DEMO_ZONES,
    zoneScores, comp, profile: { name: 'John Smith', certs: ['CIH', 'CSP'] },
    recs: { imm: ['Verify outdoor-air supply to the affected zone.'], eng: [], adm: [], mon: [] },
    ...extra,
  }
}

describe('generateModernSummaryHTML', () => {
  it('produces a self-contained HTML doc with the summary sections', () => {
    const html = generateModernSummaryHTML(demoData())
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('Indoor Air Quality Summary')
    expect(html).toContain('At a Glance')
    expect(html).toContain('Findings at a Glance')      // per-parameter table (Report Model)
    expect(html).toContain('Peak CO2 by Zone')          // inline-SVG bar chart
    expect(html).toContain('<svg')
    expect(html).toContain('What We Found')
    expect(html).toContain('Recommended Next Steps')
    expect(html).toContain(DEMO_BUILDING.fn) // site name surfaced
    expect(html).toContain('John Smith')      // assessor
    // Screening-only positioning retained
    expect(html).toMatch(/not a regulatory exposure determination/i)
  })

  it('is concise relative to the engine report (no transmittal-letter prose)', () => {
    const html = generateModernSummaryHTML(demoData())
    expect(html).not.toMatch(/Respectfully submitted|generally accepted industrial hygiene practices/i)
  })

  it('applies a customizable brand accent color', () => {
    const html = generateModernSummaryHTML(demoData(), { brandColor: '#7C3AED' })
    expect(html).toContain('--accent:#7C3AED')
  })

  it('embeds included Logger Studio chart images when present', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const html = generateModernSummaryHTML(demoData({
      sensorData: { graphs: { co2: { include: true, imageDataUrl: png, title: 'CO2 Over Time', caption: 'Logged trend.' } } },
    }))
    expect(html).toContain('Logger Data')
    expect(html).toContain(png)
    expect(html).toContain('CO2 Over Time')
  })

  it('omits empty sections gracefully', () => {
    const html = generateModernSummaryHTML({ building: { fn: 'Bare Site' }, zones: [], zoneScores: [], comp: null, profile: {} })
    expect(html).toContain('Bare Site')
    expect(html).not.toContain('Logger Data')      // no sensorData
    expect(html).not.toContain('Recommended Next Steps') // no recs
  })
})
