// @vitest-environment jsdom
/**
 * Logger Studio Phase B — overlay charts + multi-file page flow.
 *
 * (1) The differential + multi-zone charts draw their STD-sourced lines and
 * per-series legends. (2) Uploading an indoor logger then adding an outdoor
 * baseline surfaces the ventilation differential (cfm/person estimate);
 * adding a second zone surfaces the zone comparison.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'
import { Co2DifferentialChart, MultiZoneChart } from '../../src/components/sensor/SensorCharts'
import { STD } from '../../src/constants/standards'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Co2DifferentialChart', () => {
  const rows = [
    { t: 0, indoor: 1100, outdoor: 420, diff: 680 },
    { t: 60000, indoor: 1200, outdoor: 430, diff: 770 },
  ]
  it('draws the ASHRAE differential reference (STD.v.co2.diff) and labels indoor/outdoor', () => {
    const { container } = render(<Co2DifferentialChart points={rows} width={520} height={260} showRefs />)
    expect(container.textContent).toContain(String(STD.v.co2.diff))
    expect(container.textContent).toContain('Indoor CO₂')
    expect(container.textContent).toContain('Outdoor CO₂')
  })
})

describe('MultiZoneChart', () => {
  const points = [{ t: 0, a: 800, b: 1000 }, { t: 60000, a: 850, b: 1100 }]
  const zones = [{ id: 'a', label: 'Conference Room A' }, { id: 'b', label: 'Server Room' }]
  it('renders one labelled line per zone and the CO₂ advisory when enabled', () => {
    const { container } = render(<MultiZoneChart points={points} zones={zones} param="co2" units={{ co2: 'ppm' }} width={520} height={260} showRefs />)
    expect(container.textContent).toContain('Conference Room A')
    expect(container.textContent).toContain('Server Room')
    expect(container.textContent).toContain(String(STD.v.co2.con))
  })
})

// ── Page flow ─────────────────────────────────────────────────────────────
const INDOOR = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,1100\n2026-05-01 09:05,1150\n2026-05-01 09:10,1200'
const OUTDOOR = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,420\n2026-05-01 09:05,425\n2026-05-01 09:10,430'
const ZONE = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,900\n2026-05-01 09:05,950\n2026-05-01 09:10,1000'

function makeFile(text, name) {
  const f = new File([text], name, { type: 'text/csv' })
  if (typeof f.text !== 'function') f.text = () => Promise.resolve(text)
  return f
}
function setReducedMotion(matches) {
  window.matchMedia = (q) => ({ matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}
function Harness() {
  const [value, setValue] = useState(null)
  return <SensorDataPage value={value} onChange={setValue} />
}
async function changeFile(container, file) {
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}

describe('Logger Studio multi-file flow', () => {
  beforeEach(() => setReducedMotion(true)) // skip the analyzing animation

  it('surfaces the ventilation differential and zone comparison as datasets are added', async () => {
    const { container } = render(<Harness />)

    // 1) Indoor upload (default target). Compare datasets lives under Analysis.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload Logger Data/i })) })
    await changeFile(container, makeFile(INDOOR, 'indoor.csv'))
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Analysis' })) })
    expect(screen.getByText('Compare datasets')).toBeTruthy()
    expect(screen.queryByText('Indoor vs Outdoor')).toBeNull()

    // Compare datasets is a collapsed section by default — expand it first.
    await act(async () => { fireEvent.click(screen.getByText('Compare datasets')) })

    // 2) Add an outdoor baseline → the differential surfaces as a chart tab.
    const roleSelect = container.querySelector('select[aria-label="Dataset role"]')
    await act(async () => { fireEvent.change(roleSelect, { target: { value: 'outdoor' } }) })
    await act(async () => { fireEvent.click(screen.getByText('Add file')) })
    await changeFile(container, makeFile(OUTDOOR, 'outdoor.csv'))
    expect(screen.getByText('Indoor vs Outdoor')).toBeTruthy()

    // 3) Add a named zone → the zone comparison surfaces as a chart tab.
    await act(async () => { fireEvent.change(roleSelect, { target: { value: 'zone' } }) })
    const labelInput = container.querySelector('input[placeholder^="Zone label"]')
    await act(async () => { fireEvent.change(labelInput, { target: { value: 'Conference Room A' } }) })
    await act(async () => { fireEvent.click(screen.getByText('Add file')) })
    await changeFile(container, makeFile(ZONE, 'zoneA.csv'))
    expect(screen.getByText('Zone Comparison')).toBeTruthy()

    // The Report tab lists every chart block — the differential (with its
    // cfm/person estimate) and the zone comparison render there.
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: /Report/ })) })
    expect(screen.getByText('Indoor vs Outdoor CO₂')).toBeTruthy()
    expect(screen.getByText('Est. outdoor air')).toBeTruthy()
    expect(screen.getByText(/Zone Comparison —/)).toBeTruthy()
  })
})
