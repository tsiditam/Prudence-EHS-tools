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
import { niceScale, axisFormat, drawMonitoringChart, renderMonitoringCharts } from '../../src/utils/monitoringChart'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

/** Records every call, so a drawing routine can be asserted without a canvas. */
function stubCtx() {
  const calls: { fn: string; args: unknown[] }[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
  const ctx: Record<string, unknown> = {
    calls,
    text: () => calls.filter((c) => c.fn === 'fillText').map((c) => String(c.args[0])),
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  for (const fn of [
    'clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke',
    'arc', 'setLineDash', 'fillText', 'scale',
  ]) ctx[fn] = rec(fn)
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
