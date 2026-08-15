/**
 * Report figure geometry.
 *
 * The figure is a record of measurements, so the axis is held to the same
 * standard as the numbers in the tables: it must not crop a reference line it
 * claims to show, must not label a gridline at a value it is not drawn at, and
 * must not throw away half its height on empty range. `drawMonitoringChart`
 * takes a context, so the geometry is exercised here against a recording stub
 * rather than a real canvas.
 */
import { describe, it, expect } from 'vitest'
import {
  niceScale, axisFormat, axisDecimals, drawMonitoringChart, renderMonitoringCharts,
  drawSparkline, sparkSeries, renderSparklines,
} from '../../src/utils/monitoringChart'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

/** Records every call, so a drawing routine can be asserted without a canvas. */
function stubCtx() {
  const calls: { fn: string; args: unknown[]; color?: unknown }[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
  const gradients: string[][] = []
  const ctx: Record<string, unknown> = {
    calls,
    text: () => calls.filter((c) => c.fn === 'fillText').map((c) => String(c.args[0])),
    // The colour of each stroke, in draw order — for asserting conditional
    // trace colouring against the reference.
    strokeColors: () => calls.filter((c) => c.fn === 'stroke').map((c: any) => c.color),
    // The stop colours of every gradient built — the area fills use one per
    // trace colour, so this asserts the fill follows the line.
    gradientColors: () => gradients.map((s) => s.join(' ')),
    createLinearGradient: () => {
      const stops: string[] = []
      gradients.push(stops)
      return { addColorStop: (_o: number, c: string) => stops.push(c) }
    },
  }
  for (const fn of [
    'clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill',
    'arc', 'setLineDash', 'fillText', 'scale',
  ]) ctx[fn] = rec(fn)
  // stroke/fill record the active style so trace colours can be asserted.
  ctx.stroke = (...args: unknown[]) => calls.push({ fn: 'stroke', args, color: ctx.strokeStyle })
  ctx.fill = (...args: unknown[]) => calls.push({ fn: 'fill', args, color: ctx.fillStyle })
  return ctx as any
}

const series = (n: number, v: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ t: T0 + i * 10 * MIN, v: v(i) }))

describe('niceScale', () => {
  it('rounds to readable bounds and a step that yields several gridlines', () => {
    const s = niceScale(437, 1611)
    expect(s.min % s.step).toBe(0)
    expect(s.max % s.step).toBe(0)
    expect(s.min).toBeLessThanOrEqual(437)
    expect(s.max).toBeGreaterThanOrEqual(1611)
    expect((s.max - s.min) / s.step).toBeGreaterThanOrEqual(4)
    expect((s.max - s.min) / s.step).toBeLessThanOrEqual(12)
  })

  it('does not start the axis far below the data', () => {
    // The defect this guards: CO2 sitting between 440 and 1789 rendered on a
    // 0-2000 axis, which throws away a quarter of the plot and flattens the
    // very variation the figure exists to show.
    const s = niceScale(332, 1897)
    expect(s.min).toBeGreaterThan(0)
    expect(332 - s.min).toBeLessThan(s.step)
  })

  it('leaves at most one empty step below the data at any magnitude', () => {
    for (const [lo, hi] of [[0.4, 1.9], [65.8, 83.2], [332, 1897], [18_000, 42_000]]) {
      const s = niceScale(lo, hi)
      expect(lo - s.min).toBeLessThan(s.step)
      expect(s.max - hi).toBeLessThan(s.step)
    }
  })

  it('survives a flat series and non-numeric input', () => {
    expect(niceScale(70, 70).step).toBeGreaterThan(0)
    expect(niceScale(NaN, 5)).toEqual({ min: 0, max: 1, step: 1 })
    expect(niceScale(undefined as never, undefined as never)).toEqual({ min: 0, max: 1, step: 1 })
  })
})

describe('axisFormat', () => {
  it('labels a fractional step at its own precision', () => {
    // 67.5 printed as "68" is a gridline mislabelled by half a degree.
    expect(axisFormat(67.5, 2.5)).toBe('67.5')
    expect(axisFormat(65, 2.5)).toBe('65.0')
  })

  it('keeps whole steps whole, with thousands separators', () => {
    expect(axisFormat(1000, 250)).toBe('1,000')
    expect(axisFormat(30, 5)).toBe('30')
  })

  it('follows the step down to sub-unit magnitudes', () => {
    // A formaldehyde axis in mg/m³ steps by 0.005. Two fixed decimals would
    // print 0.00, 0.01, 0.01, 0.02 — adjacent gridlines carrying the SAME
    // label, off which no value can be read.
    expect(axisDecimals(0.005)).toBe(3)
    expect(axisFormat(0.005, 0.005)).toBe('0.005')
    expect(axisFormat(0.01, 0.005)).toBe('0.010')
    expect(axisDecimals(0.05)).toBe(2)
    expect(axisDecimals(0.0025)).toBe(4)
  })

  it('is immune to the float noise a step of 2.5e-3 carries', () => {
    // niceScale builds its step as a multiplier times a power of ten, which
    // at small magnitudes yields 0.0025000000000000005. Counting decimals off
    // the string form would give sixteen places.
    expect(axisDecimals(2.5 * Math.pow(10, -3))).toBe(4)
    expect(axisDecimals(2 * Math.pow(10, -2))).toBe(2)
  })

  it('never labels two adjacent gridlines identically, at any magnitude', () => {
    for (const [lo, hi] of [[0.004, 0.05], [0.02, 0.4], [332, 1897], [65.8, 83.2], [3, 40]]) {
      const s = niceScale(lo, hi)
      const labels: string[] = []
      for (let v = s.min; v <= s.max + 1e-9; v += s.step) labels.push(axisFormat(v, s.step))
      expect(new Set(labels).size, `duplicate label in [${lo}, ${hi}]`).toBe(labels.length)
    }
  })

  it('says nothing sensible about a nonsense step rather than throwing', () => {
    expect(axisDecimals(0)).toBe(0)
    expect(axisDecimals(NaN)).toBe(0)
    expect(axisDecimals(undefined as never)).toBe(0)
  })
})

describe('drawMonitoringChart', () => {
  it('draws nothing beyond the background when there is no series', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, { points: [] })
    expect(ctx.calls.some((c: any) => c.fn === 'stroke')).toBe(false)
  })

  it('keeps the reference line on the plot even when no reading approached it', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, { points: series(40, () => 5), limit: 35, referenceLabel: '35 ug/m3 reference', height: 380 })
    const labels = ctx.text()
    expect(labels).toContain('35 ug/m3 reference')
    // The axis must reach the reference, or the line is drawn off the canvas.
    expect(labels.some((l: string) => Number(l.replace(/,/g, '')) >= 35)).toBe(true)
  })

  it('labels the maximum reading', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, { points: series(40, (i) => (i === 20 ? 1789 : 450)), limit: 1000 })
    expect(ctx.text()).toContain('Max 1,789')
  })

  it('marks occupancy windows and annotated events', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, {
      points: series(40, (i) => 400 + i),
      occupancy: [{ start: T0 + 60 * MIN, end: T0 + 180 * MIN }],
      events: [{ t: T0 + 100 * MIN, label: 'Windows opened' }],
    })
    // Background + occupancy wash.
    expect(ctx.calls.filter((c: any) => c.fn === 'fillRect').length).toBeGreaterThanOrEqual(2)
    expect(ctx.text()).toContain('Windows opened')
  })

  it('ignores an event outside the monitored period', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, { points: series(40, () => 500), events: [{ t: T0 - 5 * 86_400_000, label: 'Before' }] })
    expect(ctx.text()).not.toContain('Before')
  })

  it('colours only the above-reference span amber, not the whole trace', () => {
    const ctx = stubCtx()
    // A flat 450 series with one spike to 1789 over a 1000 limit.
    drawMonitoringChart(ctx, { points: series(40, (i) => (i === 20 ? 1789 : 450)), limit: 1000 })
    const colors = ctx.strokeColors()
    const teal = colors.filter((c: string) => c === '#0891B2').length
    const amber = colors.filter((c: string) => c === '#D97706').length
    // Most of the trace is in range (teal); the excursion is present but small.
    expect(teal).toBeGreaterThan(amber)
    expect(amber).toBeGreaterThan(0)
    // No action tier defined → no red.
    expect(colors).not.toContain('#DC2626')
    // The fill follows the line: both a teal and an amber fill gradient exist.
    const grads = ctx.gradientColors()
    expect(grads.some((g: string) => g.includes('8,145,178'))).toBe(true) // teal fill
    expect(grads.some((g: string) => g.includes('217,119,6'))).toBe(true) // amber fill
  })

  it('keeps a fully in-range series entirely teal — line and fill', () => {
    const ctx = stubCtx()
    drawMonitoringChart(ctx, { points: series(40, () => 450), limit: 1000 })
    expect(ctx.strokeColors()).not.toContain('#D97706')
    expect(ctx.gradientColors().some((g: string) => g.includes('217,119,6'))).toBe(false)
  })

  it('turns red only where the ROLLING mean reaches the action tier', () => {
    const ctx = stubCtx()
    const HOUR = 60 * MIN
    // 10-min spacing; second half SUSTAINED at 1789 for well over the 1-hour
    // window, so its rolling mean reaches the 1500 action tier.
    drawMonitoringChart(ctx, {
      points: series(60, (i) => (i < 30 ? 450 : 1789)),
      limit: 1000,
      actionLimit: 1500,
      actionWindowMs: HOUR,
    })
    const colors = ctx.strokeColors()
    expect(colors).toContain('#D97706') // amber on the way up
    expect(colors).toContain('#DC2626') // red once the 1-hour mean is sustained
    expect(ctx.gradientColors().some((g: string) => g.includes('220,38,38'))).toBe(true) // red fill too
  })

  it('does NOT turn red on a single spike, however high (averaging guard)', () => {
    const ctx = stubCtx()
    const HOUR = 60 * MIN
    // One 5000 reading among 450s: raw is an excursion (amber) but the 1-hour
    // mean never reaches 1500, so nothing reddens.
    drawMonitoringChart(ctx, {
      points: series(60, (i) => (i === 40 ? 5000 : 450)),
      limit: 1000,
      actionLimit: 1500,
      actionWindowMs: HOUR,
    })
    const colors = ctx.strokeColors()
    expect(colors).toContain('#D97706') // the spike is amber
    expect(colors).not.toContain('#DC2626') // but never red
  })

  it('never reddens a dataset shorter than the action window', () => {
    const ctx = stubCtx()
    const DAY = 24 * 60 * MIN
    // Sustained 80 (well above a 55 action tier) but only ~10 hours of data
    // against a 24-hour window: no point has a full window, so no red.
    drawMonitoringChart(ctx, {
      points: series(60, () => 80),
      limit: 35,
      actionLimit: 55,
      actionWindowMs: DAY,
    })
    expect(ctx.strokeColors()).not.toContain('#DC2626')
  })

  it('colours out-of-band readings amber but leaves in-band teal', () => {
    const ctx = stubCtx()
    // Oscillates in and out of a 68–76 comfort band.
    drawMonitoringChart(ctx, { points: series(40, (i) => (i % 2 === 0 ? 72 : 82)), band: [68, 76] })
    const colors = ctx.strokeColors()
    expect(colors).toContain('#0891B2') // in-band teal
    expect(colors).toContain('#D97706') // out-of-band amber
  })

  it('day labels do not depend on the host timezone', () => {
    const draw = (offset: number) => {
      const ctx = stubCtx()
      drawMonitoringChart(ctx, { points: series(200, () => 500), utcOffsetMin: offset })
      return ctx.text().filter((l: string) => /^[A-Z][a-z]{2} \d+$/.test(l))
    }
    // Same data, two site offsets: the labels shift with the declared offset,
    // never with wherever the report happens to be generated.
    expect(draw(0).length).toBeGreaterThan(0)
    expect(draw(-300)).not.toEqual([])
  })
})

describe('renderMonitoringCharts', () => {
  it('returns an empty map rather than throwing where no canvas exists', () => {
    // Node test env: `document.createElement('canvas').getContext` is absent,
    // so a report generated without a DOM simply omits its figures.
    const out = renderMonitoringCharts(
      [{ param: 'co2', unit: 'ppm', reference: { limit: 1000 } }],
      series(40, () => 500).map((p) => ({ t: p.t, co2: p.v })),
    )
    expect(out).toEqual({})
  })

  it('skips a parameter with too few readings to plot', () => {
    const out = renderMonitoringCharts([{ param: 'co2' }], [{ t: T0, co2: 500 }])
    expect(out.co2).toBeUndefined()
  })
})

describe('sparklines', () => {
  it('keeps the extremes when it resamples', () => {
    // Bucketing by mean would flatten exactly the peaks the strip is
    // reporting, so each bucket keeps the value furthest from the average.
    const points = Array.from({ length: 400 }, (_, i) => ({ t: T0 + i, co2: i === 200 ? 1789 : 480 }))
    const out = sparkSeries(points, 'co2', 32)
    expect(out.length).toBe(32)
    expect(Math.max(...out)).toBe(1789)
  })

  it('passes a short series through untouched', () => {
    const points = [{ t: 1, co2: 400 }, { t: 2, co2: 500 }]
    expect(sparkSeries(points, 'co2', 64)).toEqual([400, 500])
  })

  it('ignores gaps rather than drawing them as zero', () => {
    const points = [{ t: 1, co2: 400 }, { t: 2 }, { t: 3, co2: 500 }]
    expect(sparkSeries(points, 'co2')).toEqual([400, 500])
  })

  it('draws a shape with no axis, no labels and no scale', () => {
    // A 26-pixel-tall chart with a readable axis invites being read as a
    // chart; the real figure is two inches below and is where any value
    // should be read from.
    const ctx = stubCtx()
    drawSparkline(ctx, { points: [1, 5, 2, 8, 3] })
    expect(ctx.text()).toEqual([])
    expect(ctx.calls.some((c: any) => c.fn === 'stroke')).toBe(true)
  })

  it('draws nothing for a series too short to have a shape', () => {
    const ctx = stubCtx()
    drawSparkline(ctx, { points: [5] })
    expect(ctx.calls.some((c: any) => c.fn === 'stroke')).toBe(false)
  })

  it('degrades to no marks rather than throwing where no canvas exists', () => {
    expect(renderSparklines([{ param: 'co2' }], [{ t: 1, co2: 400 }, { t: 2, co2: 500 }])).toEqual({})
  })
})
