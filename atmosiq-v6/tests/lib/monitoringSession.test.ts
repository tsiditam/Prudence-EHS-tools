/**
 * monitoringSession — the root entity for Logger Studio.
 *
 * The behaviours pinned here are the ones that protect a record: a session
 * loads even when partially malformed, calibration is a stored snapshot
 * rather than a live lookup, reserved slots exist from version 1, and
 * readiness advises without blocking.
 */
import { describe, it, expect } from 'vitest'
import {
  MONITORING_SESSION_VERSION,
  MONITORING_EVENT_TYPES,
  createMonitoringSession,
  normalizeMonitoringSession,
  normalizeEvent,
  addEvent,
  removeEvent,
  outdoorDataset,
  primaryDataset,
  sessionReadiness,
  recordGeneratedReport,
  defaultReferenceProfiles,
  eventTypeLabel,
  occupiedWindows,
} from '../../src/utils/monitoringSession.js'
import { parametersWithProfiles } from '../../src/utils/referenceProfiles.js'

const T = Date.UTC(2026, 6, 15, 12, 0)

describe('createMonitoringSession', () => {
  const s = createMonitoringSession()

  it('models the campaign, not the file', () => {
    expect(s.location).toHaveProperty('building')
    expect(s.location).toHaveProperty('sensorPosition')
    expect(s.instrument).toHaveProperty('serial')
    expect(s.instrument).toHaveProperty('timestampSource')
    expect(s.calibration).toHaveProperty('date')
    expect(s).toHaveProperty('objective')
    expect(s).toHaveProperty('occupancySchedule')
    expect(s).toHaveProperty('events')
  })

  it('declares the reserved slots from version 1, so adding them is additive', () => {
    // Present and empty rather than absent: a later release populates these
    // without a stored-session migration.
    expect(s.photos).toEqual([])
    expect(s.floorPlan).toBeNull()
    expect(s.datasets).toEqual([])
    expect(s.reports).toEqual([])
  })

  it('selects a default reference profile for every parameter that offers one', () => {
    const defaults = defaultReferenceProfiles()
    parametersWithProfiles().forEach((p) => expect(defaults[p]).toBeTruthy())
    expect(s.referenceProfiles).toEqual(defaults)
  })

  it('pins the site UTC offset explicitly so timestamps are reproducible', () => {
    expect(s.utcOffsetMin).toBe(0)
    expect(createMonitoringSession({ utcOffsetMin: -300 }).utcOffsetMin).toBe(-300)
  })

  it('accepts autofill from the assessor profile while staying overridable', () => {
    const seeded = createMonitoringSession({
      instrument: { make: 'TSI', model: 'Q-Trak XP', serial: 'QT-1' },
      assessor: { name: 'T. Tamakloe', credentials: 'CSP' },
      calibration: { date: '2026-03-12', status: 'current' },
    })
    expect(seeded.instrument.serial).toBe('QT-1')
    expect(seeded.assessor.credentials).toBe('CSP')
    expect(seeded.calibration.status).toBe('current')
    // Unseeded fields still carry their defaults.
    expect(seeded.instrument.timestampSource).toBe('device')
  })
})

describe('calibration is a snapshot', () => {
  it('stores the calibration state as captured, not a live lookup', () => {
    // A report issued today must keep showing the calibration state that
    // applied when the data was collected, even after the instrument is
    // recalibrated. Re-deriving at render time would rewrite an issued record.
    const s = createMonitoringSession({
      calibration: { date: '2026-03-12', dueDate: '2026-12-07', status: 'current', capturedAt: '2026-07-15' },
    })
    const reloaded = normalizeMonitoringSession(JSON.parse(JSON.stringify(s)))
    expect(reloaded.calibration).toEqual(s.calibration)
  })
})

describe('events', () => {
  it('labels an event by its type when no custom label is given', () => {
    const e = normalizeEvent({ t: T, type: 'windows_opened' })!
    expect(e.label).toBe('Windows opened')
    expect(eventTypeLabel('cleaning')).toBe('Cleaning')
  })

  it('prefers a custom label', () => {
    expect(normalizeEvent({ t: T, type: 'other', label: 'Contractor on site' })!.label).toBe('Contractor on site')
  })

  it('accepts an ISO timestamp as well as epoch ms', () => {
    const e = normalizeEvent({ t: '2026-07-15T12:00:00.000Z', type: 'cleaning' })!
    expect(e.t).toBe(T)
  })

  it('rejects an event with no usable timestamp — a marker must be datable', () => {
    expect(normalizeEvent({ type: 'cleaning' })).toBeNull()
    expect(normalizeEvent({ t: 'not a date', type: 'cleaning' })).toBeNull()
    expect(normalizeEvent(null)).toBeNull()
  })

  it('falls back to "other" for an unrecognised type', () => {
    expect(normalizeEvent({ t: T, type: 'nope' })!.type).toBe('other')
  })

  it('keeps events in chronological order as they are added', () => {
    let s = createMonitoringSession()
    s = addEvent(s, { id: 'b', t: T + 3600_000, type: 'cleaning' })
    s = addEvent(s, { id: 'a', t: T, type: 'windows_opened' })
    expect(s.events.map((e: any) => e.id)).toEqual(['a', 'b'])
    expect(removeEvent(s, 'a').events.map((e: any) => e.id)).toEqual(['b'])
  })

  it('offers the operational facts an assessor records', () => {
    const ids = MONITORING_EVENT_TYPES.map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['hvac_adjusted', 'windows_opened', 'cleaning', 'filter_replaced', 'complaint']))
  })
})

describe('normalizeMonitoringSession — a campaign is never lost to bad data', () => {
  it('loads a partial or hand-edited session without throwing', () => {
    const s = normalizeMonitoringSession({ objective: 'Doc conditions', location: { building: 'Tower' } })
    expect(s.objective).toBe('Doc conditions')
    expect(s.location.building).toBe('Tower')
    expect(s.location.room).toBe('')
    expect(s.events).toEqual([])
  })

  it('drops only the unusable parts, keeping the rest', () => {
    const s = normalizeMonitoringSession({
      events: [{ t: T, type: 'cleaning' }, { type: 'cleaning' }, null],
      occupancySchedule: [{ start: 2, end: 1 }, { start: 10, end: 20 }, { start: 'x' }],
    })
    expect(s.events).toHaveLength(1) // the datable one survives
    expect(s.occupancySchedule).toEqual([{ start: 10, end: 20 }]) // reversed/invalid dropped
  })

  it('survives entirely malformed input', () => {
    expect(() => normalizeMonitoringSession(null)).not.toThrow()
    expect(() => normalizeMonitoringSession('nonsense' as never)).not.toThrow()
    expect(normalizeMonitoringSession(undefined).version).toBe(MONITORING_SESSION_VERSION)
  })

  it('stamps the current schema version on load', () => {
    expect(normalizeMonitoringSession({ version: 0 }).version).toBe(MONITORING_SESSION_VERSION)
  })
})

describe('datasets', () => {
  const s = createMonitoringSession({
    datasets: [
      { id: 'out', role: 'outdoor' },
      { id: 'in', role: 'indoor' },
    ],
  })

  it('finds the outdoor baseline and the primary indoor dataset by role', () => {
    expect(outdoorDataset(s)!.id).toBe('out')
    expect(primaryDataset(s)!.id).toBe('in')
  })

  it('falls back to the first dataset when no role is marked', () => {
    expect(primaryDataset(createMonitoringSession({ datasets: [{ id: 'only' }] }))!.id).toBe('only')
  })

  it('returns null rather than throwing on an empty session', () => {
    expect(outdoorDataset(createMonitoringSession())).toBeNull()
    expect(primaryDataset(createMonitoringSession())).toBeNull()
  })
})

describe('sessionReadiness — advisory, never blocking', () => {
  it('names what is missing, with the field to fix', () => {
    const { ready, missing } = sessionReadiness(createMonitoringSession())
    expect(ready).toBe(false)
    expect(missing.map((m) => m.field)).toEqual(
      expect.arrayContaining(['datasets', 'objective', 'location.building', 'calibration.date', 'assessor.name']),
    )
    missing.forEach((m) => expect(m.label.length).toBeGreaterThan(0))
  })

  it('reports ready once the campaign is documented', () => {
    const s = createMonitoringSession({
      datasets: [{ id: 'd', role: 'indoor' }],
      objective: 'Document conditions.',
      location: { building: 'Meridian Tower', room: 'Suite 300' },
      instrument: { make: 'TSI', model: 'Q-Trak XP' },
      calibration: { date: '2026-03-12' },
      assessor: { name: 'T. Tamakloe' },
    })
    expect(sessionReadiness(s)).toEqual({ ready: true, missing: [] })
  })

  it('is a report, not a gate — it returns findings and changes nothing', () => {
    const s = createMonitoringSession()
    const before = JSON.stringify(s)
    sessionReadiness(s)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('recordGeneratedReport', () => {
  it('ties an output back to the exact data and code that produced it', () => {
    const s = recordGeneratedReport(createMonitoringSession(), {
      id: 'r1', edition: 'client', format: 'pdf',
      generatedAt: '2026-07-31T14:20:00Z',
      datasetHash: 'a19dd790', reportVersion: 'v1.0', softwareVersion: '6.0.0',
    })
    expect(s.reports).toHaveLength(1)
    expect(s.reports[0]).toMatchObject({ edition: 'client', format: 'pdf', datasetHash: 'a19dd790' })
  })

  it('defaults an unrecognised edition to the client report', () => {
    const s = recordGeneratedReport(createMonitoringSession(), { edition: 'bogus' })
    expect(s.reports[0].edition).toBe('client')
  })

  it('appends rather than replacing, so the history survives', () => {
    let s = recordGeneratedReport(createMonitoringSession(), { id: 'a' })
    s = recordGeneratedReport(s, { id: 'b' })
    expect(s.reports.map((r: any) => r.id)).toEqual(['a', 'b'])
  })
})

describe('occupiedWindows', () => {
  const W = (over: any = {}) => ({ start: 1_000, end: 2_000, ...over })

  it('keeps only the windows marked occupied', () => {
    // Logger Studio's editor tags periods either way. `occupancySchedule`
    // means "when the space was occupied", so an unoccupied window entered
    // there would invert the occupied mean, the difference bullet, and the
    // shaded columns on every figure.
    const mixed = [
      W({ kind: 'occupied', label: 'Business hours' }),
      W({ start: 3_000, end: 4_000, kind: 'unoccupied', label: 'Overnight' }),
      W({ start: 5_000, end: 6_000, kind: 'occupied' }),
    ]
    expect(occupiedWindows(mixed).map((w: any) => w.start)).toEqual([1_000, 5_000])
  })

  it('treats an unlabelled window as occupied', () => {
    // Windows saved before the editor grew the distinction only ever meant
    // occupied; dropping them would quietly delete an assessor's markup.
    expect(occupiedWindows([W()])).toHaveLength(1)
    expect(occupiedWindows([W({ kind: null })])).toHaveLength(1)
  })

  it('drops windows that cannot describe a period', () => {
    expect(occupiedWindows([W({ end: 500 })])).toEqual([]) // ends before it starts
    expect(occupiedWindows([W({ end: 1_000 })])).toEqual([]) // zero length
    expect(occupiedWindows([W({ start: null })])).toEqual([])
    expect(occupiedWindows([W({ start: NaN })])).toEqual([])
  })

  it('returns an empty list rather than throwing on junk', () => {
    expect(occupiedWindows(null as never)).toEqual([])
    expect(occupiedWindows('nope' as never)).toEqual([])
    expect(occupiedWindows([null, 3, undefined] as never)).toEqual([])
  })
})
