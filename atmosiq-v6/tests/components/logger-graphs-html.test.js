/**
 * Environmental Evidence Graphs — Web (HTML) report section.
 *
 * Pins the inclusion gate (include + usable image) and the rendered markup so
 * the Web report embeds the same logger timelines as the DOCX/PDF.
 */
import { describe, it, expect } from 'vitest'
import { extractIncludedLoggerGraphs, renderLoggerGraphsSectionHtml, loggerGraphsSectionFromSensorData } from '../../src/components/print/logger-graphs-html'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('extractIncludedLoggerGraphs', () => {
  it('keeps only included graphs with a usable image', () => {
    const graphs = extractIncludedLoggerGraphs({ graphs: {
      a: { include: true, imageDataUrl: PNG, title: 'A', series: ['x'] },
      b: { include: true }, // no image
      c: { include: false, imageDataUrl: PNG },
      d: { include: true, imageDataUrl: 'not-a-data-url' },
    } })
    expect(graphs.map((g) => g.title)).toEqual(['A'])
  })

  it('is empty for missing / malformed input', () => {
    expect(extractIncludedLoggerGraphs(null)).toEqual([])
    expect(extractIncludedLoggerGraphs({})).toEqual([])
    expect(extractIncludedLoggerGraphs({ graphs: {} })).toEqual([])
  })
})

describe('renderLoggerGraphsSectionHtml', () => {
  it('returns empty string when there are no graphs', () => {
    expect(renderLoggerGraphsSectionHtml([])).toBe('')
    expect(renderLoggerGraphsSectionHtml(null)).toBe('')
  })

  it('renders a heading, disclaimer, the image, parameters, and caption', () => {
    const html = renderLoggerGraphsSectionHtml(
      [{ title: 'CO₂ Over Time', series: ['CO₂'], caption: 'Rose during occupied hours.', imageDataUrl: PNG }],
      { dataSource: 'qtrak.csv' },
    )
    expect(html).toContain('Environmental Evidence Graphs')
    expect(html).toContain('does not make compliance determinations')
    expect(html).toContain(`src="${PNG}"`)
    expect(html).toContain('Data source: qtrak.csv')
    expect(html).toContain('Parameters: CO₂')
    expect(html).toContain('Rose during occupied hours.')
  })

  it('escapes author-supplied text but emits the data-URL image verbatim', () => {
    const html = renderLoggerGraphsSectionHtml([{ title: '<script>x</script>', series: null, caption: 'a & b', imageDataUrl: PNG }])
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).toContain(`src="${PNG}"`)
  })
})

describe('loggerGraphsSectionFromSensorData', () => {
  it('extracts and renders in one call', () => {
    const html = loggerGraphsSectionFromSensorData({ graphs: { co2: { include: true, imageDataUrl: PNG, title: 'CO₂' } } })
    expect(html).toContain('Environmental Evidence Graphs')
    expect(html).toContain(`src="${PNG}"`)
  })
})
