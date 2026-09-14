/**
 * Forensic events — does the detector find real temporal structure, and does
 * it stay quiet otherwise?
 *
 * Two properties matter more than any individual case:
 *
 *   1. NOTHING IN HERE IS A CONCENTRATION. Every fixture below is built in
 *      arbitrary units, and the same shape in a different unit must produce the
 *      same events. A detector that had absorbed an IAQ threshold would fail
 *      the scale-invariance test at the bottom.
 *   2. SILENCE IS THE DEFAULT. A trace that is short, flat, timestamp-less or
 *      featureless yields no events at all.
 */
import { describe, it, expect } from 'vitest'
import {
  detectParameterEvents, detectDatasetEvents, eventId, median, robustSpread,
  inferredResolution, fnv1aHex, EVENT_KINDS, MIN_SERIES_SAMPLES, MIN_RUN_SAMPLES,
  K_OUTLIER, MAD_TO_SIGMA,
} from '../../src/utils/forensicEvents.js'

const T0 = Date.UTC(2026, 2, 2, 8, 0, 0)
const STEP_MS = 5 * 60_000 // a 5-minute logger

/** Points from a bare value list, one every 5 minutes from T0. */
const series = (param: string, values: Array<number | null>, t0 = T0) =>
  values.map((v, i) => (v == null ? { t: t0 + i * STEP_MS } : { t: t0 + i * STEP_MS, [param]: v }))

/** A quiet trace: `n` readings wobbling by ±1 around `base`, deterministic. */
const quiet = (n: number, base = 400) =>
  Array.from({ length: n }, (_, i) => base + (i % 3) - 1)

const kinds = (evs: any[]) => evs.map((e) => e.kind)

describe('robust statistics used by the detectors', () => {
  it('median and MAD are computed without mutating the input', () => {
    const input = [5, 1, 3]
    expect(median(input)).toBe(3)
    expect(input).toEqual([5, 1, 3])
    const { median: m, mad } = robustSpread([1, 1, 1, 5])
    expect(m).toBe(1)
    expect(mad).toBe(0)
  })

  it('falls back to the non-zero deviations when MAD degenerates to zero', () => {
    // More than half the sample identical makes MAD exactly 0, which would say
    // "no dispersion" and silence every detector. Common on a quantized logger.
    const { mad, sigma } = robustSpread([1, 1, 1, 5])
    expect(mad).toBe(0)
    expect(sigma).toBeGreaterThan(0)
    // A genuinely constant sample still has none.
    expect(robustSpread([7, 7, 7, 7]).sigma).toBeNull()
  })

  it('floating-point dust is not mistaken for dispersion', () => {
    // Deviations of 1e-13 against values in the hundreds are non-zero to the
    // machine. Treating them as scale would make every ordinary sample an
    // outlier — the MAD degeneracy arrived at from the other side.
    const dusty = [500, 500 + 1e-13, 500 - 1e-13, 500, 580, 580 + 1e-13]
    const { sigma } = robustSpread(dusty)
    expect(sigma).toBeGreaterThan(1) // the 80-unit split, not the 1e-13 dust
  })

  it('the fallback scale is never smaller than MAD would give, so it cannot add sensitivity', () => {
    const spread = robustSpread([10, 10, 10, 10, 40])
    expect(spread.sigma).toBeGreaterThan((spread.mad as number) * MAD_TO_SIGMA)
  })

  it('sigma is MAD scaled to the normal-consistency constant', () => {
    const { mad, sigma } = robustSpread([10, 12, 14, 16, 18])
    expect(sigma).toBeCloseTo((mad as number) * MAD_TO_SIGMA, 10)
  })

  it('resolution is the smallest non-zero step actually observed, or null', () => {
    expect(inferredResolution([10, 10.5, 11, 11])).toBe(0.5)
    expect(inferredResolution([7, 7, 7])).toBeNull()
  })

  it('the id hash is stable and 8 hex chars', () => {
    expect(fnv1aHex('abc')).toBe(fnv1aHex('abc'))
    expect(fnv1aHex('abc')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1aHex('abc')).not.toBe(fnv1aHex('abd'))
  })
})

describe('silence is the default', () => {
  it('a trace shorter than the minimum yields nothing', () => {
    const pts = series('co2', quiet(MIN_SERIES_SAMPLES - 1))
    expect(detectParameterEvents(pts, 'co2')).toEqual([])
  })

  it('readings without timestamps yield nothing', () => {
    const pts = quiet(40).map((v) => ({ co2: v })) // no t
    expect(detectParameterEvents(pts, 'co2')).toEqual([])
  })

  it('a featureless trace yields no level or step events', () => {
    const evs = detectParameterEvents(series('co2', quiet(60)), 'co2')
    expect(evs.filter((e) => e.kind !== 'flatline')).toEqual([])
  })

  it('an absent parameter yields nothing', () => {
    expect(detectParameterEvents(series('co2', quiet(40)), 'pm')).toEqual([])
  })
})

describe('isolated peaks', () => {
  it('finds a single spike that returns to baseline', () => {
    const vals = quiet(40)
    vals[20] = 900 // one excursion, one sample wide
    const evs = detectParameterEvents(series('tvoc', vals), 'tvoc', { unit: 'ppb' })
    const peaks = evs.filter((e) => e.kind === 'peak')
    expect(peaks).toHaveLength(1)
    expect(peaks[0].peakValue).toBe(900)
    expect(peaks[0].peakAt).toBe(T0 + 20 * STEP_MS)
    expect(peaks[0].samples).toBe(1)
    expect(peaks[0].unit).toBe('ppb')
    // It states a shape, never a verdict.
    expect(Object.keys(peaks[0])).not.toContain('severity')
    expect(Object.keys(peaks[0])).not.toContain('exceeds')
  })

  it('finds several separate spikes and gives each its own id', () => {
    const vals = quiet(60)
    vals[10] = 800; vals[30] = 850; vals[50] = 820
    const peaks = detectParameterEvents(series('tvoc', vals), 'tvoc').filter((e) => e.kind === 'peak')
    expect(peaks).toHaveLength(3)
    expect(new Set(peaks.map((p) => p.id)).size).toBe(3)
  })

  it('does not call a lasting rise a peak — that is a sustained elevation', () => {
    const vals = quiet(60)
    for (let i = 20; i < 40; i++) vals[i] = 900
    const evs = detectParameterEvents(series('tvoc', vals), 'tvoc')
    expect(kinds(evs)).toContain('sustained')
    expect(kinds(evs)).not.toContain('peak')
  })
})

describe('sustained elevation', () => {
  it('finds a long run above the trace’s own level and measures its duration', () => {
    const vals = quiet(60, 20) // a formaldehyde-shaped baseline, in arbitrary units
    for (let i = 20; i < 40; i++) vals[i] = 120 // 20 samples elevated above it
    const sus = detectParameterEvents(series('hcho', vals, T0), 'hcho', { unit: 'ppb' })
      .filter((e) => e.kind === 'sustained')
    expect(sus).toHaveLength(1)
    expect(sus[0].samples).toBe(20)
    expect(sus[0].startTs).toBe(T0 + 20 * STEP_MS)
    expect(sus[0].durationSec).toBe(19 * 300) // 19 gaps of 5 minutes
    expect(sus[0].magnitude).toBeGreaterThan(0)
  })

  it('a run shorter than the minimum is not sustained', () => {
    const vals = quiet(60)
    for (let i = 20; i < 20 + MIN_RUN_SAMPLES - 1; i++) vals[i] = 900
    const evs = detectParameterEvents(series('hcho', vals), 'hcho')
    expect(kinds(evs)).not.toContain('sustained')
  })
})

describe('abrupt rises and falls', () => {
  it('finds a step up and the matching step down', () => {
    const vals = quiet(60)
    for (let i = 25; i < 45; i++) vals[i] = 1200
    const evs = detectParameterEvents(series('co2', vals), 'co2', { unit: 'ppm' })
    expect(kinds(evs)).toContain('step_up')
    expect(kinds(evs)).toContain('step_down')
    const up = evs.find((e) => e.kind === 'step_up')
    expect(up.magnitude).toBeGreaterThan(700)
    expect(up.baseline).toBeLessThan(500)
  })

  it('merges a multi-sample ramp into one rise rather than one per sample', () => {
    const vals = quiet(60)
    // A four-sample ramp, each step far larger than the quiet wobble.
    vals[30] = 700; vals[31] = 1000; vals[32] = 1300; vals[33] = 1600
    for (let i = 34; i < 60; i++) vals[i] = 1600
    const ups = detectParameterEvents(series('co2', vals), 'co2').filter((e) => e.kind === 'step_up')
    expect(ups).toHaveLength(1)
    expect(ups[0].samples).toBeGreaterThan(2)
  })
})

describe('abrupt steps on a trending trace', () => {
  /**
   * The case that makes or breaks this detector. A trace climbing steadily has
   * a large ordinary first difference and a tiny spread around it, so testing
   * the raw difference against K·sigma labels every ordinary sample an abrupt
   * rise. The test has to be on the residual from the usual step.
   */
  const drift = (n: number, perSample: number, base = 400) =>
    Array.from({ length: n }, (_, i) => base + i * perSample + ((i % 3) - 1) * 0.01)

  it('a steady upward drift contains no abrupt event', () => {
    const evs = detectParameterEvents(series('co2', drift(60, 1)), 'co2')
    expect(kinds(evs)).not.toContain('step_up')
    expect(kinds(evs)).not.toContain('step_down')
  })

  it('a steady downward drift contains no abrupt event', () => {
    const evs = detectParameterEvents(series('co2', drift(60, -1)), 'co2')
    expect(kinds(evs)).not.toContain('step_up')
    expect(kinds(evs)).not.toContain('step_down')
  })

  it('a steady climb with one genuine jump reports exactly that jump', () => {
    const vals = drift(60, 1)
    for (let i = 30; i < 60; i++) vals[i] += 500 // one abnormal step at i=30
    const ups = detectParameterEvents(series('co2', vals), 'co2').filter((e) => e.kind === 'step_up')
    expect(ups).toHaveLength(1)
    expect(ups[0].startTs).toBe(T0 + 29 * STEP_MS)
    // The excess strips the climb the trace was already carrying.
    expect(ups[0].excess).toBeGreaterThan(400)
    expect(ups[0].driftPerSample).toBeCloseTo(1, 1)
  })

  it('a steady climb with one genuine drop reports a fall, not another rise', () => {
    const vals = drift(60, 1)
    for (let i = 30; i < 60; i++) vals[i] -= 500
    const evs = detectParameterEvents(series('co2', vals), 'co2')
    const downs = evs.filter((e) => e.kind === 'step_down')
    expect(downs).toHaveLength(1)
    expect(evs.filter((e) => e.kind === 'step_up')).toEqual([])
  })

  it('a pause in a steady climb is the anomaly, and reads as a fall relative to it', () => {
    // Values hold flat for a stretch while the trace was climbing 1 per sample.
    const vals = drift(60, 1)
    const held = vals[30]
    for (let i = 30; i < 40; i++) vals[i] = held
    for (let i = 40; i < 60; i++) vals[i] -= 10
    const evs = detectParameterEvents(series('co2', vals), 'co2')
    // Whatever else it finds, it must not call the pause a rise.
    const risesInPause = evs.filter((e) => e.kind === 'step_up'
      && e.startTs >= T0 + 30 * STEP_MS && e.startTs < T0 + 39 * STEP_MS)
    expect(risesInPause).toEqual([])
  })

  it('a perfectly linear ramp has no unusual step at all', () => {
    const exact = Array.from({ length: 60 }, (_, i) => 400 + i * 5)
    expect(detectParameterEvents(series('co2', exact), 'co2')
      .filter((e) => e.kind === 'step_up' || e.kind === 'step_down')).toEqual([])
  })
})

describe('flatline', () => {
  it('finds a stuck channel inside an otherwise moving trace', () => {
    const vals = quiet(60)
    for (let i = 30; i < 50; i++) vals[i] = 412
    const flat = detectParameterEvents(series('co2', vals), 'co2').filter((e) => e.kind === 'flatline')
    expect(flat.length).toBeGreaterThanOrEqual(1)
    const stuck = flat.find((f) => f.startTs === T0 + 30 * STEP_MS)
    expect(stuck).toBeTruthy()
    expect(stuck.samples).toBe(20)
    expect(stuck.magnitude).toBe(0)
  })

  it('finds a wholly constant trace, which has no step to infer a resolution from', () => {
    const pts = series('co2', Array.from({ length: 40 }, () => 412))
    const evs = detectParameterEvents(pts, 'co2')
    expect(kinds(evs)).toEqual(['flatline'])
    expect(evs[0].samples).toBe(40)
  })
})

describe('data gaps', () => {
  it('reports a break longer than the nominal interval allows', () => {
    const vals = quiet(40)
    const pts: any[] = series('co2', vals)
    // Push everything from index 20 on forward by two hours.
    for (let i = 20; i < pts.length; i++) pts[i].t += 2 * 3600_000
    const gaps = detectParameterEvents(pts, 'co2').filter((e) => e.kind === 'gap')
    expect(gaps).toHaveLength(1)
    expect(gaps[0].durationSec).toBeGreaterThan(3600)
    expect(gaps[0].magnitude).toBeNull()
  })

  it('an evenly sampled trace has no gaps', () => {
    const gaps = detectParameterEvents(series('co2', quiet(40)), 'co2').filter((e) => e.kind === 'gap')
    expect(gaps).toEqual([])
  })
})

describe('event identity', () => {
  it('is derived from identity, not array position', () => {
    expect(eventId('primary', 'co2', 'peak', T0)).toBe(eventId('primary', 'co2', 'peak', T0))
    expect(eventId('primary', 'co2', 'peak', T0)).not.toBe(eventId('primary', 'co2', 'peak', T0 + 1))
    expect(eventId('primary', 'co2', 'peak', T0)).not.toBe(eventId('ds-2', 'co2', 'peak', T0))
    expect(eventId('primary', 'co2', 'peak', T0)).not.toBe(eventId('primary', 'pm', 'peak', T0))
  })

  it('an unrelated later event does not renumber an earlier one', () => {
    const a = quiet(60); a[10] = 800
    const b = quiet(60); b[10] = 800; b[40] = 850
    const firstOfA = detectParameterEvents(series('tvoc', a), 'tvoc').filter((e) => e.kind === 'peak')[0]
    const firstOfB = detectParameterEvents(series('tvoc', b), 'tvoc').filter((e) => e.kind === 'peak')[0]
    expect(firstOfA.id).toBe(firstOfB.id)
  })

  it('re-running the same input reproduces the same ids in the same order', () => {
    const vals = quiet(60); vals[10] = 800; vals[30] = 900
    const pts = series('tvoc', vals)
    expect(detectParameterEvents(pts, 'tvoc').map((e) => e.id))
      .toEqual(detectParameterEvents(pts, 'tvoc').map((e) => e.id))
  })

  it('every emitted kind is in the declared vocabulary', () => {
    const vals = quiet(60)
    vals[10] = 900
    for (let i = 25; i < 45; i++) vals[i] = 1200
    const evs = detectParameterEvents(series('co2', vals), 'co2')
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => expect(EVENT_KINDS).toContain(e.kind))
  })
})

describe('no concentration thresholds leaked in', () => {
  it('the same shape in different units produces the same events', () => {
    // Identical shape, scaled by 1000 as if ppm became ppb.
    const shape = quiet(60)
    shape[20] = 900
    for (let i = 30; i < 50; i++) shape[i] = 700
    const small = detectParameterEvents(series('tvoc', shape), 'tvoc')
    const large = detectParameterEvents(series('tvoc', shape.map((v) => v * 1000)), 'tvoc')
    expect(kinds(large)).toEqual(kinds(small))
    expect(large.map((e) => e.startTs)).toEqual(small.map((e) => e.startTs))
  })

  it('a trace that never leaves a comfortable range still reports its structure', () => {
    // Every value here would pass any IAQ criterion; the shape is still real.
    const vals = quiet(60, 450)
    for (let i = 30; i < 50; i++) vals[i] = 520
    const evs = detectParameterEvents(series('co2', vals), 'co2')
    expect(kinds(evs)).toContain('sustained')
  })

  it('the tunable constants carry no unit', () => {
    expect(K_OUTLIER).toBe(3)
    expect(MIN_SERIES_SAMPLES).toBeGreaterThan(0)
    expect(MIN_RUN_SAMPLES).toBeGreaterThan(0)
  })
})

describe('detectDatasetEvents', () => {
  it('sweeps every parameter and returns coverage beside the events', () => {
    const co2 = quiet(60); co2[20] = 1500
    const pm = quiet(60, 8); pm[40] = 90
    const points = co2.map((v, i) => ({ t: T0 + i * STEP_MS, co2: v, pm: pm[i] }))
    const out = detectDatasetEvents({
      id: 'ds-1', role: 'zone', label: 'Conference B',
      points, params: ['co2', 'pm'], units: { co2: 'ppm', pm: 'µg/m³' },
    })
    expect(out.datasetId).toBe('ds-1')
    expect(out.role).toBe('zone')
    expect(out.label).toBe('Conference B')
    expect(out.params).toEqual(['co2', 'pm'])
    expect(out.events.some((e) => e.param === 'co2')).toBe(true)
    expect(out.events.some((e) => e.param === 'pm')).toBe(true)
    expect(out.coverage.co2.n).toBe(60)
    expect(out.coverage.pm.coveragePct).toBeCloseTo(100, 5)
    // Ascending by start time.
    const starts = out.events.map((e) => e.startTs)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('tolerates an empty or malformed dataset', () => {
    expect(detectDatasetEvents(null as never).events).toEqual([])
    expect(detectDatasetEvents({} as never).events).toEqual([])
    expect(detectDatasetEvents({ points: [], params: ['co2'] } as never).events).toEqual([])
  })
})
