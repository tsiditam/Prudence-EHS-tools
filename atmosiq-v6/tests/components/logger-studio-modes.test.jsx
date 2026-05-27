// @vitest-environment jsdom
/**
 * Logger Studio — Overview / Analysis / Report modes (Stage 2).
 *
 * A segmented switcher splits the page into three views. Overview holds the
 * file summary; Analysis holds the controls + a parameter tab strip showing
 * one chart at a time; Report lists every chart for curation. Per the Hybrid
 * decision, Analysis charts carry only a quick Include toggle — caption and
 * export move to the Report tab.
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
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Upload Logger Data/i })) })
  const input = container.querySelector('input[type="file"]')
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }) })
  await act(async () => {})
}
const tab = (name) => act(async () => { fireEvent.click(screen.getByRole('tab', { name })) })

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => setReducedMotion(true))

describe('Logger Studio modes', () => {
  it('defaults to Overview and routes content to Analysis / Report', async () => {
    const { container } = render(<Harness />)
    await upload(container, makeFile(INDOOR, 'indoor.csv'))

    // Overview (default): session header present; Analysis controls absent.
    expect(screen.getByText('Session Averages')).toBeTruthy()
    expect(screen.queryByText('Compare datasets')).toBeNull()
    expect(screen.queryByText('Charts')).toBeNull()

    // Analysis: controls + parameter tab strip + the active chart; the file
    // summary is gone, and per Hybrid there is no caption/export here.
    await tab('Analysis')
    expect(screen.getByText('Compare datasets')).toBeTruthy()
    expect(screen.getByText('Charts')).toBeTruthy()
    expect(screen.getByText('CO₂ Over Time')).toBeTruthy()
    expect(screen.queryByText('Session Averages')).toBeNull()
    expect(screen.queryByText('Export PNG')).toBeNull()

    // Report: the chart listed with caption/export controls.
    await tab(/Report/)
    expect(screen.getByText('CO₂ Over Time')).toBeTruthy()
    expect(screen.getByText('Export PNG')).toBeTruthy()
  })
})
