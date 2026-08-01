// @vitest-environment jsdom
/**
 * Logger Studio — why a report action is or isn't offered.
 *
 * Both report actions have preconditions the data may not meet. Both used to
 * satisfy them by DISAPPEARING, which is the worst available answer: the user
 * sees a feature that exists sometimes, learns nothing about what changed,
 * and has no way to discover that a one-click column mapping is all that
 * stands between them and the report.
 *
 * The rule pinned here: an unmet precondition is stated, not hidden. Hiding
 * is reserved for the one case where the action is genuinely meaningless —
 * no report to send averages TO.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SensorDataPage from '../../src/components/sensor/SensorDataPage'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

/** A parsed log in the shape `parseSensorRows` emits. */
function log({ params = ['co2', 'temp'], units = { co2: 'ppm', temp: '°F' }, hasTimestamps = true } = {}) {
  const points = Array.from({ length: 40 }, (_, i) => {
    const pt = { t: T0 + i * 10 * MIN }
    params.forEach((p) => { pt[p] = p === 'co2' ? 500 + i : 70 })
    return pt
  })
  const stats = {}
  params.forEach((p) => { stats[p] = { mean: p === 'co2' ? 520 : 70, median: 520, min: 500, max: 540, n: points.length } })
  return {
    fileName: 'qtrak.csv',
    role: 'indoor',
    params,
    units,
    columns: params.map((p) => ({ raw: p, role: 'param', param: p })),
    hasTimestamps,
    points,
    rawCount: points.length,
    summary: {
      count: points.length,
      start: hasTimestamps ? points[0].t : null,
      end: hasTimestamps ? points[points.length - 1].t : null,
      intervalSec: 600,
      stats,
    },
    quality: { level: 'ok', status: 'Clean', flags: [] },
  }
}

const page = (props = {}) =>
  render(<SensorDataPage value={log()} onChange={() => {}} onBack={() => {}} {...props} />)

const reportTab = () => fireEvent.click(screen.getByText('Report'))

afterEach(cleanup)

describe('the standalone monitoring report', () => {
  it('is offered when the log has timestamps', () => {
    page()
    reportTab()
    expect(screen.getByText('Generate report').closest('button').disabled).toBe(false)
    expect(screen.queryByText(/needs real timestamps/i)).toBeNull()
  })

  it('stays visible but disabled — with the reason — when timestamps are missing', () => {
    // This is the whole point. Coverage, time above a reference, the
    // hour-of-day profile and every figure's x-axis are measured against the
    // clock, so the report genuinely cannot be built. Saying so beats
    // vanishing.
    page({ value: log({ hasTimestamps: false }) })
    reportTab()
    expect(screen.getByText('Generate report').closest('button').disabled).toBe(true)
    expect(screen.getByText(/needs real timestamps/i)).toBeTruthy()
    expect(screen.getByText(/No timestamp column was detected/i)).toBeTruthy()
  })

  it('offers the fix, not just the diagnosis', () => {
    // The mapping panel can assign a timestamp column, so the message routes
    // there rather than leaving the user to find it.
    page({ value: log({ hasTimestamps: false }) })
    reportTab()
    fireEvent.click(screen.getByText(/Set your date\/time column/i))
    expect(screen.getByText(/Hide column mapping/i)).toBeTruthy()
  })
})

describe('sending averages into an assessment', () => {
  const reports = [{ id: 'r1', facility: 'Tower' }]

  it('is offered when the log carries parameters a zone can hold', () => {
    page({ onApplyAverages: () => {}, reports })
    expect(screen.getByText('Send averages to a report').closest('button').disabled).toBe(false)
  })

  it('names the parameters that have nowhere to go rather than vanishing', () => {
    // A formaldehyde-and-pressure log maps to no zone reading field at all.
    page({ value: log({ params: ['hcho', 'press'], units: { hcho: 'ppb', press: 'hPa' } }), onApplyAverages: () => {}, reports })
    const btn = screen.getByText('Send averages to a report').closest('button')
    expect(btn.disabled).toBe(true)
    expect(screen.getByText(/Formaldehyde has no zone field/i)).toBeTruthy()
    expect(screen.getByText(/Pressure has no zone field/i)).toBeTruthy()
  })

  it('explains a unit that cannot be converted, using the parser’s own reason', () => {
    page({ value: log({ params: ['tvoc'], units: { tvoc: 'index' } }), onApplyAverages: () => {}, reports })
    expect(screen.getByText('Send averages to a report').closest('button').disabled).toBe(true)
    expect(screen.getByText(/not convertible to µg\/m³/i)).toBeTruthy()
  })

  it('is hidden only when there is genuinely nowhere to send averages', () => {
    // No handler means no assessment to fill. A disabled button there would
    // advertise a capability this screen does not have.
    page()
    expect(screen.queryByText('Send averages to a report')).toBeNull()
  })
})
