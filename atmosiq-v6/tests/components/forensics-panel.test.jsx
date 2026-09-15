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
import { acceptInterpretation, emptyForensicReview } from '../../src/utils/forensicReview'

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
  return (
    <ForensicsPanel
      env={env}
      onPersist={(record) => setEnv((e) => ({ ...e, forensicInterpretation: record }))}
      onReview={(review) => setEnv((e) => ({ ...e, forensicReview: review }))}
      generate={generate}
    />
  )
}
/** An envelope already carrying a validated reading of its cycle pattern. */
const withReading = (env, over = {}) => {
  const bundle = bundleOf(env)
  const validation = validateForensicOutput({ interpretations: [goodReading(env)] }, bundle)
  return { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation }), ...over }
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
    // The action returns once the activity status has finished leaving.
    expect(await screen.findByRole('button', { name: /Read again/ })).toBeTruthy()
  })

  it('shows Jasper at work in place of the action while the reading is requested', async () => {
    const env = envelope()
    let finish
    const generate = vi.fn(() => new Promise((resolve) => { finish = resolve }))
    render(<Harness initial={env} generate={generate} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Read the patterns/ })) })
    // No button to press twice, no static label: the status is the indicator.
    expect(screen.queryByRole('button', { name: /Read/ })).toBeNull()
    expect(screen.queryByText('Reading…')).toBeNull()
    const activity = screen.getByTestId('jasper-activity')
    expect(activity.getAttribute('data-active')).toBe('true')
    expect(activity.textContent).toMatch(/Jasper is analyzing the forensic patterns\./)
    expect(screen.getByTestId('jasper-activity-phrase').textContent).toBe('Reading the patterns…')
    await act(async () => { finish({ record: null, bundle: null, validation: null, error: 'The AI service account needs attention.' }) })
    // A failure leaves quietly: no brighten, and the action comes back.
    expect(screen.getByTestId('jasper-activity').className).not.toMatch(/af-ja-done/)
    expect(await screen.findByRole('button', { name: /Read the patterns/ })).toBeTruthy()
    expect(screen.getByText('The AI service account needs attention.')).toBeTruthy()
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

describe('nothing reaches the report until the assessor says so', () => {
  it('offers accept and dismiss on a validated reading, and neither is pre-chosen', () => {
    render(<Harness initial={withReading(envelope())} generate={vi.fn()} />)
    const decision = screen.getByTestId('forensic-decision')
    expect(within(decision).getByRole('button', { name: 'Accept for report' })).toBeTruthy()
    expect(within(decision).getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.queryByText('Accepted for report')).toBeNull()
    expect(screen.getByText(/Nothing enters the monitoring report until you accept it/)).toBeTruthy()
  })

  it('accepting writes a decision keyed by pattern, with the language and the fingerprint', async () => {
    const env = withReading(envelope())
    const bundle = bundleOf(env)
    const onReview = vi.fn()
    render(<ForensicsPanel env={env} onPersist={() => {}} onReview={onReview} generate={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept for report' })) })
    const review = onReview.mock.calls[0][0]
    const decision = review.decisions[cycleOf(env).id]
    expect(decision.status).toBe('accepted')
    expect(decision.fingerprint).toBe(bundle.fingerprint)
    expect(decision.accepted.interpretation).toBe(goodReading(env).interpretation)
    expect(typeof decision.reviewedAt).toBe('string')
  })

  it('shows the decision and lets the assessor reopen it', async () => {
    render(<Harness initial={withReading(envelope())} generate={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accept for report' })) })
    expect(screen.getByText('Accepted for report')).toBeTruthy()
    expect(screen.getByText(/1 accepted for the monitoring report/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Accept for report' })).toBeNull()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reopen' })) })
    expect(screen.queryByText('Accepted for report')).toBeNull()
    expect(screen.getByRole('button', { name: 'Accept for report' })).toBeTruthy()
  })

  it('shows a dismissal as a dismissal, not as an absence', async () => {
    render(<Harness initial={withReading(envelope())} generate={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dismiss' })) })
    expect(screen.getByText('Dismissed')).toBeTruthy()
    expect(screen.getByText(/Nothing enters the monitoring report until you accept it/)).toBeTruthy()
  })

  it('offers no acceptance at all on a stale reading', () => {
    // Accepting a reading of a session that no longer exists is not a decision
    // anyone should be able to make by mistake.
    const env = withReading(envelope())
    const changed = { ...env, occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }] }
    render(<ForensicsPanel env={changed} onPersist={() => {}} onReview={vi.fn()} generate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Accept for report' })).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/earlier version of this session/)
  })

  it('says why a standing acceptance will not be included once it is superseded', () => {
    const env = withReading(envelope())
    const bundle = bundleOf(env)
    const review = acceptInterpretation(emptyForensicReview(), {
      patternId: cycleOf(env).id, interpretation: goodReading(env), fingerprint: bundle.fingerprint,
    })
    // The model was asked again and said something else, at the same fingerprint.
    const rewritten = validateForensicOutput(
      { interpretations: [{ ...goodReading(env), interpretation: 'The recurring shape is consistent with a timed system start, and requires confirmation.' }] },
      bundle,
    )
    const changed = { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation: rewritten }), forensicReview: review }
    render(<ForensicsPanel env={changed} onPersist={() => {}} onReview={vi.fn()} generate={vi.fn()} />)
    expect(screen.getByText('Accepted for report')).toBeTruthy()
    expect(screen.getByText(/Accepted against different wording/)).toBeTruthy()
    expect(screen.getByText(/Nothing enters the monitoring report until you accept it/)).toBeTruthy()
  })

  it('shows no decision controls at all when the panel is read-only', () => {
    render(<ForensicsPanel env={withReading(envelope())} onPersist={() => {}} generate={vi.fn()} />)
    expect(screen.getByTestId('forensic-reading')).toBeTruthy()
    expect(screen.queryByTestId('forensic-decision')).toBeNull()
  })
})

// ── When, and where on the chart ───────────────────────────────────────
import { representativeOccurrence, patternOccurrences } from '../../src/utils/forensicPresent'

describe('the When line and chart navigation', () => {
  const envOf = (days, from = T0) => normalizeSensorData({
    version: SENSOR_DATA_VERSION,
    datasets: [mk('primary', 'indoor', 'Indoor', (() => {
      const pts = []
      for (let d = 0; d < days; d++) for (let i = 0; i < 96; i++) pts.push({ t: from + d * DAY + i * Q, co2: 500 + 200 * Math.cos(((Math.floor((i * 15) / 60) - 14) / 24) * 2 * Math.PI) })
      return pts
    })(), ['co2'], { co2: 'ppm' })],
    occupancyWindows: [], graphs: {}, thresholds: {},
  })
  const cycleRow = () => screen.getAllByTestId('forensic-pattern').find((r) => within(r).queryByText(/Recurring daily cycle/))

  it('states when a recurring cycle occurs beneath the evidence, compactly', () => {
    const env = envelope()
    render(<ForensicsPanel env={env} onPersist={() => {}} generate={vi.fn()} />)
    const when = within(cycleRow()).getByTestId('forensic-when')
    expect(when.textContent).toMatch(/When/)
    expect(when.textContent).toMatch(/Usually 2–3 PM · Mar \d representative/)
    expect(within(when).getByRole('button', { name: '+ 3 more occurrences' })).toBeTruthy()
    // The card carries ONE day; the list is not on it.
    expect(within(when).queryByTestId('forensic-occurrences')).toBeNull()
    // Read-only: no chart action without a navigator.
    expect(within(when).queryByRole('button', { name: 'View on chart' })).toBeNull()
  })

  it('a long run stays compact until the assessor asks for the occurrences', async () => {
    const env = envOf(30)
    render(<ForensicsPanel env={env} onPersist={() => {}} onNavigate={vi.fn()} generate={vi.fn()} />)
    const when = within(cycleRow()).getByTestId('forensic-when')
    expect(within(when).getByRole('button', { name: '+ 29 more occurrences' })).toBeTruthy()
    expect((when.textContent.match(/Mar \d+/g) || []).length).toBe(1)
    await act(async () => { fireEvent.click(within(when).getByRole('button', { name: '+ 29 more occurrences' })) })
    const list = within(when).getByTestId('forensic-occurrences')
    expect(within(list).getAllByRole('listitem')).toHaveLength(30)
    expect(within(list).getAllByRole('button', { name: 'View' })).toHaveLength(30)
    expect(within(when).getByRole('button', { name: 'Hide occurrences' })).toBeTruthy()
  })

  it('View on chart emits a navigation request for the representative window, from the live bundle', async () => {
    const env = envelope()
    const cycle = cycleOf(env)
    const bundle = bundleOf(env)
    const onNavigate = vi.fn()
    render(<ForensicsPanel env={env} onPersist={() => {}} onNavigate={onNavigate} generate={vi.fn()} />)
    await act(async () => { fireEvent.click(within(cycleRow()).getByRole('button', { name: 'View on chart' })) })
    const rep = representativeOccurrence(cycle)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    const req = onNavigate.mock.calls[0][0]
    expect(req).toMatchObject({
      patternId: cycle.id, occurrenceId: rep.id, start: rep.start, end: rep.end,
      params: ['co2'], datasetIds: ['primary'], title: 'Recurring daily cycle — CO₂',
    })
    expect(req.label).toBe(patternOccurrences(cycle, bundle).find((w) => w.id === rep.id).label)
    expect(req.windows).toHaveLength(cycle.occurrenceWindows.length)
  })

  it('a listed occurrence navigates to its own window', async () => {
    const env = envelope()
    const cycle = cycleOf(env)
    const onNavigate = vi.fn()
    render(<ForensicsPanel env={env} onPersist={() => {}} onNavigate={onNavigate} generate={vi.fn()} />)
    const when = within(cycleRow()).getByTestId('forensic-when')
    await act(async () => { fireEvent.click(within(when).getByRole('button', { name: '+ 3 more occurrences' })) })
    const items = within(within(when).getByTestId('forensic-occurrences')).getAllByRole('listitem')
    const last = cycle.occurrenceWindows[cycle.occurrenceWindows.length - 1]
    await act(async () => { fireEvent.click(within(items[items.length - 1]).getByRole('button', { name: 'View' })) })
    expect(onNavigate.mock.calls[0][0]).toMatchObject({ occurrenceId: last.id, start: last.start, end: last.end })
  })

  it('a stale reading cannot navigate to a window the current data no longer has', async () => {
    // A reading produced against one run …
    const earlier = withReading(envelope())
    const earlierWindows = new Set(cycleOf(earlier).occurrenceWindows.map((w) => w.id))
    const earlierStarts = new Set(cycleOf(earlier).occurrenceWindows.map((w) => w.start))
    // … shown over a run a week later, so every window is a different one.
    const later = { ...envOf(4, T0 + 7 * DAY), forensicInterpretation: earlier.forensicInterpretation }
    const current = cycleOf(later)
    const onNavigate = vi.fn()
    render(<ForensicsPanel env={later} onPersist={() => {}} onNavigate={onNavigate} generate={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/earlier version of this session/)
    await act(async () => { fireEvent.click(within(cycleRow()).getByRole('button', { name: 'View on chart' })) })
    const req = onNavigate.mock.calls[0][0]
    expect(current.occurrenceWindows.map((w) => w.id)).toContain(req.occurrenceId)
    expect(earlierWindows.has(req.occurrenceId)).toBe(false)
    expect(earlierStarts.has(req.start)).toBe(false)
  })

  it('never reads a time out of the reading', () => {
    // A validated reading that describes a time in words. The When line is
    // the detector's, and does not change.
    const env = envelope()
    const reading = { ...goodReading(env), interpretation: 'The swing recurs each December afternoon around teatime and is consistent with scheduled occupancy; it requires confirmation.' }
    const bundle = bundleOf(env)
    const validation = validateForensicOutput({ interpretations: [reading] }, bundle)
    expect(validation.status).toBe('validated')
    const stored = { ...env, forensicInterpretation: buildForensicInterpretationRecord({ bundle, validation }) }
    render(<ForensicsPanel env={stored} onPersist={() => {}} generate={vi.fn()} />)
    const when = within(cycleRow()).getByTestId('forensic-when')
    expect(when.textContent).not.toMatch(/December|teatime/)
    expect(when.textContent).toMatch(/Usually 2–3 PM · Mar \d representative/)
  })
})
