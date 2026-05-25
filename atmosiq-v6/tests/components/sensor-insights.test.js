/**
 * sensorInsights — payload builder for the analyzer's "Ask AtmosFlow AI
 * for insights" action. Pins that the payload is SUMMARY-ONLY (never the
 * raw time series), carries the directive, and no-ops on empty input.
 */
import { describe, it, expect } from 'vitest'
import { buildSensorInsightsPayload, SENSOR_INSIGHTS_INSTRUCTIONS, SENSOR_INSIGHTS_CREDIT_COST } from '../../src/utils/sensorInsights.js'

const sampleSensorData = () => ({
  fileName: 'qtrak.csv',
  params: ['co2', 'tvoc'],
  units: { co2: 'ppm', tvoc: 'ppb' },
  columns: [{ role: 'timestamp' }, { role: 'param', param: 'co2' }],
  hasTimestamps: true,
  rawCount: 5000,
  // Raw downsampled series — must NOT be forwarded to the model.
  points: Array.from({ length: 800 }, (_, i) => ({ t: i, co2: 500 + i, tvoc: 100 })),
  summary: {
    count: 5000,
    start: 1714550400000,
    end: 1714557600000,
    intervalSec: 60,
    emptyRows: 3,
    missing: { tvoc: 12 },
    stats: {
      co2: { mean: 820, median: 800, min: 480, max: 1450, n: 4990 },
      tvoc: { mean: 240, median: 220, min: 80, max: 900, n: 4978 },
    },
  },
  quality: { level: 'minor', status: 'Minor gaps detected.', flags: [{ level: 'minor', msg: 'gaps' }] },
})

describe('buildSensorInsightsPayload', () => {
  it('returns null when there is nothing to analyze', () => {
    expect(buildSensorInsightsPayload(null)).toBeNull()
    expect(buildSensorInsightsPayload({})).toBeNull()
    expect(buildSensorInsightsPayload({ params: [], summary: {} })).toBeNull()
    expect(buildSensorInsightsPayload({ params: ['co2'] })).toBeNull() // no summary
  })

  it('forwards the summary, units, params, quality, and directive', () => {
    const p = buildSensorInsightsPayload(sampleSensorData())
    expect(p.fileName).toBe('qtrak.csv')
    expect(p.params).toEqual(['co2', 'tvoc'])
    expect(p.units).toEqual({ co2: 'ppm', tvoc: 'ppb' })
    expect(p.summary.count).toBe(5000)
    expect(p.summary.intervalSec).toBe(60)
    expect(p.summary.stats.co2.mean).toBe(820)
    expect(p.quality.level).toBe('minor')
    expect(p.instructions).toBe(SENSOR_INSIGHTS_INSTRUCTIONS)
  })

  it('does NOT forward the raw time series or raw columns', () => {
    const p = buildSensorInsightsPayload(sampleSensorData())
    expect(p.points).toBeUndefined()
    expect(p.columns).toBeUndefined()
    // Defensive: serialized payload must not contain the series array.
    const json = JSON.stringify(p)
    expect(json).not.toContain('"points"')
    expect(json.length).toBeLessThan(4000) // summary stays compact
  })

  it('keeps the screening-only framing and a fixed 1-credit cost', () => {
    expect(SENSOR_INSIGHTS_CREDIT_COST).toBe(1)
    expect(SENSOR_INSIGHTS_INSTRUCTIONS).toMatch(/screening/i)
    expect(SENSOR_INSIGHTS_INSTRUCTIONS).toMatch(/IH Review Required/i)
    expect(SENSOR_INSIGHTS_INSTRUCTIONS).toMatch(/ventilation-effectiveness indicator/i) // CO₂ caveat
  })
})
