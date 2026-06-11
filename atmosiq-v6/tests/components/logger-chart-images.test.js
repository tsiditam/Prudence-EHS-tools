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
import { ensureLoggerChartImages } from '../../src/utils/loggerChartImages'

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
