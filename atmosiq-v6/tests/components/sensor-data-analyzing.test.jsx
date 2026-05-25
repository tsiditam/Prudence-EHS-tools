// @vitest-environment jsdom
/**
 * SensorDataPage — post-upload "analyzing" reveal.
 *
 * After a successful upload the parsed results are held behind a short
 * processing animation, then revealed. Under prefers-reduced-motion the
 * delay is skipped (instant). Pins both paths.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'

const CSV = 'Timestamp,CO2 (ppm)\n2026-05-01 09:00,500\n2026-05-01 09:05,700\n2026-05-01 09:10,900'

function Harness() {
  const [value, setValue] = useState(null)
  return <SensorDataPage value={value} onChange={setValue} />
}

function makeFile() {
  const file = new File([CSV], 'logger.csv', { type: 'text/csv' })
  // jsdom File may not implement async text(); guarantee it.
  if (typeof file.text !== 'function') file.text = () => Promise.resolve(CSV)
  return file
}

function setReducedMotion(matches) {
  window.matchMedia = (q) => ({ matches, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false } })
}

async function uploadCsv(container) {
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [makeFile()] } }) })
  await act(async () => {}) // flush onPick's await file.text() + state updates
}

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('SensorDataPage analyzing reveal', () => {
  beforeEach(() => setReducedMotion(false))

  it('shows the analyzing animation on upload, then reveals results after the delay', async () => {
    vi.useFakeTimers()
    const { container } = render(<Harness />)
    await uploadCsv(container)

    // During analyzing: processing card visible, results hidden.
    expect(screen.getByText(/Analyzing sensor data/i)).toBeTruthy()
    expect(screen.queryByText('Readings')).toBeNull()

    // After the delay the results appear and the analyzing card is gone.
    await act(async () => { vi.advanceTimersByTime(ANALYZE_TOTAL) })
    expect(screen.queryByText(/Analyzing sensor data/i)).toBeNull()
    expect(screen.getByText('Readings')).toBeTruthy()
  })

  it('reveals results immediately under prefers-reduced-motion (no delay)', async () => {
    setReducedMotion(true)
    const { container } = render(<Harness />)
    await uploadCsv(container)
    expect(screen.queryByText(/Analyzing sensor data/i)).toBeNull()
    expect(screen.getByText('Readings')).toBeTruthy()
  })
})

// A hair past the component's ANALYZE_MS (2600).
const ANALYZE_TOTAL = 2800
