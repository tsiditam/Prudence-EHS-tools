/**
 * sensorAnalytics — derived time-series stats for the Analysis chart cards.
 */
import { describe, it, expect } from 'vitest'
import { chartStats, chartPrimaryParam } from '../../src/utils/sensorAnalytics'

describe('chartPrimaryParam', () => {
  it('maps single-parameter charts and skips composite ones', () => {
    expect(chartPrimaryParam('co2')).toBe('co2')
    expect(chartPrimaryParam('pm')).toBe('pm25')
    expect(chartPrimaryParam('hcho')).toBe('hcho')
    expect(chartPrimaryParam('tempRh')).toBeNull()
    expect(chartPrimaryParam('multi')).toBeNull()
  })
})

describe('chartStats', () => {
  const ts = [0, 1000, 2000, 3000] // ms

  it('computes mean and peak over non-null values', () => {
    const s = chartStats([400, 600, null, 800], ts)
    expect(s.mean).toBeCloseTo(600, 5)
    expect(s.peak).toBe(800)
    expect(s.n).toBe(3)
  })

  it('returns null when there is no usable data', () => {
    expect(chartStats([null, undefined], ts)).toBeNull()
    expect(chartStats([], [])).toBeNull()
  })

  it('% over the limit reflects readings strictly above it', () => {
    const s = chartStats([700, 850, 900, 500], ts, { limit: 800 })
    expect(s.pctOver).toBeCloseTo(50, 5) // 850 & 900 of 4
  })

  it('leaves pctOver null when no limit is given', () => {
    expect(chartStats([700, 900], ts).pctOver).toBeNull()
  })

  it('splits occupied vs unoccupied means and flags the peak', () => {
    // occupied window covers t=1000..2000 → values 900, 950
    const s = chartStats([500, 900, 950, 450], ts, {
      occupancyWindows: [{ start: 1000, end: 2000 }],
      limit: 800,
    })
    expect(s.meanOcc).toBeCloseTo(925, 5)
    expect(s.meanNoc).toBeCloseTo(475, 5)
    expect(s.deltaOccNoc).toBeCloseTo(450, 5)
    expect(s.peakOccupied).toBe(true) // peak 950 is at t=2000, inside the window
  })

  it('leaves occupancy-derived fields null without windows', () => {
    const s = chartStats([500, 900], ts)
    expect(s.deltaOccNoc).toBeNull()
    expect(s.peakOccupied).toBeNull()
  })
})
