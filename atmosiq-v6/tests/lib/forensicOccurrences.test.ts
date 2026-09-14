/**
 * Temporal provenance — every pattern says WHEN, deterministically, and in
 * the shape its kind actually has.
 *
 * The discipline under test:
 *   1. An event-backed pattern's window is COPIED from its member event,
 *      never recomputed from readings.
 *   2. A coincidence occurs over the paired window, not one event's.
 *   3. A recurring cycle is many windows plus one deterministic representative;
 *      an occupancy comparison is many windows and NO representative; an
 *      indoor/outdoor comparison is the aligned interval actually used.
 *   4. Ids come from identity, so the same session reproduces them and a
 *      changed session does not.
 */
import { describe, it, expect } from 'vitest'
import { detectDatasetEvents } from '../../src/utils/forensicEvents.js'
import { buildPatterns, occurrenceId, representativeCycleDay, detectRecurringCycle } from '../../src/utils/forensicPatterns.js'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import { representativeOccurrence } from '../../src/utils/forensicPresent.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

const mk = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})
const multiDay = (days: number, f: (d: number, h: number, i: number) => any, from = T0) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) for (let i = 0; i < 96; i++) pts.push({ t: from + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  return pts
}
const co2Cycle = (_d: number, h: number) => ({ co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI) })
const build = (sets: any[], extra: any = {}) => buildPatterns({
  datasets: sets.map((d) => detectDatasetEvents(d)),
  rawDatasets: Object.fromEntries(sets.map((d) => [d.id, d])),
  ...extra,
})
const ofKind = (ps: any[], k: string) => ps.filter((p) => p.kind === k)
const bundleOf = (datasets: any[], extra: any = {}) => buildForensicBundle({
  sensorData: { version: 2, datasets, occupancyWindows: extra.occupancyWindows || [], graphs: {}, thresholds: {} },
  annotations: extra.annotations || [],
  utcOffsetMin: extra.utcOffsetMin ?? 0,
})

describe('event-backed patterns copy their window from the event', () => {
  const outdoorFlat = multiDay(1, (_d, _h, i) => ({ pm: 9 + (i % 5) }))

  it('a peak exposes the exact deterministic window of the event it rests on', () => {
    const spike = multiDay(1, (_d, _h, i) => ({ pm: i >= 50 && i <= 51 ? 220 : 10 + (i % 5) }))
    const indoor = mk('primary', 'indoor', 'Indoor', spike, ['pm'])
    const sets = [indoor, mk('ds-out', 'outdoor', 'Outdoor', outdoorFlat, ['pm'])]
    const ps = build(sets)
    const p = ofKind(ps, 'no_matching_outdoor_event')[0]
    expect(p).toBeTruthy()
    const event = detectDatasetEvents(indoor).events.find((e: any) => e.id === p.eventIds[0])
    expect(event.kind).toBe('peak')
    expect(p.occurrenceWindows).toHaveLength(1)
    const [w] = p.occurrenceWindows
    expect(w.start).toBe(event.startTs)
    expect(w.end).toBe(event.endTs)
    expect(w.start).toBe(T0 + 50 * Q)
    expect(w.end).toBe(T0 + 51 * Q)
    expect(w.eventIds).toEqual([event.id])
    expect(w.datasetIds).toEqual(['ds-out', 'primary'])
    expect(w.id).toMatch(/^occ-[0-9a-f]{8}$/)
  })

  it('a sustained elevation exposes its start and end', () => {
    const raised = multiDay(1, (_d, _h, i) => ({ pm: i >= 50 && i <= 60 ? 220 : 10 + (i % 5) }))
    const indoor = mk('primary', 'indoor', 'Indoor', raised, ['pm'])
    const ps = build([indoor, mk('ds-out', 'outdoor', 'Outdoor', outdoorFlat, ['pm'])])
    const p = ofKind(ps, 'no_matching_outdoor_event').find((x: any) => x.summary.eventKind === 'sustained')
    expect(p).toBeTruthy()
    const [w] = p.occurrenceWindows
    expect(w.start).toBe(T0 + 50 * Q)
    expect(w.end).toBe(T0 + 60 * Q)
    expect(w.end - w.start).toBe(10 * Q)
  })

  it('a zone excursion carries the zone dataset and the event window', () => {
    const quiet = multiDay(1, (_d, _h, i) => ({ co2: 450 + (i % 4) }))
    const spike = multiDay(1, (_d, _h, i) => ({ co2: i >= 60 && i <= 61 ? 1800 : 450 + (i % 4) }))
    const ps = build([mk('primary', 'indoor', 'Open office', quiet, ['co2']), mk('ds-z1', 'zone', 'Conference B', spike, ['co2'])])
    const p = ofKind(ps, 'no_matching_zone_event')[0]
    expect(p.occurrenceWindows).toHaveLength(1)
    expect(p.occurrenceWindows[0].datasetIds).toEqual(['ds-z1'])
    expect(p.occurrenceWindows[0].start).toBe(T0 + 60 * Q)
    expect(p.occurrenceWindows[0].end).toBe(T0 + 61 * Q)
  })

  it('event proximity keeps the logger-event relationship AND the event window', () => {
    const pts = multiDay(1, (_d, _h, i) => ({ co2: i >= 48 ? 1400 : 450 + (i % 3) }))
    const indoor = mk('primary', 'indoor', 'Indoor', pts, ['co2'])
    const ps = build([indoor], { annotations: [{ id: 'a1', t: T0 + 48 * Q, label: 'HVAC adjusted' }] })
    const p = ofKind(ps, 'event_proximity')[0]
    expect(p).toBeTruthy()
    const event = detectDatasetEvents(indoor).events.find((e: any) => e.id === p.eventIds[0])
    const [w] = p.occurrenceWindows
    expect(w.eventIds).toEqual([event.id])
    expect(w.start).toBe(event.startTs)
    expect(w.end).toBe(event.endTs)
    // The annotation the pattern rests on is still declared on the summary,
    // and it sits at the window — the relationship survives intact.
    expect(p.summary.annotationIds).toEqual(['a1'])
    expect(Math.abs(p.summary.annotations[0].t - w.start)).toBeLessThanOrEqual(2 * Q)
  })
})

describe('a coincidence occurs over the paired window', () => {
  it('spans both member events rather than either one alone', () => {
    const pts = multiDay(1, (_d, _h, i) => ({
      tvoc: i >= 40 && i <= 42 ? 900 : 100 + (i % 3),
      hcho: i >= 41 && i <= 43 ? 140 : 20 + (i % 3),
    }))
    const indoor = mk('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho'])
    const ps = build([indoor])
    const events = detectDatasetEvents(indoor).events
    const co = ofKind(ps, 'coincidence').find((p: any) => p.summary.kinds.every((k: string) => k === 'peak'))
    expect(co).toBeTruthy()
    const [w] = co.occurrenceWindows
    const members = co.eventIds.map((id: string) => events.find((e: any) => e.id === id))
    expect(members).toHaveLength(2)
    expect(w.start).toBe(Math.min(...members.map((e: any) => e.startTs)))
    expect(w.end).toBe(Math.max(...members.map((e: any) => e.endTs)))
    // The two peaks are offset by one sample, so the paired window is wider
    // than either event's own — proof it is not one event's window by accident.
    members.forEach((e: any) => expect(w.end - w.start).toBeGreaterThan(e.endTs - e.startTs))
    expect(w.eventIds.slice().sort()).toEqual(co.eventIds.slice().sort())
  })
})

describe('a recurring cycle is many windows and one representative', () => {
  const days = 6
  const indoor = mk('primary', 'indoor', 'Indoor', multiDay(days, co2Cycle), ['co2'])
  const cycle = ofKind(build([indoor]), 'recurring_cycle')[0]

  it('exposes one window per agreeing day, in order, each inside its day', () => {
    expect(cycle).toBeTruthy()
    expect(cycle.occurrenceWindows).toHaveLength(cycle.summary.daysAgreeing)
    expect(cycle.occurrenceWindows.length).toBeGreaterThan(1)
    const starts = cycle.occurrenceWindows.map((w: any) => w.start)
    expect(starts).toEqual(starts.slice().sort((a: number, b: number) => a - b))
    cycle.occurrenceWindows.forEach((w: any, i: number) => {
      const day = cycle.summary.days[i]
      expect(w.start).toBeGreaterThanOrEqual(day.dayStartTs)
      expect(w.end).toBeLessThan(day.dayStartTs + DAY)
      expect(w.end).toBeGreaterThan(w.start)
      // The window is the peak hour's readings: it starts in that hour.
      expect(Math.floor((w.start / 3600000) % 24)).toBe(day.peakHour)
      expect(w.start).toBe(day.peakStartTs)
      expect(w.end).toBe(day.peakEndTs)
    })
  })

  it('never collapses to one timestamp, and flags exactly one representative', () => {
    expect(cycle.startTs).toBeNull()
    const reps = cycle.occurrenceWindows.filter((w: any) => w.representative)
    expect(reps).toHaveLength(1)
    expect(representativeOccurrence(cycle)).toBe(reps[0])
  })

  it('the representative is deterministic and matches the summary it stands for', () => {
    const rep = representativeCycleDay(cycle.summary)
    expect(rep).toBeTruthy()
    expect(rep.peakHour).toBe(cycle.summary.peakHour)
    const flagged = cycle.occurrenceWindows.find((w: any) => w.representative)
    expect(flagged.start).toBe(rep.peakStartTs)
    // Re-run: same day, same id.
    const again = ofKind(build([indoor]), 'recurring_cycle')[0]
    expect(again.occurrenceWindows.find((w: any) => w.representative).id).toBe(flagged.id)
  })

  it('prefers a day peaking in the modal hour whose amplitude sits nearest the median', () => {
    const summary = {
      peakHour: 14, meanAmplitude: 100,
      days: [
        { dayStartTs: 1, peakHour: 13, amplitude: 100, peakStartTs: 1, peakEndTs: 2 }, // right amplitude, wrong hour
        { dayStartTs: 2, peakHour: 14, amplitude: 160, peakStartTs: 3, peakEndTs: 4 }, // modal hour, far amplitude
        { dayStartTs: 3, peakHour: 14, amplitude: 104, peakStartTs: 5, peakEndTs: 6 }, // modal hour, nearest
        { dayStartTs: 4, peakHour: 14, amplitude: 104, peakStartTs: 7, peakEndTs: 8 }, // tie — later, loses
      ],
    }
    expect(representativeCycleDay(summary).dayStartTs).toBe(3)
    expect(representativeCycleDay({ ...summary, days: [] })).toBeNull()
    expect(representativeCycleDay(null)).toBeNull()
  })

  it('the detector records each day’s peak window from the readings it averaged', () => {
    const c = detectRecurringCycle(multiDay(3, co2Cycle), 'co2')
    c!.days.forEach((d: any) => {
      expect(d.peakEndTs - d.peakStartTs).toBe(3 * Q) // four 15-minute readings in the hour
      expect(d.peakStartTs).toBeGreaterThanOrEqual(d.dayStartTs)
    })
  })
})

describe('aggregates and comparisons do not pretend to be one event', () => {
  it('an occupancy comparison lists the contributing occupied windows and has no representative', () => {
    const pts = multiDay(3, (_d, hour) => ({ co2: hour >= 9 && hour < 17 ? 1100 : 450 }))
    const indoor = mk('primary', 'indoor', 'Indoor', pts, ['co2'])
    const windows = [
      { id: 'w1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' },
      { id: 'w2', start: T0 + DAY + 9 * 3600_000, end: T0 + DAY + 17 * 3600_000, kind: 'occupied' },
      // Marked, but the logger had nothing inside it: it contributed nothing.
      { id: 'w-empty', start: T0 + 30 * DAY, end: T0 + 30 * DAY + 3600_000, kind: 'occupied' },
    ]
    const p = ofKind(build([indoor], { occupancyWindows: windows }), 'occupancy_comparison')[0]
    expect(p).toBeTruthy()
    expect(p.occurrenceWindows.map((w: any) => [w.start, w.end])).toEqual([[windows[0].start, windows[0].end], [windows[1].start, windows[1].end]])
    expect(p.occurrenceWindows.some((w: any) => w.representative)).toBe(false)
    expect(representativeOccurrence(p)).toBeNull()
    expect(p.startTs).toBeNull()
  })

  it('an indoor/outdoor comparison exposes the aligned interval it was computed over', () => {
    const inPts = multiDay(2, (_d, _h, i) => ({ pm: 10 + (i % 5) }))
    const outPts = multiDay(2, (_d, _h, i) => ({ pm: 9 + (i % 5) }))
    const whole = ofKind(build([mk('primary', 'indoor', 'Indoor', inPts, ['pm']), mk('ds-out', 'outdoor', 'Outdoor', outPts, ['pm'])]), 'indoor_outdoor_comparison')[0]
    expect(whole.occurrenceWindows).toHaveLength(1)
    // Both loggers ran the whole run, so the interval IS the run.
    expect(whole.occurrenceWindows[0].start).toBe(inPts[0].t)
    expect(whole.occurrenceWindows[0].end).toBe(inPts[inPts.length - 1].t)
    expect(whole.occurrenceWindows[0].datasetIds).toEqual(['ds-out', 'primary'])
    expect(whole.occurrenceWindows[0].representative).toBeUndefined()

    // An outdoor logger that stopped at midday narrows the interval to what
    // was actually paired — no reading past its last sample is claimed.
    const half = outPts.slice(0, 96)
    const partial = ofKind(build([mk('primary', 'indoor', 'Indoor', inPts, ['pm']), mk('ds-out', 'outdoor', 'Outdoor', half, ['pm'])]), 'indoor_outdoor_comparison')[0]
    expect(partial.occurrenceWindows[0].start).toBe(inPts[0].t)
    // Alignment pairs within one sampling interval of slack, no further.
    expect(partial.occurrenceWindows[0].end).toBeLessThanOrEqual(half[half.length - 1].t + Q)
    expect(partial.occurrenceWindows[0].end).toBeLessThan(whole.occurrenceWindows[0].end)
  })
})

describe('occurrence ids are identity, not position', () => {
  const session = () => [
    mk('primary', 'indoor', 'Indoor', multiDay(4, (_d, h, i) => ({ ...co2Cycle(_d, h), pm: i === 50 ? 180 : 10 + (i % 5) })), ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' }),
    mk('ds-out', 'outdoor', 'Outdoor', multiDay(4, (_d, _h, i) => ({ pm: 9 + (i % 5) })), ['pm'], { pm: 'µg/m³' }),
  ]

  it('the same input yields the same ids, unique within the bundle', () => {
    const a = bundleOf(session()); const b = bundleOf(session())
    const ids = (bundle: any) => bundle.patterns.flatMap((p: any) => p.occurrenceWindows.map((w: any) => w.id))
    expect(ids(a)).toEqual(ids(b))
    expect(ids(a).length).toBeGreaterThan(4)
    expect(new Set(ids(a)).size).toBe(ids(a).length)
  })

  it('every window is well-formed and cites only what its pattern cites', () => {
    const bundle: any = bundleOf(session())
    bundle.patterns.forEach((p: any) => {
      expect(Array.isArray(p.occurrenceWindows)).toBe(true)
      expect(p.occurrenceWindows.length).toBeGreaterThan(0)
      p.occurrenceWindows.forEach((w: any) => {
        expect(typeof w.id).toBe('string')
        expect(Number.isFinite(w.start)).toBe(true)
        expect(Number.isFinite(w.end)).toBe(true)
        expect(w.end).toBeGreaterThanOrEqual(w.start)
        w.eventIds.forEach((id: string) => expect(p.eventIds).toContain(id))
        w.datasetIds.forEach((id: string) => expect(p.datasetIds).toContain(id))
      })
    })
  })

  it('occurrenceId is order-insensitive over members and sensitive to bounds', () => {
    expect(occurrenceId('pat-x', 1, 2, ['b', 'a'])).toBe(occurrenceId('pat-x', 1, 2, ['a', 'b']))
    expect(occurrenceId('pat-x', 1, 2)).not.toBe(occurrenceId('pat-x', 1, 3))
    expect(occurrenceId('pat-x', 1, 2)).not.toBe(occurrenceId('pat-y', 1, 2))
  })

  it('moving the data moves the provenance, the pattern and the fingerprint together', () => {
    const before: any = bundleOf(session())
    const shifted = session()
    // The same excursion, one sample later.
    shifted[0].points = multiDay(4, (_d, h, i) => ({ ...co2Cycle(_d, h), pm: i === 51 ? 180 : 10 + (i % 5) }))
    const after: any = bundleOf(shifted)
    const win = (bundle: any) => bundle.patterns.find((p: any) => p.kind === 'no_matching_outdoor_event')
    expect(win(before).occurrenceWindows[0].start).toBe(T0 + 50 * Q)
    expect(win(after).occurrenceWindows[0].start).toBe(T0 + 51 * Q)
    expect(win(after).occurrenceWindows[0].id).not.toBe(win(before).occurrenceWindows[0].id)
    expect(win(after).id).not.toBe(win(before).id)
    expect(after.fingerprint).not.toBe(before.fingerprint)
  })

  it('a changed occupancy window changes the aggregate’s provenance while its pattern id holds', () => {
    const occ = (end: number) => [{ id: 'w1', start: T0 + 9 * 3600_000, end: T0 + end * 3600_000, kind: 'occupied' }]
    const a: any = bundleOf(session(), { occupancyWindows: occ(17) })
    const b: any = bundleOf(session(), { occupancyWindows: occ(18) })
    const cmp = (bundle: any) => bundle.patterns.find((p: any) => p.kind === 'occupancy_comparison' && p.params[0] === 'co2')
    expect(cmp(a).id).toBe(cmp(b).id) // same pattern — it is the reading of it that changed
    expect(cmp(a).occurrenceWindows[0].id).not.toBe(cmp(b).occurrenceWindows[0].id)
    expect(cmp(b).occurrenceWindows[0].end - cmp(a).occurrenceWindows[0].end).toBe(3600_000)
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })
})
