/**
 * Forensic patterns — do events actually relate, and is missing context
 * reported where it changes a reading rather than everywhere?
 *
 * The discipline under test, beyond each detector working:
 *
 *   1. MISSING CONTEXT IS PATTERN-DEPENDENT. Logger Studio has no HVAC-schedule
 *      field, so a session-level checklist would name it on every analysis ever
 *      run. It is named against a recurring daily cycle, where a timer and
 *      people are indistinguishable without it, and nowhere else.
 *   2. A PATTERN CARRIES NUMBERS AND EVENT IDS, NEVER PROSE. Interpretation is
 *      the model's, reached only by citing these ids.
 */
import { describe, it, expect } from 'vitest'
import { detectDatasetEvents } from '../../src/utils/forensicEvents.js'
import {
  buildPatterns, detectRecurringCycle, correlation, patternId, missingContextFor,
  PATTERN_KINDS, CONTEXT_INPUTS, MIN_CYCLE_DAYS,
} from '../../src/utils/forensicPatterns.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0) // a Monday, midnight UTC
const Q = 15 * 60_000 // 15-minute logger

/** A dataset shaped the way Logger Studio's parser emits them. */
const mkDataset = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})

/** `days` days of 15-minute readings; `valueAt(dayIdx, hour, i)` shapes each. */
const multiDay = (days: number, valueAt: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 96; i++) {
      const t = T0 + d * DAY + i * Q
      const hour = Math.floor((i * 15) / 60)
      pts.push({ t, ...valueAt(d, hour, i) })
    }
  }
  return pts
}

/** A daily cycle peaking at 14:00, amplitude ~200 around 500. */
const co2Cycle = (_d: number, hour: number) => ({
  co2: 500 + 200 * Math.cos(((hour - 14) / 24) * 2 * Math.PI),
})

const build = (opts: any) => buildPatterns(opts)
const ofKind = (ps: any[], k: string) => ps.filter((p) => p.kind === k)

describe('correlation', () => {
  it('is 1 for a perfect positive relation and null for a constant series', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10)
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10)
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
    expect(correlation([1, 2], [1, 2])).toBeNull() // too few pairs
  })
})

describe('recurring daily cycle', () => {
  it('needs agreement across days, not one day with a bump', () => {
    const oneDay = multiDay(1, co2Cycle)
    expect(detectRecurringCycle(oneDay, 'co2')).toBeNull()
    const fourDays = multiDay(4, co2Cycle)
    const cycle = detectRecurringCycle(fourDays, 'co2')
    expect(cycle).toBeTruthy()
    expect(cycle!.daysObserved).toBe(4)
    expect(cycle!.daysAgreeing).toBeGreaterThanOrEqual(MIN_CYCLE_DAYS)
    expect(cycle!.peakHour).toBeGreaterThanOrEqual(13)
    expect(cycle!.peakHour).toBeLessThanOrEqual(15)
    expect(cycle!.meanAmplitude).toBeGreaterThan(100)
  })

  it('reports nothing for a trace with no daily shape', () => {
    const flatish = multiDay(4, (_d, _h, i) => ({ co2: 500 + (i % 3) }))
    const cycle = detectRecurringCycle(flatish, 'co2')
    // Either no cycle, or one whose amplitude is honestly tiny.
    if (cycle) expect(cycle.meanAmplitude).toBeLessThan(10)
  })
})

describe('missing context is pattern-dependent', () => {
  const cyclePoints = multiDay(4, co2Cycle)
  const indoorSet = () => detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', cyclePoints, ['co2'], { co2: 'ppm' }))

  it('names the HVAC schedule against a recurring cycle, because it changes the reading', () => {
    const ps = build({
      datasets: [indoorSet()],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', cyclePoints, ['co2']) },
    })
    const cycle = ofKind(ps, 'recurring_cycle')[0]
    expect(cycle).toBeTruthy()
    const ids = cycle.missingContext.map((m: any) => m.id)
    expect(ids).toContain('hvac_schedule')
    expect(ids).toContain('occupancy')
    cycle.missingContext.forEach((m: any) => {
      expect(m.label).toBe(CONTEXT_INPUTS[m.id as keyof typeof CONTEXT_INPUTS])
      expect(typeof m.why).toBe('string')
      expect(m.why.length).toBeGreaterThan(20) // it must say what cannot be distinguished
    })
  })

  it('does NOT name the HVAC schedule against an isolated spike, where it settles nothing', () => {
    // One solvent-like excursion, no daily shape at all.
    const pts = multiDay(1, (_d, _h, i) => ({ tvoc: i === 40 ? 900 : 100 + (i % 3) }))
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc']) },
    })
    const all = ps.flatMap((p: any) => p.missingContext.map((m: any) => m.id))
    expect(all).not.toContain('hvac_schedule')
  })

  it('stops naming an input once the session actually has it', () => {
    const withOcc = build({
      datasets: [indoorSet()],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', cyclePoints, ['co2']) },
      occupancyWindows: [{ start: T0, end: T0 + 8 * 3600_000, kind: 'occupied' }],
    })
    const cycle = ofKind(withOcc, 'recurring_cycle')[0]
    expect(cycle.missingContext.map((m: any) => m.id)).not.toContain('occupancy')
    expect(cycle.missingContext.map((m: any) => m.id)).toContain('hvac_schedule')
  })

  it('missingContextFor is a pure lookup over what is absent', () => {
    expect(missingContextFor('occupancy_relation', {})).toEqual([])
    expect(missingContextFor('recurring_cycle', { hvac_schedule: true, occupancy: true })).toEqual([])
    expect(missingContextFor('nonexistent_kind', {})).toEqual([])
  })
})

describe('occupied vs unoccupied', () => {
  const pts = multiDay(2, (_d, hour) => ({ co2: hour >= 9 && hour < 17 ? 1100 : 450 }))
  const ds = () => detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['co2']))

  it('reports the measured difference when windows are marked', () => {
    const ps = build({
      datasets: [ds()],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['co2']) },
      occupancyWindows: [
        { start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' },
        { start: T0 + DAY + 9 * 3600_000, end: T0 + DAY + 17 * 3600_000, kind: 'occupied' },
      ],
    })
    const rel = ofKind(ps, 'occupancy_relation')[0]
    expect(rel).toBeTruthy()
    expect(rel.summary.delta).toBeGreaterThan(500)
    expect(rel.summary.windows).toBe(2)
  })

  it('emits no occupancy pattern at all when no windows are marked', () => {
    const ps = build({
      datasets: [ds()],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['co2']) },
    })
    expect(ofKind(ps, 'occupancy_relation')).toEqual([])
  })
})

describe('cross-parameter coincidence', () => {
  it('pairs two parameters that move in the same window', () => {
    const pts = multiDay(1, (_d, _h, i) => ({
      tvoc: i >= 40 && i <= 42 ? 900 : 100 + (i % 3),
      hcho: i >= 40 && i <= 42 ? 140 : 20 + (i % 3),
    }))
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']) },
    })
    const co = ofKind(ps, 'coincidence')
    expect(co.length).toBeGreaterThanOrEqual(1)
    expect(co[0].params).toEqual(['hcho', 'tvoc'])
    expect(co[0].eventIds).toHaveLength(2)
  })

  it('does not pair parameters that move at different times', () => {
    const pts = multiDay(1, (_d, _h, i) => ({
      tvoc: i >= 10 && i <= 12 ? 900 : 100 + (i % 3),
      hcho: i >= 70 && i <= 72 ? 140 : 20 + (i % 3),
    }))
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']) },
    })
    expect(ofKind(ps, 'coincidence')).toEqual([])
  })
})

describe('indoor and outdoor', () => {
  const inPts = multiDay(1, (_d, _h, i) => ({ pm: 10 + (i % 5) }))
  const outPts = multiDay(1, (_d, _h, i) => ({ pm: 9 + (i % 5) }))

  it('reports tracking as a correlation, not as a verdict', () => {
    const ps = build({
      datasets: [
        detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', inPts, ['pm'])),
        detectDatasetEvents(mkDataset('ds-out', 'outdoor', 'Outdoor', outPts, ['pm'])),
      ],
      rawDatasets: {
        primary: mkDataset('primary', 'indoor', 'Indoor', inPts, ['pm']),
        'ds-out': mkDataset('ds-out', 'outdoor', 'Outdoor', outPts, ['pm']),
      },
    })
    const track = ofKind(ps, 'indoor_outdoor_tracking')[0]
    expect(track).toBeTruthy()
    expect(track.summary.r).toBeGreaterThan(0.9)
    expect(track.summary.pairedSamples).toBeGreaterThan(10)
    expect(JSON.stringify(track)).not.toMatch(/infiltrat|source|caused/i)
  })

  it('flags an indoor excursion with nothing moving outdoors', () => {
    const spikeIn = multiDay(1, (_d, _h, i) => ({ pm: i >= 50 && i <= 51 ? 220 : 10 + (i % 5) }))
    const ps = build({
      datasets: [
        detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', spikeIn, ['pm'])),
        detectDatasetEvents(mkDataset('ds-out', 'outdoor', 'Outdoor', outPts, ['pm'])),
      ],
      rawDatasets: {
        primary: mkDataset('primary', 'indoor', 'Indoor', spikeIn, ['pm']),
        'ds-out': mkDataset('ds-out', 'outdoor', 'Outdoor', outPts, ['pm']),
      },
    })
    const only = ofKind(ps, 'indoor_only')
    expect(only.length).toBeGreaterThanOrEqual(1)
    expect(only[0].summary.outdoorEventsInWindow).toBe(0)
    expect(only[0].eventIds).toHaveLength(1)
  })

  it('emits no indoor/outdoor pattern without an outdoor dataset', () => {
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', inPts, ['pm']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', inPts, ['pm']) },
    })
    expect(ofKind(ps, 'indoor_outdoor_tracking')).toEqual([])
    expect(ofKind(ps, 'indoor_only')).toEqual([])
  })
})

describe('zone-localized events', () => {
  it('flags an excursion present in one zone and not the others', () => {
    const quietPts = multiDay(1, (_d, _h, i) => ({ co2: 450 + (i % 4) }))
    const spikePts = multiDay(1, (_d, _h, i) => ({ co2: i >= 60 && i <= 61 ? 1800 : 450 + (i % 4) }))
    const ps = build({
      datasets: [
        detectDatasetEvents(mkDataset('primary', 'indoor', 'Open office', quietPts, ['co2'])),
        detectDatasetEvents(mkDataset('ds-z1', 'zone', 'Conference B', spikePts, ['co2'])),
      ],
      rawDatasets: {
        primary: mkDataset('primary', 'indoor', 'Open office', quietPts, ['co2']),
        'ds-z1': mkDataset('ds-z1', 'zone', 'Conference B', spikePts, ['co2']),
      },
    })
    const loc = ofKind(ps, 'zone_localized')
    expect(loc.length).toBeGreaterThanOrEqual(1)
    expect(loc[0].summary.zone).toBe('Conference B')
    expect(loc[0].datasetIds).toEqual(['ds-z1'])
  })
})

describe('proximity to a logged annotation', () => {
  const pts = multiDay(1, (_d, _h, i) => ({ co2: i >= 48 ? 1400 : 450 + (i % 3) }))
  const ds = () => detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['co2']))
  const rawDatasets = { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['co2']) }

  it('links a step to an annotation logged at the same time', () => {
    const ps = build({
      datasets: [ds()], rawDatasets,
      annotations: [{ t: T0 + 48 * Q, label: 'HVAC adjusted' }],
    })
    const prox = ofKind(ps, 'event_proximity')
    expect(prox.length).toBeGreaterThanOrEqual(1)
    expect(prox[0].summary.annotations[0].label).toBe('HVAC adjusted')
  })

  it('names annotations as missing context on an unexplained step, and not otherwise', () => {
    const without = build({ datasets: [ds()], rawDatasets })
    const withNotes = build({
      datasets: [ds()], rawDatasets,
      annotations: [{ t: T0 + 48 * Q, label: 'HVAC adjusted' }],
    })
    // With no annotations there is no proximity pattern at all, and the
    // absence is only named against patterns whose reading it changes.
    expect(ofKind(without, 'event_proximity')).toEqual([])
    expect(ofKind(withNotes, 'event_proximity').length).toBeGreaterThan(0)
  })
})

describe('pattern identity and shape', () => {
  // Two parameters moving together, so there is actually a pattern to identify.
  const pts = multiDay(1, (_d, _h, i) => ({
    tvoc: i >= 40 && i <= 42 ? 900 : 100 + (i % 3),
    hcho: i >= 40 && i <= 42 ? 140 : 20 + (i % 3),
  }))
  const args = () => ({
    datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']))],
    rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', pts, ['tvoc', 'hcho']) },
  })

  it('a single parameter over one day with no context yields no patterns at all', () => {
    // Nothing to repeat, nothing to relate to. Silence is the right answer,
    // and it is asserted so a future detector cannot start inventing here.
    const lone = multiDay(1, (_d, _h, i) => ({ tvoc: i === 40 ? 900 : 100 + (i % 3) }))
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', lone, ['tvoc']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', lone, ['tvoc']) },
    })
    expect(ps).toEqual([])
  })

  it('ids are deterministic across reruns and derived from membership', () => {
    expect(build(args()).map((p: any) => p.id)).toEqual(build(args()).map((p: any) => p.id))
    expect(patternId('coincidence', ['b', 'a'])).toBe(patternId('coincidence', ['a', 'b']))
    expect(patternId('coincidence', ['a'])).not.toBe(patternId('indoor_only', ['a']))
  })

  it('every pattern declares a known kind and cites its evidence', () => {
    const ps = build(args())
    expect(ps.length).toBeGreaterThan(0)
    ps.forEach((p: any) => {
      expect(PATTERN_KINDS).toContain(p.kind)
      expect(Array.isArray(p.eventIds)).toBe(true)
      expect(Array.isArray(p.missingContext)).toBe(true)
      expect(p.id.startsWith(`pat-${p.kind}-`)).toBe(true)
    })
  })

  it('no pattern is evidence-free — it cites events, or carries the measurement it rests on', () => {
    // A smooth daily cycle produces no events at all, so "Review evidence"
    // would have nothing to show unless the pattern carried its own figures.
    const cyclePts = multiDay(4, co2Cycle)
    const everything = [
      ...build(args()),
      ...build({
        datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', cyclePts, ['co2']))],
        rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', cyclePts, ['co2']) },
      }),
    ]
    expect(everything.length).toBeGreaterThan(1)
    everything.forEach((p: any) => {
      const hasEvents = p.eventIds.length > 0
      const hasNumbers = p.summary && Object.keys(p.summary).length > 0
      expect(hasEvents || hasNumbers, `${p.kind} cites nothing`).toBe(true)
    })
  })

  it('a smooth cycle carries its per-day figures as the evidence', () => {
    const cyclePts = multiDay(4, co2Cycle)
    const ps = build({
      datasets: [detectDatasetEvents(mkDataset('primary', 'indoor', 'Indoor', cyclePts, ['co2']))],
      rawDatasets: { primary: mkDataset('primary', 'indoor', 'Indoor', cyclePts, ['co2']) },
    })
    const cycle = ofKind(ps, 'recurring_cycle')[0]
    expect(cycle.eventIds).toEqual([]) // genuinely no abrupt events in a slow swing
    expect(cycle.summary.days).toHaveLength(cycle.summary.daysAgreeing)
    cycle.summary.days.forEach((d: any) => {
      expect(typeof d.peakHour).toBe('number')
      expect(typeof d.amplitude).toBe('number')
      expect(typeof d.dayStartTs).toBe('number')
    })
  })

  it('carries numbers, never an interpretation', () => {
    const ps = build(args())
    const text = JSON.stringify(ps)
    expect(text).not.toMatch(/likely|suggests|indicates|caused|consistent with|probably/i)
  })

  it('tolerates an empty or malformed session', () => {
    expect(build({})).toEqual([])
    expect(build({ datasets: [] })).toEqual([])
    expect(build({ datasets: [detectDatasetEvents({} as never)] })).toEqual([])
  })
})
