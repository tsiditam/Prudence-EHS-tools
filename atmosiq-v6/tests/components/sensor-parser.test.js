/**
 * sensorParser — CSV logger ingestion for the Sensor Data feature.
 */

import { describe, it, expect } from 'vitest'
import { classifyHeader, parseSensorCsv, downsample, detectUnit } from '../../src/utils/sensorParser'

describe('classifyHeader', () => {
  it('detects timestamp, parameters, and units', () => {
    expect(classifyHeader('Timestamp').role).toBe('timestamp')
    expect(classifyHeader('Date/Time').role).toBe('timestamp')
    expect(classifyHeader('CO2 (ppm)')).toMatchObject({ role: 'param', param: 'co2', unit: 'ppm' })
    expect(classifyHeader('PM2.5')).toMatchObject({ role: 'param', param: 'pm25' })
    expect(classifyHeader('Relative Humidity (%)')).toMatchObject({ role: 'param', param: 'rh', unit: '%' })
    expect(classifyHeader('Temp °C')).toMatchObject({ role: 'param', param: 'temp', unit: '°C' })
    expect(classifyHeader('Zone').role).toBe('zone')
    expect(classifyHeader('weird column').role).toBe('unknown')
  })

  it('does not confuse CO2 with CO', () => {
    expect(classifyHeader('CO2').param).toBe('co2')
    expect(classifyHeader('CO (ppm)').param).toBe('co')
  })
})

describe('detectUnit', () => {
  it('reads temperature scale and concentration units', () => {
    expect(detectUnit('Temp (°F)', 'temp')).toBe('°F')
    expect(detectUnit('Temperature C', 'temp')).toBe('°C')
    expect(detectUnit('PM2.5 ug/m3', 'pm25')).toBe('µg/m³')
  })
})

const CSV = [
  'Timestamp,CO2 (ppm),Temp (°F),RH (%)',
  '2026-05-01 09:00:00,520,71.2,44',
  '2026-05-01 09:05:00,640,71.5,45',
  '2026-05-01 09:10:00,1180,72.0,46',
  '2026-05-01 09:15:00,1450,72.1,47',
].join('\n')

describe('parseSensorCsv', () => {
  it('parses timestamps + parameters into chartable points', () => {
    const r = parseSensorCsv(CSV, { fileName: 'qtrak.csv' })
    expect(r).not.toBeNull()
    expect(r.params.sort()).toEqual(['co2', 'rh', 'temp'])
    expect(r.hasTimestamps).toBe(true)
    expect(r.points).toHaveLength(4)
    expect(r.points[0].co2).toBe(520)
    expect(r.summary.count).toBe(4)
    expect(r.summary.intervalSec).toBe(300) // 5-minute logger
    expect(r.units.co2).toBe('ppm')
    expect(r.quality.level).toBe('ok')
  })

  it('flags physically impossible values for review', () => {
    const bad = 'Timestamp,RH (%)\n2026-05-01 09:00,55\n2026-05-01 09:05,250'
    const r = parseSensorCsv(bad)
    expect(r.quality.level).toBe('review')
    expect(r.quality.flags.some((f) => /plausible|unit/i.test(f.msg))).toBe(true)
  })

  it('marks timestamp mapping uncertain when no time column exists', () => {
    const r = parseSensorCsv('CO2,Temp\n500,70\n600,71')
    expect(r.hasTimestamps).toBe(false)
    expect(r.quality.level).toBe('uncertain')
  })

  it('returns null for empty / header-only input', () => {
    expect(parseSensorCsv('')).toBeNull()
    expect(parseSensorCsv('Timestamp,CO2')).toBeNull()
  })
})

describe('downsample', () => {
  it('caps point count while keeping first and last', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, v: i }))
    const out = downsample(pts, 800)
    expect(out.length).toBeLessThanOrEqual(801)
    expect(out[0].v).toBe(0)
    expect(out[out.length - 1].v).toBe(4999)
  })
})
