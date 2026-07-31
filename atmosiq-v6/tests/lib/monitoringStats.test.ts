/**
 * monitoringStats — deterministic statistics for the Indoor Environmental
 * Monitoring Report.
 *
 * These numbers land in a client deliverable that may become a record, so the
 * conventions are pinned here rather than left to implementation drift:
 * nearest-rank percentiles, sample standard deviation, interval-weighted
 * durations that never credit unmeasured time, and hour-of-day bucketing that
 * does not depend on the machine's timezone.
 */
import { describe, it, expect } from 'vitest'
import {
  mean,
  percentile,
  stdDev,
  nominalIntervalSec,
  readings,
  durationWhere,
  coverage,
  hourOfDayProfile,
  occupancySplit,
  parameterStats,
  GAP_FACTOR,
} from '../../src/utils/monitoringStats.js'

const T0 = 1_700_000_000_000 // fixed epoch ms; no wall-clock dependency
const MIN = 60_000

/** Evenly spaced points at `stepMin` minutes carrying `values` for `param`. */
function pts(values: (number | null)[], param = 'co2', stepMin = 1, start = T0) {
  return values.map((v, i) => ({ t: start + i * stepMin * MIN, [param]: v }))
}

describe('mean', () => {
  it('averages finite values and ignores nulls', () => {
    expect(mean([2, 4, 6])).toBe(4)
    expect(mean([2, null as never, 6])).toBe(4)
  })
  it('returns null for an empty sample', () => {
    expect(mean([])).toBeNull()
    expect(mean(null as never)).toBeNull()
  })
})

describe('percentile — nearest-rank', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  it('returns a value that was actually measured (no interpolation)', () => {
    // ceil(0.95 × 10) = 10 → the 10th smallest
    expect(percentile(ten, 95)).toBe(10)
    // ceil(0.50 × 10) = 5 → the 5th smallest
    expect(percentile(ten, 50)).toBe(5)
    // every result is a member of the input
    expect(ten).toContain(percentile(ten, 73))
  })

  it('is order-independent', () => {
    const shuffled = [7, 1, 10, 3, 9, 2, 8, 4, 6, 5]
    expect(percentile(shuffled, 95)).toBe(percentile(ten, 95))
  })

  it('resists a single spike dominating the summary (the reason p95 is reported)', () => {
    const calm = [...Array(99).fill(500), 1800]
    expect(percentile(calm, 95)).toBe(500) // p95 unmoved by the lone spike
    expect(Math.max(...calm)).toBe(1800) // …while the maximum still reports it
  })

  it('clamps the extremes and handles a single reading', () => {
    expect(percentile(ten, 0)).toBe(1)
    expect(percentile(ten, 100)).toBe(10)
    expect(percentile([42], 95)).toBe(42)
    expect(percentile([], 95)).toBeNull()
  })
})

describe('stdDev — sample (n − 1)', () => {
  it('matches the spreadsheet default', () => {
    // [1,2,3,4,5] → mean 3, Σ(x−m)² = 10, sample variance 10/4 = 2.5
    expect(stdDev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10)
  })
  it('is null (not zero) when undefined for the sample size', () => {
    expect(stdDev([7])).toBeNull()
    expect(stdDev([])).toBeNull()
  })
  it('is zero for a constant series', () => {
    expect(stdDev([5, 5, 5, 5])).toBe(0)
  })
})

describe('nominalIntervalSec', () => {
  it('takes the median gap so one long gap cannot inflate the cadence', () => {
    const p = [
      { t: T0, co2: 1 },
      { t: T0 + 60_000, co2: 1 },
      { t: T0 + 120_000, co2: 1 },
      { t: T0 + 3_720_000, co2: 1 }, // a one-hour gap
      { t: T0 + 3_780_000, co2: 1 },
    ]
    expect(nominalIntervalSec(p)).toBe(60)
  })
  it('returns null when there are too few timestamps', () => {
    expect(nominalIntervalSec([{ t: T0, co2: 1 }])).toBeNull()
    expect(nominalIntervalSec([])).toBeNull()
  })
})

describe('readings', () => {
  it('drops nulls and sorts ascending by time', () => {
    const p = [
      { t: T0 + 2 * MIN, co2: 3 },
      { t: T0, co2: 1 },
      { t: T0 + MIN, co2: null },
    ]
    expect(readings(p, 'co2').map((r) => r.v)).toEqual([1, 3])
  })
})

describe('durationWhere — interval-weighted', () => {
  it('credits each matching reading with the elapsed time to the next', () => {
    // 5 readings, 1-min spacing, 3 above 100. The last reading is not above,
    // so every credited span is a real measured minute: 3 × 60 s.
    const rs = readings(pts([150, 150, 150, 50, 50]), 'co2')
    expect(durationWhere(rs, (v) => v > 100, 60)).toBe(180)
  })

  it('never credits unmeasured time across a data gap', () => {
    // Two readings above the limit separated by a one-hour gap. The gap is
    // NOT exposure — the first reading is capped at one nominal interval.
    const rs = readings([
      { t: T0, co2: 150 },
      { t: T0 + 60 * MIN, co2: 150 },
    ], 'co2')
    expect(durationWhere(rs, (v) => v > 100, 60)).toBe(120) // 60 capped + 60 final
  })

  it('credits ordinary logger jitter as continuous monitoring', () => {
    // A reading landing 75 s late is within GAP_FACTOR (1.5 × 60 = 90 s),
    // so the true 75 s span is credited rather than capped.
    const rs = readings([
      { t: T0, co2: 150 },
      { t: T0 + 75_000, co2: 50 },
    ], 'co2')
    expect(GAP_FACTOR).toBe(1.5)
    expect(durationWhere(rs, (v) => v > 100, 60)).toBe(75)
  })

  it('credits the final reading with one nominal interval', () => {
    const rs = readings(pts([50, 50, 150]), 'co2')
    expect(durationWhere(rs, (v) => v > 100, 60)).toBe(60)
  })

  it('is null when the duration is not determinable', () => {
    const rs = readings(pts([150, 150]), 'co2')
    expect(durationWhere(rs, (v) => v > 100, null)).toBeNull()
    expect(durationWhere([], (v) => v > 100, 60)).toBeNull()
  })
})

describe('coverage', () => {
  it('reports full coverage for an unbroken series', () => {
    const c = coverage(pts(Array(61).fill(500)), 'co2')
    expect(c.intervalSec).toBe(60)
    expect(c.n).toBe(61)
    expect(c.expected).toBe(61)
    expect(c.coveragePct).toBeCloseTo(100, 6)
    expect(c.gapCount).toBe(0)
    expect(c.longestGapSec).toBeNull()
    expect(c.durationSec).toBe(3600)
  })

  it('counts gaps and reports the longest', () => {
    const p = [
      { t: T0, co2: 1 },
      { t: T0 + MIN, co2: 1 },
      { t: T0 + 2 * MIN, co2: 1 },
      { t: T0 + 12 * MIN, co2: 1 }, // 10-min gap
      { t: T0 + 13 * MIN, co2: 1 },
      { t: T0 + 18 * MIN, co2: 1 }, // 5-min gap
      { t: T0 + 19 * MIN, co2: 1 },
    ]
    const c = coverage(p, 'co2')
    expect(c.gapCount).toBe(2)
    expect(c.longestGapSec).toBe(600)
    expect(c.coveragePct).toBeLessThan(100)
  })

  it('never reports more than 100% when a logger briefly over-samples', () => {
    const p = [
      { t: T0, co2: 1 },
      { t: T0 + 30_000, co2: 1 },
      { t: T0 + 60_000, co2: 1 },
      { t: T0 + 75_000, co2: 1 },
      { t: T0 + 90_000, co2: 1 },
    ]
    const c = coverage(p, 'co2')
    expect(c.coveragePct).toBeLessThanOrEqual(100)
  })
})

describe('hourOfDayProfile', () => {
  it('always returns 24 buckets', () => {
    const prof = hourOfDayProfile(pts([1, 2, 3]), 'co2')
    expect(prof).toHaveLength(24)
    expect(prof.map((b) => b.hour)).toEqual([...Array(24).keys()])
  })

  it('does not depend on the host timezone (pure arithmetic, explicit offset)', () => {
    // Epoch 0 is 00:00 UTC by definition. A host-timezone-dependent
    // implementation (new Date().getHours()) would fail this outside UTC.
    const atEpoch = [{ t: 0, co2: 400 }]
    expect(hourOfDayProfile(atEpoch, 'co2')[0].n).toBe(1)
    expect(hourOfDayProfile(atEpoch, 'co2')[0].mean).toBe(400)
  })

  it('shifts buckets by the site UTC offset, including across midnight', () => {
    const atEpoch = [{ t: 0, co2: 400 }]
    // US Eastern (−300 min) at epoch 0 is the previous day, 19:00.
    const eastern = hourOfDayProfile(atEpoch, 'co2', { utcOffsetMin: -300 })
    expect(eastern[19].n).toBe(1)
    expect(eastern[0].n).toBe(0)
  })

  it('averages every reading that falls in the same hour', () => {
    const p = [
      { t: T0 - (T0 % 3600000), co2: 100 },
      { t: T0 - (T0 % 3600000) + 10 * MIN, co2: 300 },
    ]
    const filled = hourOfDayProfile(p, 'co2').filter((b) => b.n > 0)
    expect(filled).toHaveLength(1)
    expect(filled[0].mean).toBe(200)
  })
})

describe('occupancySplit', () => {
  it('separates occupied from unoccupied means', () => {
    const p = pts([500, 500, 1200, 1200, 500])
    const windows = [{ start: T0 + 2 * MIN, end: T0 + 3 * MIN }]
    const s = occupancySplit(p, 'co2', windows)
    expect(s.meanOccupied).toBe(1200)
    expect(s.meanUnoccupied).toBe(500)
    expect(s.delta).toBe(700)
  })
  it('is null throughout when no occupancy was marked', () => {
    const s = occupancySplit(pts([500, 600]), 'co2', [])
    expect(s).toEqual({ meanOccupied: null, meanUnoccupied: null, delta: null })
  })
})

describe('parameterStats — upper screening reference', () => {
  // 10 one-minute readings; 3 above the 1000 ppm reference.
  const p = pts([500, 600, 700, 1200, 1400, 1100, 800, 600, 500, 500])
  const st = parameterStats(p, 'co2', { reference: { limit: 1000 } })!

  it('reports the descriptive statistics', () => {
    expect(st.n).toBe(10)
    expect(st.max).toBe(1400)
    expect(st.min).toBe(500)
    expect(st.p95).toBe(1400) // nearest-rank: ceil(0.95×10)=10
    expect(st.mean).toBeCloseTo(790, 6)
  })

  it('cites when the maximum occurred', () => {
    expect(st.maxAt).toBe(T0 + 4 * MIN)
  })

  it('reports both the proportion and the duration above the reference', () => {
    expect(st.pctAbove).toBeCloseTo(30, 6)
    expect(st.timeAboveSec).toBe(180) // 3 measured minutes
  })

  it('leaves the comfort-band fields null for a threshold parameter', () => {
    expect(st.pctInBand).toBeNull()
    expect(st.timeOutsideSec).toBeNull()
  })

  it('reports zero exposure — not null — when the reference is never exceeded', () => {
    const calm = parameterStats(pts([400, 450, 500]), 'co2', { reference: { limit: 1000 } })!
    expect(calm.pctAbove).toBe(0)
    expect(calm.timeAboveSec).toBe(0)
  })
})

describe('parameterStats — comfort band', () => {
  // 10 readings; 2 outside the 68–76 °F band (one low, one high).
  const p = pts([70, 71, 72, 66, 73, 74, 79, 72, 71, 70], 'temp')
  const st = parameterStats(p, 'temp', { reference: { band: [68, 76] } })!

  it('reports time in band and time outside it', () => {
    expect(st.pctInBand).toBeCloseTo(80, 6)
    expect(st.timeOutsideSec).toBe(120)
  })

  it('counts excursions below the band, not only above it', () => {
    // A band can be breached in either direction — the reason the report says
    // "Outside Reference" rather than "Above Reference" for banded parameters.
    const cold = parameterStats(pts([60, 61, 62], 'temp'), 'temp', { reference: { band: [68, 76] } })!
    expect(cold.pctInBand).toBe(0)
    expect(cold.max).toBeLessThan(68)
  })

  it('leaves the threshold fields null for a banded parameter', () => {
    expect(st.pctAbove).toBeNull()
    expect(st.timeAboveSec).toBeNull()
  })
})

describe('parameterStats — degraded inputs', () => {
  it('returns null when the parameter has no usable readings', () => {
    expect(parameterStats(pts([null, null]), 'co2')).toBeNull()
    expect(parameterStats([], 'co2')).toBeNull()
  })

  it('still returns descriptive statistics with no reference selected', () => {
    const st = parameterStats(pts([500, 600, 700]), 'co2')!
    expect(st.mean).toBe(600)
    expect(st.pctAbove).toBeNull()
    expect(st.pctInBand).toBeNull()
  })

  it('survives a dataset with no timestamps', () => {
    const p = [{ co2: 500 }, { co2: 1500 }]
    const st = parameterStats(p, 'co2', { reference: { limit: 1000 } })!
    expect(st.n).toBe(2)
    expect(st.pctAbove).toBeCloseTo(50, 6)
    expect(st.timeAboveSec).toBeNull() // no cadence → duration unknowable
    expect(st.coverage.coveragePct).toBeNull()
  })

  it('is deterministic — identical input yields identical output', () => {
    const a = parameterStats(pts([500, 1200, 700]), 'co2', { reference: { limit: 1000 } })
    const b = parameterStats(pts([500, 1200, 700]), 'co2', { reference: { limit: 1000 } })
    expect(a).toEqual(b)
  })
})
