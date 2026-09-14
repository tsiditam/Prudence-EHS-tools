// @vitest-environment jsdom
/**
 * ForensicsPanel — the evidence renders from the record with no model; the
 * reading is asked for once, stored on the envelope, shown labeled, and never
 * silently reused once the session has changed.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { useState } from 'react'
import ForensicsPanel, { forensicInputFromEnvelope } from '../../src/components/sensor/ForensicsPanel'
import { normalizeSensorData, SENSOR_DATA_VERSION } from '../../src/utils/sensorParser'
import { buildForensicBundle } from '../../src/utils/forensicBundle'
import { validateForensicOutput, buildForensicInterpretationRecord, refuseForensicOutput } from '../../src/utils/forensicValidate'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000
const multiDay = (days, f) => {
  const pts = []
  for (let d = 0; d < days; d++) for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  return pts
}
const mk = (id, role, label, points, params, units = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})
const envelope = () => normalizeSensorData({
  version: SENSOR_DATA_VERSION,
  datasets: [mk('primary', 'indoor', 'Indoor', multiDay(4, (_d, h) => ({ co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI) })), ['co2'], { co2: 'ppm' })],
  occupancyWindows: [], graphs: {}, thresholds: {},
})
const bundleOf = (env) => buildForensicBundle(forensicInputFromEnvelope(env))
const cycleOf = (env) => bundleOf(env).patterns.find((p) => p.kind === 'recurring_cycle')

const goodReading = (env) => ({
  pattern_id: cycleOf(env).id,
  title: 'Repeating daily swing',
  importance: 'worth_review',
  interpretation: 'The recurring shape is consistent with scheduled occupancy. It cannot distinguish that from mechanical operation and requires confirmation.',
  alternative_explanations: ['A timed system start may contribute to the same shape.'],
  missing_context_ids: cycleOf(env).missingContext.map((m) => m.id),
  recommended_reviews: ['Compare the pattern against the operating schedule; this warrants review.'],
  report_candidate: true,
  evidence_ids: [],
})
/** A generate() stub that returns a real, validated record for this envelope. */
const generating = (readings) => vi.fn(async (input) => {
  const bundle = buildForensicBundle(input)
  const validation = validateForensicOutput({ interpretations: readings(bundle) }, bundle)
  return { record: buildForensicInterpretationRecord({ bundle, validation, model: { provider: 'anthropic', name: 'm' } }), bundle, validation, error: null }
})

function Harness({ initial, generate }) {
  const [env, setEnv] = useState(initial)
  return <ForensicsPanel env={env} onPersist={(record) => setEnv({ ...env, forensicInterpretation: record })} generate={generate} />
}

afterEach(() => cleanup())

describe('the evidence renders from the record, with no model', () => {
  it('lists every detected pattern with its figures on an evidence line', () => {
    const env = envelope()
    render(<ForensicsPanel env={env} onPersist={() => {}} generate={vi.fn()} />)
    const rows = screen.getAllByTestId('forensic-pattern')
    expect(rows.length).toBe(bundleOf(env).patterns.length)
    const cycle = rows.find((r) => within(r).queryByText(/Recurring daily cycle/))
    expect(cycle).toBeTruthy()
    expect(within(cycle).getByText('peak hour 14:00')).toBeTruthy()
    expect(within(cycle).getByText('amplitude 400 ppm')).toBeTruthy()
    expect(screen.queryAllByTestId('forensic-reading')).toHaveLength(0)
  })

  it('says so, without an action, when nothing was detected', () => {
    const flat = normalizeSensorData({
      version: SENSOR_DATA_VERSION,
      datasets: [mk('primary', 'indoor', 'Indoor', multiDay(1, () => ({ co2: 600 })), ['co2'], { co2: 'ppm' })],
      occupancyWindows: [], graphs: {}, thresholds: {},
    })
    render(<ForensicsPanel env={flat} onPersist={() => {}} generate={vi.fn()} />)
    expect(screen.getByText('No forensic patterns were detected in this session.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Read the patterns/ })).toBeNull()
  })

  it('builds the bundle input from the envelope, reading context off the last report session', () => {
    const env = envelope()
    expect(forensicInputFromEnvelope(env).context).toEqual({})
    const withReport = { ...env, monitoringReport: { session: { objective: 'Complaint follow-up', location: { building: 'N' }, instrument: { make: 'A' }, calibration: { date: '2026-01-15', gas: 'Isobutylene' }, utcOffsetMin: -300 } } }
    const input = forensicInputFromEnvelope(withReport)
    expect(input.context.objective).toBe('Complaint follow-up')
    expect(input.utcOffsetMin).toBe(-300)
    expect(input.calibrationGas).toBe('Isobutylene')
    expect(forensicInputFromEnvelope(withReport, { calibrationGas: 'Toluene' }).calibrationGas).toBe('Toluene')
    expect(forensicInputFromEnvelope(null).sensorData).toBe(null)
  })
})

describe('the reading is asked for once, stored, and labeled', () => {
  it('persists a validated record on the envelope and shows it beside the evidence', async () => {
    const env = envelope()
    const generate = generating((b) => [goodReading(env)].map((r) => ({ ...r, pattern_id: b.patterns.find((p) => p.kind === 'recurring_cycle').id })))
    render(<Harness initial={env} generate={generate} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Read the patterns/ })) })
    expect(generate).toHaveBeenCalledTimes(1)
    const reading = screen.getByTestId('forensic-reading')
    expect(within(reading).getByText('Repeating daily swing')).toBeTruthy()
    expect(within(reading).getByText('Worth review')).toBeTruthy()
    expect(within(reading).getByText(/consistent with scheduled occupancy/)).toBeTruthy()
    expect(within(reading).getByText(/HVAC operating schedule\./)).toBeTruthy()
    expect(screen.getByText(/AI-assisted reading — verify before use/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Read again/ })).toBeTruthy()
  })

  it('shows a stored reading on mount without asking again', () => {
    const env = envelope()
    const bundle = bundleOf(env)
    const validation = validateForensicOutput({ interpretations: [goodReading(env)] }, bundle)
    const stored = { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation }) }
    const generate = vi.fn()
    render(<ForensicsPanel env={stored} onPersist={() => {}} generate={generate} />)
    expect(screen.getByTestId('forensic-reading')).toBeTruthy()
    expect(generate).not.toHaveBeenCalled()
  })

  it('labels a stored reading stale once the session changes, and keeps it dimmed rather than dropping it', () => {
    const env = envelope()
    const bundle = bundleOf(env)
    const validation = validateForensicOutput({ interpretations: [goodReading(env)] }, bundle)
    const record = buildForensicInterpretationRecord({ bundle, validation })
    // The same reading, on a session with an occupancy window marked since.
    const changed = { ...env, occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }], forensicInterpretation: record }
    render(<ForensicsPanel env={changed} onPersist={() => {}} generate={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/earlier version of this session/)
    expect(screen.getByTestId('forensic-reading')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Read again/ })).toBeTruthy()
  })

  it('says a rejected response could not be used, with the reasons, and shows none of it', () => {
    const env = envelope()
    const bundle = bundleOf(env)
    const validation = refuseForensicOutput(bundle, 'unparseable_output', 'invalid_json')
    const stored = { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation }) }
    render(<ForensicsPanel env={stored} onPersist={() => {}} generate={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/could not be used/)
    expect(screen.getByText('The response was not readable as a structured reading.')).toBeTruthy()
    expect(screen.queryAllByTestId('forensic-reading')).toHaveLength(0)
  })

  it('says an empty reading found nothing to raise', () => {
    const env = envelope()
    const bundle = bundleOf(env)
    const validation = validateForensicOutput({ interpretations: [] }, bundle)
    const stored = { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation }) }
    render(<ForensicsPanel env={stored} onPersist={() => {}} generate={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/found nothing that needed raising/)
  })

  it('shows the generation error and persists nothing when the path fails', async () => {
    const env = envelope()
    const onPersist = vi.fn()
    const generate = vi.fn(async () => ({ record: null, bundle: null, validation: null, error: 'The AI service account needs attention.' }))
    render(<ForensicsPanel env={env} onPersist={onPersist} generate={generate} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Read the patterns/ })) })
    expect(screen.getByText('The AI service account needs attention.')).toBeTruthy()
    expect(onPersist).not.toHaveBeenCalled()
  })
})
