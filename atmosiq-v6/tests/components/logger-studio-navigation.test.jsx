// @vitest-environment jsdom
/**
 * Logger Studio — from a forensic pattern to the chart window behind it.
 *
 * The Forensics panel emits a navigation request; SensorDataPage owns what
 * happens next: switch to Analysis, land on the most relevant chart, mark the
 * window and zoom to it, and drop the focus the moment the data changes.
 * The charts themselves draw the focus as bands and clip the axis to it.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'
import { CO2TimelineChart, focusDomain, focusTicks, timeAxis, DARK_PALETTE, FOCUS_PAD_MIN_MS, GRAPH_DEFS } from '../../src/components/sensor/SensorCharts'
import { chartForNavigation } from '../../src/components/sensor/sensorHelpers'
import { forensicInputFromEnvelope } from '../../src/components/sensor/ForensicsPanel'
import { buildForensicBundle } from '../../src/utils/forensicBundle'
import { representativeOccurrence } from '../../src/utils/forensicPresent'
import { normalizeSensorData } from '../../src/utils/sensorParser'

afterEach(() => { cleanup(); vi.useRealTimers() })

// ── The charts draw a focus ────────────────────────────────────────────────
describe('a focused window on a chart', () => {
  const series = Array.from({ length: 24 }, (_, i) => ({ t: i * 3600_000, co2: 500 + (i % 5) }))

  it('draws every window as a band and the selected one emphasized; none without a focus', () => {
    const focus = { start: 5 * 3600_000, end: 6 * 3600_000, occurrenceId: 'a', zoom: true, windows: [{ id: 'a', start: 5 * 3600_000, end: 6 * 3600_000 }, { id: 'b', start: 10 * 3600_000, end: 11 * 3600_000 }] }
    const on = render(<CO2TimelineChart data={series} focus={focus} width={500} height={240} />)
    expect(on.container.querySelectorAll('.sd-focus').length).toBe(2)
    expect(on.container.querySelectorAll('.sd-focus-selected').length).toBe(1)
    cleanup()
    const off = render(<CO2TimelineChart data={series} width={500} height={240} />)
    expect(off.container.querySelectorAll('.sd-focus').length).toBe(0)
  })

  it('zooms the time axis to the window with context, clamped to the data, and not when zoom is off', () => {
    const focus = { start: 5 * 3600_000, end: 6 * 3600_000, zoom: true }
    const dom = focusDomain(focus, series)
    expect(dom[0]).toBe(5 * 3600_000 - 1.5 * 3600_000)
    expect(dom[1]).toBe(6 * 3600_000 + 1.5 * 3600_000)
    // A short window still gets at least the minimum context either side.
    const brief = focusDomain({ start: 5 * 3600_000, end: 5 * 3600_000 + 60_000, zoom: true }, series)
    expect(brief[0]).toBe(5 * 3600_000 - FOCUS_PAD_MIN_MS)
    // Clamped to the run.
    expect(focusDomain({ start: 0, end: 3600_000, zoom: true }, series)[0]).toBe(0)
    expect(focusDomain({ ...focus, zoom: false }, series)).toBeNull()
    expect(focusDomain(null, series)).toBeNull()
    const zoomed = timeAxis(DARK_PALETTE, true, dom)
    expect(zoomed.domain).toEqual(dom)
    expect(zoomed.allowDataOverflow).toBe(true)
    // The zoomed axis states its own ticks, all inside the window and evenly
    // spaced — never the run's first and last readings pinned at the edges.
    expect(zoomed.ticks).toEqual(focusTicks(dom))
    expect(zoomed.ticks.length).toBeGreaterThanOrEqual(3)
    expect(zoomed.ticks.length).toBeLessThanOrEqual(6)
    zoomed.ticks.forEach((t) => { expect(t).toBeGreaterThanOrEqual(dom[0]); expect(t).toBeLessThanOrEqual(dom[1]) })
    const gaps = new Set(zoomed.ticks.slice(1).map((t, i) => t - zoomed.ticks[i]))
    expect(gaps.size).toBe(1)
    expect(focusTicks(null)).toBeUndefined()
    expect(focusTicks([5, 5])).toBeUndefined()
    const whole = timeAxis(DARK_PALETTE, true)
    expect(whole.domain).toEqual(['dataMin', 'dataMax'])
    expect(whole.allowDataOverflow).toBeUndefined()
  })
})

// ── Which chart ────────────────────────────────────────────────────────────
describe('chartForNavigation', () => {
  const graph = (id) => ({ key: id, kind: 'graph', def: GRAPH_DEFS.find((g) => g.id === id) })
  const tabs = [graph('co2'), graph('pm'), graph('tvoc'), graph('hcho'), { key: 'multi', kind: 'multi' }, { key: 'co2-diff', kind: 'diff' }, { key: 'zones', kind: 'zone' }]
  const datasets = [{ id: 'primary', role: 'indoor' }, { id: 'ds-out', role: 'outdoor' }, { id: 'ds-z1', role: 'zone' }]

  it('lands a zone pattern on the zone overlay, on that parameter', () => {
    expect(chartForNavigation({ params: ['co2'], datasetIds: ['ds-z1'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'zones', zoneParam: 'co2' })
  })
  it('lands an indoor/outdoor CO₂ pattern on the differential chart', () => {
    expect(chartForNavigation({ params: ['co2'], datasetIds: ['primary', 'ds-out'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'co2-diff' })
    // Other parameters have no differential chart: their own timeline.
    expect(chartForNavigation({ params: ['pm25'], datasetIds: ['primary', 'ds-out'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'pm' })
  })
  it('lands a two-parameter pattern on the multi-parameter chart with those selected', () => {
    expect(chartForNavigation({ params: ['hcho', 'tvoc'], datasetIds: ['primary'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'multi', multiParams: ['hcho', 'tvoc'] })
  })
  it('otherwise the parameter’s own timeline, or the first tab', () => {
    expect(chartForNavigation({ params: ['tvoc'], datasetIds: ['primary'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'tvoc' })
    expect(chartForNavigation({ params: ['pm10'], datasetIds: ['primary'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'pm' })
    expect(chartForNavigation({ params: ['press'], datasetIds: ['primary'] }, { chartTabs: tabs, datasets })).toEqual({ key: 'co2' })
    expect(chartForNavigation({ params: ['co2'] }, { chartTabs: [] })).toBeNull()
    expect(chartForNavigation(null, { chartTabs: tabs })).toBeNull()
  })
})

// ── The page ───────────────────────────────────────────────────────────────
// One day of 15-minute readings with TVOC and formaldehyde spiking together —
// the coincidence pattern, which needs no second dataset and no annotation.
const pad = (n) => String(n).padStart(2, '0')
const COINCIDENT = ['Timestamp,TVOC (ppb),HCHO (ppb)']
for (let i = 0; i < 96; i++) {
  const h = Math.floor(i / 4); const m = (i % 4) * 15
  const spike = i >= 40 && i <= 42
  COINCIDENT.push(`2026-05-01 ${pad(h)}:${pad(m)},${spike ? 900 : 100 + (i % 3)},${spike ? 140 : 20 + (i % 3)}`)
}
const CSV = COINCIDENT.join('\n')

function makeFile(text, name) {
  const f = new File([text], name, { type: 'text/csv' })
  if (typeof f.text !== 'function') f.text = () => Promise.resolve(text)
  return f
}
function setReducedMotion(m) {
  window.matchMedia = (q) => ({ matches: m, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}
let latest = null
function Harness() {
  const [value, setValue] = useState(null)
  const change = (v) => { latest = v; setValue(v) }
  return (
    <>
      <SensorDataPage value={value} onChange={change} />
      {/* A data change from outside the page: the same readings, replaced. */}
      <button type="button" onClick={() => change({ ...value, datasets: value.datasets.map((d) => ({ ...d })) })}>replace-datasets</button>
    </>
  )
}
async function upload(container, file) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload Data/i })) })
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}
const tab = (name) => act(async () => { fireEvent.click(screen.getByRole('tab', { name })) })
// The first matching button: several patterns each offer "View on chart", and
// the first belongs to the first pattern row that has a window to show.
const click = (name) => act(async () => { fireEvent.click(screen.getAllByRole('button', { name })[0]) })

beforeEach(() => { setReducedMotion(true); latest = null })

describe('View on chart, from the page', () => {
  it('switches to Analysis, targets the right chart, and marks the window', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(CSV, 'indoor.csv'))
    await tab('Forensics')
    expect(screen.getAllByText(/Coincident parameter events/).length).toBeGreaterThan(0)

    // What the panel will have resolved, from the same envelope.
    const env = normalizeSensorData(latest)
    const bundle = buildForensicBundle(forensicInputFromEnvelope(env))
    const first = bundle.patterns.find((p) => representativeOccurrence(p))
    const rep = representativeOccurrence(first)

    await click('View on chart')

    // Analysis, on the multi-parameter chart with the pattern's parameters.
    expect(screen.getByText('Charts')).toBeTruthy()
    expect(screen.queryByText('Patterns detected')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Multi-Parameter', selected: true })).toBeTruthy()
    expect(screen.getByText('Multi-Parameter Comparison')).toBeTruthy()

    // The focus banner names the window the panel resolved, and is zoomed.
    const banner = screen.getByTestId('chart-focus')
    expect(banner.getAttribute('data-focus-pattern')).toBe(first.id)
    expect(banner.getAttribute('data-focus-start')).toBe(String(rep.start))
    expect(banner.getAttribute('data-focus-end')).toBe(String(rep.end))
    expect(banner.textContent).toMatch(/Coincident parameter events/)
    expect(banner.textContent).toMatch(/May 1 · /)
    expect(screen.getByRole('button', { name: 'Show full run' })).toBeTruthy()

    // Widen back to the whole run; the band stays, the zoom goes.
    await click('Show full run')
    expect(screen.getByRole('button', { name: 'Zoom to window' })).toBeTruthy()
    expect(screen.getByTestId('chart-focus')).toBeTruthy()

    // Back to Forensics and forward again: the focus is chart state, kept.
    await click('Back to Forensics')
    expect(screen.getByText('Patterns detected')).toBeTruthy()
    await tab('Analysis')
    expect(screen.getByTestId('chart-focus')).toBeTruthy()

    // Clear drops it.
    await click('Clear')
    expect(screen.queryByTestId('chart-focus')).toBeNull()
  })

  it('drops the focus when the data it was resolved against is replaced', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(CSV, 'indoor.csv'))
    await tab('Forensics')
    await click('View on chart')
    expect(screen.getByTestId('chart-focus')).toBeTruthy()
    // A reference-line toggle is not a data change: the focus survives it.
    const chip = screen.queryByRole('button', { name: /Reference lines/ })
    if (chip) { await act(async () => { fireEvent.click(chip) }) }
    expect(screen.getByTestId('chart-focus')).toBeTruthy()
    await click('replace-datasets')
    expect(screen.queryByTestId('chart-focus')).toBeNull()
  })
})
