// @vitest-environment jsdom
/**
 * ensureLoggerChartImages — export-time backfill that guarantees every
 * "Include in report" logger timeline carries a usable PNG before any report
 * format embeds it. The actual SVG→PNG raster needs a real canvas, so these
 * tests inject the renderer and pin the SELECTION + write-back contract:
 *   • Only included graphs are (re)rendered.
 *   • A graph that already has a usable image is preserved (no render call).
 *   • Cross-dataset overlays (co2-diff, zones-*) are never re-rendered here.
 *   • A render failure never drops an existing image.
 *   • The original object is not mutated.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ensureLoggerChartImages, composeChartFigure } from '../../src/utils/loggerChartImages'
import { PMTimelineChart, CO2TimelineChart, TempHumidityChart, MultiParameterChart, LIGHT_PALETTE } from '../../src/components/sensor/SensorCharts'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const FAKE = 'data:image/png;base64,FAKEGENERATED'

// A v2 envelope with a primary indoor dataset carrying CO2 + PM points.
function envelope(graphs) {
  return {
    version: 2,
    datasets: [{
      id: 'primary', role: 'indoor', label: 'Indoor',
      hasTimestamps: true,
      params: ['co2', 'pm25', 'pm10'],
      units: { co2: 'ppm', pm25: 'µg/m³' },
      summary: { count: 3, start: 0, end: 120000 },
      points: [
        { t: 0, co2: 800, pm25: 5, pm10: 8 },
        { t: 60000, co2: 1000, pm25: 6, pm10: 9 },
        { t: 120000, co2: 1100, pm25: 7, pm10: 10 },
      ],
    }],
    occupancyWindows: [],
    thresholds: { co2: true },
    graphs,
  }
}

describe('ensureLoggerChartImages', () => {
  it('renders an image for an included graph that lacks one', async () => {
    const sd = envelope({ pm: { include: true } })
    const calls = []
    const out = await ensureLoggerChartImages(sd, { renderChartToPng: (el) => { calls.push(el); return Promise.resolve(FAKE) } })
    expect(out.graphs.pm.imageDataUrl).toBe(FAKE)
    expect(out.graphs.pm.title).toBe('Particulate Matter (PM2.5 / PM10)')
    expect(out.graphs.pm.series).toEqual(['PM2.5', 'PM10'])
    expect(calls.length).toBe(1)
  })

  it('preserves an already-usable image and does not re-render it', async () => {
    const sd = envelope({ co2: { include: true, imageDataUrl: PNG } })
    let rendered = 0
    const out = await ensureLoggerChartImages(sd, { renderChartToPng: () => { rendered++; return Promise.resolve(FAKE) } })
    expect(out.graphs.co2.imageDataUrl).toBe(PNG)
    expect(rendered).toBe(0) // already imaged → skipped
    expect(out).toBe(sd) // nothing changed → original returned
  })

  it('keeps any existing image when rendering returns null (failure)', async () => {
    // Two included graphs: one missing an image (render fails), one already
    // imaged. The failure must not disturb either image.
    const sd = envelope({ co2: { include: true, imageDataUrl: PNG }, pm: { include: true } })
    const out = await ensureLoggerChartImages(sd, { renderChartToPng: () => Promise.resolve(null) })
    expect(out.graphs.co2.imageDataUrl).toBe(PNG)
    expect(out.graphs.pm.imageDataUrl).toBeUndefined()
  })

  it('skips graphs that are not flagged for inclusion', async () => {
    const sd = envelope({ pm: { include: false } })
    let rendered = 0
    const out = await ensureLoggerChartImages(sd, { renderChartToPng: () => { rendered++; return Promise.resolve(FAKE) } })
    expect(rendered).toBe(0)
    expect(out).toBe(sd) // nothing to do → original returned
  })

  it('never re-renders cross-dataset overlays (co2-diff / zones-*)', async () => {
    const sd = envelope({ 'co2-diff': { include: true }, 'zones-co2': { include: true } })
    let rendered = 0
    const out = await ensureLoggerChartImages(sd, { renderChartToPng: () => { rendered++; return Promise.resolve(FAKE) } })
    expect(rendered).toBe(0)
    expect(out.graphs['co2-diff'].imageDataUrl).toBeUndefined()
  })

  it('does not mutate the original sensorData', async () => {
    const sd = envelope({ pm: { include: true } })
    const snapshot = JSON.stringify(sd)
    await ensureLoggerChartImages(sd, { renderChartToPng: () => Promise.resolve(FAKE) })
    expect(JSON.stringify(sd)).toBe(snapshot)
  })

  it('is a safe no-op without graphs or points', async () => {
    expect(await ensureLoggerChartImages(null)).toBeNull()
    expect(await ensureLoggerChartImages({ graphs: {} })).toEqual({ graphs: {} })
    const noPoints = envelope({ pm: { include: true } })
    noPoints.datasets[0].points = []
    expect(await ensureLoggerChartImages(noPoints)).toBe(noPoints)
  })
})

/**
 * composeChartFigure — the SVG the raster is made from. Recharts renders a
 * chart's legend BEFORE its plot in DOM order, each legend item carrying a
 * 14×14 icon <svg>; `querySelector('svg')` therefore returned a legend icon
 * for every chart with a legend, and the report printed a single colored
 * stroke stretched to figure size — a solid bar — for PM2.5/PM10,
 * temperature & RH and the multi-parameter comparison, while the
 * legend-less single-series charts rendered correctly. These pin that the
 * figure is built from the plot surface(s), stacks small-multiple panels,
 * and carries the legend as text.
 */
const W = 664, H = 284
const data = Array.from({ length: 12 }, (_, i) => ({ t: 1725000000000 + i * 600000, co2: 600 + i * 20, pm25: 5 + i, pm10: 10 + i, temp: 70 + i * 0.2, rh: 40 + i }))
const chartProps = { data, hasTs: true, units: {}, palette: LIGHT_PALETTE, width: W, height: H }
const parse = (xml) => new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement

// jsdom lays nothing out, so a measurer stands in for getBoundingClientRect:
// plot surfaces stack by their declared heights, legend items sit in a row
// along the bottom edge.
function fakeMeasure() {
  let surfaceY = 0, legendX = 60, n = 0
  return (el) => {
    if (el.tagName.toLowerCase() === 'svg' && el.parentElement.classList.contains('recharts-wrapper')) {
      const h = Number(el.getAttribute('height'))
      const m = { x: 0, y: surfaceY, width: Number(el.getAttribute('width')), height: h }
      surfaceY += h
      return m
    }
    const isIcon = el.tagName.toLowerCase() === 'svg'
    const m = isIcon ? { x: legendX, y: H - 16, width: 14, height: 14 } : { x: legendX + 18, y: H - 16, width: 40, height: 14 }
    if (!isIcon) { legendX += 80; n++ }
    return m
  }
}

describe('composeChartFigure', () => {
  it('builds the PM figure from the plot surface, not a legend icon, and names both series', () => {
    const { container } = render(<PMTimelineChart {...chartProps} />)
    const root = parse(composeChartFigure(container, W, H, { measure: fakeMeasure() }))
    expect(root.getAttribute('width')).toBe(String(W))
    expect(root.getAttribute('height')).toBe(String(H))
    const nested = Array.from(root.querySelectorAll('svg'))
    expect(nested.length).toBe(1)
    expect(nested[0].getAttribute('width')).toBe(String(W)) // the 664-wide plot, never the 14px icon
    expect(nested[0].querySelectorAll('path.recharts-curve').length).toBe(2)
    const labels = Array.from(root.querySelectorAll('text')).map((t) => t.textContent)
    expect(labels).toContain('PM2.5')
    expect(labels).toContain('PM10')
    // Legend strokes carry the series colors, so the labels resolve the lines.
    const strokes = Array.from(root.querySelectorAll(':scope > line')).map((l) => l.getAttribute('stroke')).sort()
    expect(strokes).toEqual([LIGHT_PALETTE.series.pm25, LIGHT_PALETTE.series.pm10].sort())
  })

  it('stacks both small-multiple panels of the temperature & RH chart', () => {
    const { container } = render(<TempHumidityChart {...chartProps} />)
    const root = parse(composeChartFigure(container, W, H, { measure: fakeMeasure() }))
    const panels = Array.from(root.querySelectorAll('svg'))
    expect(panels.length).toBe(2)
    expect(panels.map((p) => p.getAttribute('y'))).toEqual(['0', '142'])
    expect(panels.every((p) => p.querySelector('path.recharts-curve'))).toBe(true)
    const labels = Array.from(root.querySelectorAll('text')).map((t) => t.textContent)
    expect(labels).toContain('Temperature')
    expect(labels).toContain('Relative Humidity')
  })

  it('composes the multi-parameter comparison with every selected series', () => {
    const { container } = render(<MultiParameterChart {...chartProps} params={['co2', 'temp', 'rh']} />)
    const root = parse(composeChartFigure(container, W, H, { measure: fakeMeasure() }))
    expect(root.querySelectorAll('svg')[0].querySelectorAll('path.recharts-curve').length).toBe(3)
    expect(root.querySelectorAll(':scope > line').length).toBe(3)
  })

  it('still composes a legend-less single-series chart', () => {
    const { container } = render(<CO2TimelineChart {...chartProps} />)
    const root = parse(composeChartFigure(container, W, H, { measure: fakeMeasure() }))
    expect(root.querySelectorAll('svg').length).toBe(1)
    expect(root.querySelectorAll('svg')[0].querySelectorAll('path.recharts-curve').length).toBe(1)
    expect(root.querySelectorAll(':scope > line').length).toBe(0)
  })

  it('names system faces instead of the app font variable', () => {
    const { container } = render(<PMTimelineChart {...chartProps} />)
    const xml = composeChartFigure(container, W, H, { measure: fakeMeasure() })
    expect(xml).not.toContain('var(--font-sans)')
  })

  it('returns null when nothing is drawn', () => {
    const host = document.createElement('div')
    expect(composeChartFigure(host, W, H)).toBeNull()
  })
})
