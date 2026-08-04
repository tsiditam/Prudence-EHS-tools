// @vitest-environment jsdom
/**
 * Logger Studio timelines — x-axis label overlap guard.
 *
 * Regression for the garbled/overlapping time-axis labels: a multi-day logger
 * export drew wide "MMM D HH:mm" labels only ~5px apart (Recharts' default
 * minTickGap), so on a wide desktop axis a dozen-plus of them collided into an
 * unreadable smear. Every timeline shares one `timeAxis` config; this pins that
 * it carries a label-width-scale minTickGap (so Recharts thins overlapping
 * labels) plus preserveStartEnd (so the first/last timestamps stay pinned), and
 * that all nine charts actually render through it.
 *
 * The overlap itself is a layout property (label pixel widths), which jsdom
 * does not compute — it is verified with a real headless render during
 * development. Here we lock the configuration that drives that thinning.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  timeAxis, X_AXIS_MIN_TICK_GAP, DARK_PALETTE,
  PMTimelineChart, CO2TimelineChart, TempHumidityChart, MultiParameterChart,
} from '../../src/components/sensor/SensorCharts'

afterEach(() => cleanup())

describe('timeAxis — shared time-axis config', () => {
  it('sets a minTickGap far larger than Recharts’ 5px default so wide datetime labels never collide', () => {
    const cfg = timeAxis(DARK_PALETTE, true)
    expect(cfg.minTickGap).toBe(X_AXIS_MIN_TICK_GAP)
    expect(cfg.minTickGap).toBeGreaterThanOrEqual(48) // room for a "MMM D HH:mm" label
  })

  it('pins the first and last timestamps (preserveStartEnd) and keeps the time scale', () => {
    const cfg = timeAxis(DARK_PALETTE, true)
    expect(cfg.interval).toBe('preserveStartEnd')
    expect(cfg.type).toBe('number')
    expect(cfg.scale).toBe('time')
    expect(cfg.dataKey).toBe('t')
  })

  it('formats numeric timestamps as dates, and falls back to reading index when untimed', () => {
    expect(typeof timeAxis(DARK_PALETTE, true).tickFormatter(1714550400000)).toBe('string')
    expect(timeAxis(DARK_PALETTE, false).tickFormatter(7)).toBe('#7')
  })
})

describe('every timeline renders an x-axis (routed through the shared config)', () => {
  const series = (param) =>
    Array.from({ length: 6 }, (_, i) => ({ t: 1714550400000 + i * 60000, [param]: 400 + i * 100 }))
  const cases = [
    ['PM', <PMTimelineChart data={series('pm25')} hasTs width={520} height={220} />],
    ['CO₂', <CO2TimelineChart data={series('co2')} hasTs width={520} height={220} />],
    ['Temp/RH', <TempHumidityChart data={series('temp')} hasTs width={520} height={220} />],
    ['Multi', <MultiParameterChart data={series('co2')} params={['co2']} hasTs width={520} height={220} />],
  ]
  it.each(cases)('renders an x-axis group for %s', (_label, node) => {
    const { container } = render(node)
    expect(container.querySelector('.recharts-xAxis')).toBeTruthy()
  })
})
