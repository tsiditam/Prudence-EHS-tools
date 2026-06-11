// @vitest-environment jsdom
/**
 * LoggerGraphsTab — the "In report" inclusion control.
 *
 * Each logger timeline carries a switch that adds it to / drops it from the
 * report. When a handler is provided the control is an interactive toggle
 * (role="switch", reflecting the graph's include flag); with no handler it
 * falls back to a static "In report" badge. Pins that contract so the results
 * Logger tab (live and saved-report) can drive inclusion.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LoggerGraphsTab from '../../src/components/sensor/LoggerGraphsTab'

afterEach(() => cleanup())

// Minimal v2 envelope: one indoor CO₂ dataset + a graphs map. `include`
// drives whether the timeline is flagged for the report.
function sensorData(include) {
  return {
    version: 2,
    datasets: [{
      id: 'primary', role: 'indoor', label: 'Indoor', hasTimestamps: true,
      params: ['co2'], units: { co2: 'ppm' }, summary: { count: 2, start: 0, end: 60000 },
      points: [{ t: 0, co2: 800 }, { t: 60000, co2: 1000 }],
    }],
    occupancyWindows: [], thresholds: { co2: true },
    graphs: { co2: { include } },
  }
}

describe('LoggerGraphsTab inclusion toggle', () => {
  it('renders a switch reflecting the include flag and toggles it off on click', () => {
    const onToggle = vi.fn()
    render(<LoggerGraphsTab sensorData={sensorData(true)} editable onToggleInclude={onToggle} />)
    const sw = screen.getByRole('switch', { name: /Include .* in report/i })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(onToggle).toHaveBeenCalledTimes(1)
    // (id, nextInclude=false, meta) — flips off an included graph.
    expect(onToggle.mock.calls[0][0]).toBe('co2')
    expect(onToggle.mock.calls[0][1]).toBe(false)
  })

  it('reflects an excluded graph as an unchecked switch that toggles on', () => {
    const onToggle = vi.fn()
    render(<LoggerGraphsTab sensorData={sensorData(false)} editable onToggleInclude={onToggle} />)
    const sw = screen.getByRole('switch', { name: /Include .* in report/i })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onToggle.mock.calls[0][1]).toBe(true)
  })

  it('falls back to a static badge (no switch) when no handler is provided', () => {
    render(<LoggerGraphsTab sensorData={sensorData(true)} />)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('In report')).toBeTruthy()
  })
})
