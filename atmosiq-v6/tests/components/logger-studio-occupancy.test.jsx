// @vitest-environment jsdom
/**
 * Logger Studio Phase C — occupancy-period tagging.
 *
 * (1) Charts render one shaded ReferenceArea per occupancy window.
 * (2) On the page, a timestamped logger surfaces the occupancy editor, and
 * presets add / remove windows (persisted on the envelope).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'
import { CO2TimelineChart } from '../../src/components/sensor/SensorCharts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const co2Series = [{ t: 0, co2: 800 }, { t: 60000, co2: 900 }, { t: 120000, co2: 1000 }]

describe('occupancy shading', () => {
  it('draws one ReferenceArea per window, none without', () => {
    const occ = [
      { id: 'w1', start: 0, end: 60000, kind: 'occupied' },
      { id: 'w2', start: 60000, end: 120000, kind: 'unoccupied' },
    ]
    const on = render(<CO2TimelineChart data={co2Series} occupancy={occ} width={500} height={240} />)
    expect(on.container.querySelectorAll('.recharts-reference-area').length).toBe(2)
    cleanup()
    const off = render(<CO2TimelineChart data={co2Series} occupancy={[]} width={500} height={240} />)
    expect(off.container.querySelectorAll('.recharts-reference-area').length).toBe(0)
  })
})

// ── Page editor ─────────────────────────────────────────────────────────────
const INDOOR_TS = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,1100\n2026-05-01 09:05,1150\n2026-05-01 09:10,1200'
const NO_TS = 'CO2 (ppm)\n1100\n1150\n1200'

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
async function upload(container, file) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload Logger Data/i })) })
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}

describe('occupancy editor on the page', () => {
  beforeEach(() => setReducedMotion(true))

  it('appears for timestamped data and presets add / remove a period', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(INDOOR_TS, 'indoor.csv'))

    // Occupancy lives under the Analysis tab, collapsed by default.
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Analysis' })) })
    expect(screen.getByText('Occupancy periods')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText('Occupancy periods')) })
    const removesBefore = screen.queryAllByRole('button', { name: /^Remove/ }).length

    await act(async () => { fireEvent.click(screen.getByText('+ Occupied (all)')) })
    const removesAfter = screen.queryAllByRole('button', { name: /^Remove/ }).length
    expect(removesAfter).toBe(removesBefore + 1)

    // Remove the period we just added.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove Occupied' })) })
    expect(screen.queryAllByRole('button', { name: /^Remove/ }).length).toBe(removesBefore)
  })

  it('is hidden when the logger has no timestamps', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(NO_TS, 'rows.csv'))
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Analysis' })) })
    expect(screen.queryByText('Occupancy periods')).toBeNull()
  })
})
