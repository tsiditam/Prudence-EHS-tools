// @vitest-environment jsdom
/**
 * MonitoringReportSheet — the Logger Studio entry point.
 *
 * The sheet decides nothing about the report's contents; what it decides is
 * which INPUTS reach the generator. That is where this surface can do real
 * damage, so the tests here are about the handoff rather than the markup:
 *
 *   • the session it builds carries the fields the assessor typed
 *   • only MARKED OCCUPIED windows become the occupancy schedule
 *   • the dataset fingerprint covers the readings, not the paperwork
 *   • the site offset is taken at the data's own start, not at "now"
 *   • a failed generation SAYS so instead of closing as though it worked
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const generateMonitoringReport = vi.fn()
vi.mock('../../src/components/docx/monitoring-report', () => ({
  generateMonitoringReport: (...args: unknown[]) => generateMonitoringReport(...args),
}))
vi.mock('../../src/utils/profiles', () => ({
  default: { getActiveProfile: () => Promise.resolve(null), save: vi.fn() },
}))

import MonitoringReportSheet, { siteOffsetMinutes } from '../../src/components/sensor/MonitoringReportSheet'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

function dataset() {
  const points: any[] = []
  for (let i = 0; i < 60; i++) {
    const hour = (i / 6) % 24
    points.push({ t: T0 + i * 10 * MIN, co2: hour >= 8 && hour < 18 ? 1100 : 480, temp: 71 })
  }
  return {
    fileName: 'qtrak.csv',
    role: 'indoor',
    hasTimestamps: true,
    params: ['co2', 'temp'],
    units: { co2: 'ppm', temp: '°F' },
    points,
    summary: { count: points.length, start: points[0].t, end: points[points.length - 1].t },
    quality: { level: 'ok', status: 'Clean', flags: [] },
  }
}

const lastCall = () => generateMonitoringReport.mock.calls[generateMonitoringReport.mock.calls.length - 1]

beforeEach(() => {
  generateMonitoringReport.mockReset()
  generateMonitoringReport.mockResolvedValue({ fileName: 'AtmosFlow-Monitoring-Report-Tower.docx', model: {} })
})
afterEach(cleanup)

const open = (props: Record<string, unknown> = {}) =>
  render(<MonitoringReportSheet data={dataset()} onClose={() => {}} {...props} />)

const generate = () => fireEvent.click(screen.getByText(/Generate report/i))

describe('what the sheet hands the generator', () => {
  it('passes the typed fields through as a monitoring session', async () => {
    open()
    fireEvent.change(screen.getByPlaceholderText('Building'), { target: { value: 'Meridian Tower' } })
    fireEvent.change(screen.getByPlaceholderText('Serial'), { target: { value: 'QT-8891' } })
    fireEvent.change(screen.getByPlaceholderText('Client name'), { target: { value: 'Meridian Property Group' } })
    generate()

    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalled())
    const [session, opts] = lastCall()
    expect(session.location.building).toBe('Meridian Tower')
    expect(session.instrument.serial).toBe('QT-8891')
    expect(session.client.preparedFor).toBe('Meridian Property Group')
    expect(session.datasets[0].params).toEqual(['co2', 'temp'])
    expect(opts.edition).toBe('client')
  })

  it('sends only the windows marked occupied', async () => {
    // An unoccupied window entered as occupancy would invert the occupied
    // mean, the difference bullet, and the shading on every figure.
    open({
      occupancyWindows: [
        { start: T0 + 8 * 60 * MIN, end: T0 + 18 * 60 * MIN, kind: 'occupied' },
        { start: T0 + 22 * 60 * MIN, end: T0 + 30 * 60 * MIN, kind: 'unoccupied' },
      ],
    })
    generate()

    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalled())
    const [session] = lastCall()
    expect(session.occupancySchedule).toHaveLength(1)
    expect(session.occupancySchedule[0].kind).toBe('occupied')
  })

  it('fingerprints the readings, and the same data twice yields the same hash', async () => {
    open()
    generate()
    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalled())
    const first = lastCall()[1].datasetHash

    cleanup()
    open({ occupancyWindows: [] })
    fireEvent.change(screen.getByPlaceholderText('Client name'), { target: { value: 'A different client' } })
    generate()
    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalledTimes(2))

    expect(first).toMatch(/^[0-9a-f]{8}…[0-9a-f]{4}$/)
    // Same readings, different paperwork — the fingerprint must not move.
    expect(lastCall()[1].datasetHash).toBe(first)
  })

  it('carries the edition through when Technical is chosen', async () => {
    open()
    fireEvent.click(screen.getByText('Technical'))
    generate()
    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalled())
    expect(lastCall()[1].edition).toBe('technical')
  })

  it('stamps a generation time and the app version', async () => {
    open()
    generate()
    await waitFor(() => expect(generateMonitoringReport).toHaveBeenCalled())
    const opts = lastCall()[1]
    expect(opts.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(opts.softwareVersion).toBeTruthy()
  })
})

describe('the site offset', () => {
  it('is taken at the data’s own start, not at generation time', () => {
    // A report generated in January about a July campaign must still bucket
    // July's hours the way the site experienced them.
    const july = siteOffsetMinutes(Date.UTC(2026, 6, 15))
    const january = siteOffsetMinutes(Date.UTC(2026, 0, 15))
    expect(july).toBe(-new Date(Date.UTC(2026, 6, 15)).getTimezoneOffset())
    expect(january).toBe(-new Date(Date.UTC(2026, 0, 15)).getTimezoneOffset())
  })

  it('falls back to now rather than producing NaN', () => {
    expect(Number.isFinite(siteOffsetMinutes(NaN))).toBe(true)
    expect(Number.isFinite(siteOffsetMinutes(null as never))).toBe(true)
  })
})

describe('failure is reported, never swallowed', () => {
  it('shows the error instead of appearing to succeed', async () => {
    generateMonitoringReport.mockRejectedValue(new Error('Chart rendering failed'))
    const onClose = vi.fn()
    open({ onClose })
    generate()

    await waitFor(() => expect(screen.getByText(/Chart rendering failed/)).toBeTruthy())
    // The sheet stays open: silently closing would read as success and leave
    // the user hunting a file that never landed.
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText(/Report generated/)).toBeNull()
  })

  it('confirms with the file name on success', async () => {
    open()
    generate()
    await waitFor(() => expect(screen.getByText(/Report generated/)).toBeTruthy())
    expect(screen.getByText(/AtmosFlow-Monitoring-Report-Tower\.docx/)).toBeTruthy()
  })
})

describe('calibration is never silently absent', () => {
  it('warns that a blank calibration will be stated in the report', () => {
    open()
    expect(screen.getByText(/calibration was not documented/i)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Calibration date'), { target: { value: '2026-03-12' } })
    expect(screen.queryByText(/calibration was not documented/i)).toBeNull()
  })
})

describe('reference selection', () => {
  it('offers a yardstick per parameter that has more than one', () => {
    open()
    expect(screen.getByLabelText(/Reference for Carbon dioxide/i)).toBeTruthy()
  })

  it('renders nothing at all rather than an empty sheet with no data', () => {
    const { container } = render(<MonitoringReportSheet data={null} onClose={() => {}} />)
    expect(container.textContent).toBe('')
  })
})

describe('the whole Logger Studio path, against the real report', () => {
  // The tests above mock the generator to inspect the handoff. This one does
  // not: it takes a dataset in the shape sensorParser actually emits, runs it
  // through the real model and the real packer, and asserts a document comes
  // out. A wiring change that produced an empty report would pass every
  // assertion above and fail here.
  it('produces a real .docx with the parameters the logger captured', async () => {
    const { buildSessionFromLogger } = await import('../../src/components/sensor/MonitoringReportSheet')
    const { buildMonitoringReportModel } = await import('../../src/utils/monitoringReportModel')
    const { buildMonitoringReportDocument } = await vi.importActual<
      typeof import('../../src/components/docx/monitoring-report')
    >('../../src/components/docx/monitoring-report')
    const { Packer } = await import('docx')

    const session = buildSessionFromLogger({
      data: dataset(),
      occupancyWindows: [
        { start: T0 + 8 * 60 * MIN, end: T0 + 18 * 60 * MIN, kind: 'occupied' },
        { start: T0 + 22 * 60 * MIN, end: T0 + 26 * 60 * MIN, kind: 'unoccupied' },
      ],
      events: [{ id: 'e1', t: T0 + 60 * MIN, type: 'windows_opened' }],
      form: {
        objective: 'Document indoor environmental conditions.',
        location: { building: 'Meridian Tower', room: 'Suite 300' },
        instrument: { make: 'TSI', model: 'Q-Trak XP', serial: 'QT-8891' },
        calibrationDate: '2026-03-12',
        assessor: { name: 'T. Tamakloe', credentials: 'CSP' },
        client: { preparedFor: 'Meridian Property Group' },
        referenceProfiles: {},
      },
    })

    const model = buildMonitoringReportModel(session, {
      generatedAt: '2026-08-01T00:20:00.000Z',
      datasetHash: 'a19dd790…c8f4',
      softwareVersion: '6.0.0',
    })

    // The dataset survived the handoff and became report content.
    expect(model.parameters.map((p: any) => p.param)).toEqual(['co2', 'temp'])
    expect(model.cover.site).toBe('Meridian Tower — Suite 300')
    expect(model.highlights.length).toBeGreaterThan(0)
    expect(model.events).toHaveLength(1)
    // Only the occupied window reached the statistics.
    expect(session.occupancySchedule).toHaveLength(1)
    expect(model.parameters[0].stats.occupancy).toBeTruthy()

    const buf = await Packer.toBuffer(buildMonitoringReportDocument(model))
    expect(buf.length).toBeGreaterThan(2000)
    expect(buf[0]).toBe(0x50) // "PK" — a real zip, i.e. a real .docx
    expect(buf[1]).toBe(0x4b)
  }, 30_000)
})
