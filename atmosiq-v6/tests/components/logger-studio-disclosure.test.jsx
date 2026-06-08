// @vitest-environment jsdom
/**
 * Logger Studio — progressive disclosure (Stage 1).
 *
 * The secondary analysis tools (Reference lines, Compare datasets, Occupancy
 * periods) render as collapsed sections by default — their headers show, but
 * their controls stay hidden until the section is expanded. This keeps the
 * charts from competing with a wall of inline controls.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'

const INDOOR = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,1100\n2026-05-01 09:05,1150\n2026-05-01 09:10,1200'

function makeFile(text, name) {
  const f = new File([text], name, { type: 'text/csv' })
  if (typeof f.text !== 'function') f.text = () => Promise.resolve(text)
  return f
}
function setReducedMotion(m) {
  window.matchMedia = (q) => ({ matches: m, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}
function Harness() {
  const [value, setValue] = useState(null)
  return <SensorDataPage value={value} onChange={setValue} />
}
async function upload(container, file) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload Data/i })) })
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => setReducedMotion(true))

describe('Logger Studio progressive disclosure', () => {
  it('renders the secondary tools collapsed, then reveals them on expand', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(INDOOR, 'indoor.csv'))

    // The secondary tools live under the Analysis tab.
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Analysis' })) })

    // Headers present...
    expect(screen.getByText('Reference lines')).toBeTruthy()
    expect(screen.getByText('Compare datasets')).toBeTruthy()
    expect(screen.getByText('Occupancy periods')).toBeTruthy()

    // ...but their bodies are collapsed.
    expect(screen.queryByText(/CO₂ 1000 ppm/)).toBeNull()
    expect(screen.queryByText('Add file')).toBeNull()
    expect(screen.queryByText('+ Occupied (all)')).toBeNull()

    // Expanding each reveals its controls (CO₂ chip reads "✓ CO₂ 1000 ppm").
    await act(async () => { fireEvent.click(screen.getByText('Reference lines')) })
    expect(screen.getByText(/CO₂ 1000 ppm/)).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByText('Compare datasets')) })
    expect(screen.getByText('Add file')).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByText('Occupancy periods')) })
    expect(screen.getByText('+ Occupied (all)')).toBeTruthy()
  })
})
