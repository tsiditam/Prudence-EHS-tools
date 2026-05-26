/**
 * sensorParser — CSV logger ingestion for the Sensor Data feature.
 */

import { describe, it, expect } from 'vitest'
import { classifyHeader, parseSensorCsv, downsample, detectUnit, normalizeForCompare, sensorAveragesToFields, ppbToUgm3, ugm3ToPpb, HCHO_MW, inferTempUnit, detectDatasetRole } from '../../src/utils/sensorParser'

describe('Formaldehyde (HCHO) detection', () => {
  it('classifies HCHO / formaldehyde / CH2O headers as the hcho param', () => {
    expect(classifyHeader('HCHO (ppb)')).toMatchObject({ role: 'param', param: 'hcho', unit: 'ppb' })
    expect(classifyHeader('Formaldehyde')).toMatchObject({ role: 'param', param: 'hcho' })
    expect(classifyHeader('CH2O (µg/m³)')).toMatchObject({ role: 'param', param: 'hcho', unit: 'µg/m³' })
    expect(classifyHeader('HCHO (mg/m3)')).toMatchObject({ role: 'param', param: 'hcho', unit: 'mg/m³' })
  })
  it('does not collide with CO or CO2', () => {
    expect(classifyHeader('CO2 (ppm)').param).toBe('co2')
    expect(classifyHeader('CO (ppm)').param).toBe('co')
  })
  it('detects mg/m³ units', () => {
    expect(detectUnit('HCHO (mg/m3)', 'hcho')).toBe('mg/m³')
  })
  it('converts exactly with the single-compound molecular weight (MW 30.03)', () => {
    // 30 ppb HCHO ≈ 36.8 µg/m³ at 25 °C; round-trips back to 30 ppb.
    const ug = ppbToUgm3(30, HCHO_MW)
    expect(Math.round(ug)).toBe(37)
    expect(Math.round(ugm3ToPpb(ug, HCHO_MW))).toBe(30)
  })
  it('parses an HCHO logger column end-to-end', () => {
    const r = parseSensorCsv('Timestamp,HCHO (ppb)\n2026-05-01 09:00,20\n2026-05-01 09:05,40\n2026-05-01 09:10,30')
    expect(r.params).toContain('hcho')
    expect(r.units.hcho).toBe('ppb')
    expect(Math.round(r.summary.stats.hcho.mean)).toBe(30)
  })
})

describe('TVOC unit conversion helpers', () => {
  it('round-trips ppb ↔ µg/m³ for isobutylene', () => {
    const ug = ppbToUgm3(200, 56.11)
    expect(Math.round(ug)).toBe(459)
    expect(Math.round(ugm3ToPpb(ug, 56.11))).toBe(200)
  })
  it('guards invalid input', () => {
    expect(ppbToUgm3(null, 56.11)).toBeNull()
    expect(ugm3ToPpb(459, 0)).toBeNull()
  })
})

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

  it('recognizes degC / degF and bracketed unit tokens', () => {
    // The real logger export header from the bug report.
    expect(detectUnit('Indoor Temp [degC]', 'temp')).toBe('°C')
    expect(detectUnit('Outdoor Temp [degF]', 'temp')).toBe('°F')
    expect(detectUnit('Temperature (degrees C)', 'temp')).toBe('°C')
    expect(detectUnit('Temp [C]', 'temp')).toBe('°C')
    expect(detectUnit('Temp (F)', 'temp')).toBe('°F')
  })

  it('returns null for an unmarked temperature header (so the value scale can be inferred)', () => {
    expect(detectUnit('Temperature', 'temp')).toBeNull()
    expect(detectUnit('Temp', 'temp')).toBeNull()
  })
})

describe('inferTempUnit', () => {
  it('infers Celsius for occupied-space values that would be implausibly cold as °F', () => {
    expect(inferTempUnit([18, 20, 21, 22])).toBe('°C')
  })
  it('infers Fahrenheit for typical room values', () => {
    expect(inferTempUnit([68, 70, 72, 74])).toBe('°F')
  })
  it('defaults to °F when there are no values', () => {
    expect(inferTempUnit([])).toBe('°F')
  })
})

describe('detectDatasetRole', () => {
  it('detects outdoor from the filename', () => {
    expect(detectDatasetRole('IAQ_Outdoor_20_Lines.xlsx', ['Timestamp', 'Temp'])).toBe('outdoor')
  })
  it('detects indoor from column headers', () => {
    expect(detectDatasetRole('export.csv', ['Timestamp', 'Indoor Temp [degC]', 'Indoor CO2 [ppm]'])).toBe('indoor')
  })
  it('returns null when the signal is absent or mixed', () => {
    expect(detectDatasetRole('export.csv', ['Timestamp', 'Temp', 'CO2'])).toBeNull()
    expect(detectDatasetRole('site.xlsx', ['Indoor CO2', 'Outdoor CO2'])).toBeNull()
  })
})

describe('temperature unit handling end-to-end (bug report)', () => {
  it('reads the [degC] header as Celsius and displays Celsius, not Fahrenheit', () => {
    const r = parseSensorCsv('Timestamp,Indoor Temp [degC],Indoor CO2 [ppm]\n2026-05-25 08:00,21.51,422\n2026-05-25 08:10,21.63,445')
    expect(r.units.temp).toBe('°C')
    // No false "implausibly cold °F" flag, because the unit is correctly °C.
    expect(r.quality.flags.some((f) => /implausibly cold/i.test(f.msg))).toBe(false)
    // Sending averages to a report still converts °C → °F for the tf field.
    const { fields, details } = sensorAveragesToFields(r)
    expect(details.find((d) => d.param === 'temp').note).toBe('°C→°F')
    expect(Number(fields.tf)).toBeCloseTo((21.57 * 9) / 5 + 32, 0)
  })

  it('infers Celsius and flags it when the header has no unit', () => {
    const r = parseSensorCsv('Timestamp,Temp\n2026-05-25 08:00,20\n2026-05-25 08:10,21\n2026-05-25 08:20,22')
    expect(r.units.temp).toBe('°C')
    expect(r.quality.flags.some((f) => /inferred °C/i.test(f.msg))).toBe(true)
  })

  it('questions a °F-labeled series that reads like Celsius', () => {
    const r = parseSensorCsv('Timestamp,Temp (°F)\n2026-05-25 08:00,20\n2026-05-25 08:10,21\n2026-05-25 08:20,22')
    expect(r.units.temp).toBe('°F')
    expect(r.quality.level).toBe('review')
    expect(r.quality.flags.some((f) => /implausibly cold/i.test(f.msg))).toBe(true)
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

describe('normalizeForCompare', () => {
  const pts = [
    { t: 1, co2: 500, rh: 40 },
    { t: 2, co2: 1000, rh: 50 },
    { t: 3, co2: 1500, rh: 60 },
  ]
  it('scales each param to 0–100% of its own range, keeping actuals', () => {
    const { data, ranges } = normalizeForCompare(pts, ['co2', 'rh'])
    expect(ranges.co2).toEqual({ min: 500, max: 1500 })
    expect(data[0].n_co2).toBe(0)
    expect(data[2].n_co2).toBe(100)
    expect(data[1].n_co2).toBe(50)
    expect(data[1].co2).toBe(1000) // actual preserved for the tooltip
    expect(data[0].n_rh).toBe(0)
    expect(data[2].n_rh).toBe(100)
  })
  it('handles nulls and flat series without dividing by zero', () => {
    const { data } = normalizeForCompare([{ t: 1, x: 5 }, { t: 2, x: null }, { t: 3, x: 5 }], ['x'])
    expect(data[1].n_x).toBeNull()
    expect(data[0].n_x).toBe(50) // flat range → midpoint
  })
})

describe('summary.stats', () => {
  it('computes mean / median / n per parameter over non-null values', () => {
    const r = parseSensorCsv('Timestamp,CO2 (ppm)\n2026-05-01 09:00,500\n2026-05-01 09:05,700\n2026-05-01 09:10,900')
    expect(r.summary.stats.co2).toMatchObject({ mean: 700, median: 700, n: 3, min: 500, max: 900 })
  })
})

describe('sensorAveragesToFields', () => {
  it('maps logger averages onto the per-zone reading fields as strings', () => {
    const r = parseSensorCsv('Timestamp,CO2 (ppm),Temp (°F),RH (%)\n2026-05-01 09:00,500,70,40\n2026-05-01 09:05,700,72,50')
    const { fields, details, skipped } = sensorAveragesToFields(r)
    expect(fields).toEqual({ co2: '600', tf: '71', rh: '45' })
    expect(details.find((d) => d.field === 'co2')).toMatchObject({ param: 'co2', value: 600, n: 2 })
    expect(skipped).toHaveLength(0)
  })

  it('converts °C logs to °F for the tf field and flags the conversion', () => {
    const r = parseSensorCsv('Timestamp,Temp (°C)\n2026-05-01 09:00,20\n2026-05-01 09:05,25')
    const { fields, details } = sensorAveragesToFields(r)
    expect(fields.tf).toBe('72.5') // mean 22.5°C → 72.5°F
    expect(details[0].note).toBe('°C→°F')
  })

  it('fills TVOC directly when the log is already µg/m³', () => {
    const r = parseSensorCsv('Timestamp,TVOC (µg/m³)\n2026-05-01 09:00,300\n2026-05-01 09:05,500')
    const { fields, details, skipped } = sensorAveragesToFields(r)
    expect(fields.tv).toBe('400')
    expect(details.find((d) => d.field === 'tv').note).toBe('')
    expect(skipped).toHaveLength(0)
  })

  it('converts TVOC ppb to µg/m³ via isobutylene by default', () => {
    const r = parseSensorCsv('Timestamp,TVOC (ppb)\n2026-05-01 09:00,100\n2026-05-01 09:05,300')
    const { fields, details } = sensorAveragesToFields(r)
    // mean 200 ppb × 56.11 / 24.45 ≈ 459 µg/m³
    expect(fields.tv).toBe('459')
    expect(details.find((d) => d.field === 'tv').note).toMatch(/ppb→µg\/m³ @ Isobutylene/)
  })

  it('uses the selected reference compound and ppm scaling for TVOC', () => {
    const r = parseSensorCsv('Timestamp,TVOC (ppm)\n2026-05-01 09:00,1\n2026-05-01 09:05,1')
    // 1 ppm = 1000 ppb × 92.14 / 24.45 ≈ 3769 µg/m³ (toluene)
    const { fields, details } = sensorAveragesToFields(r, { tvocRef: 'toluene' })
    expect(fields.tv).toBe('3769')
    expect(details.find((d) => d.field === 'tv').note).toMatch(/ppm→µg\/m³ @ Toluene/)
  })

  it('skips TVOC when the unit is not interpretable as ppb/ppm/µg/m³', () => {
    const fake = { params: ['tvoc'], units: { tvoc: 'index' }, summary: { stats: { tvoc: { mean: 120, n: 5 } } } }
    const { fields, skipped } = sensorAveragesToFields(fake)
    expect(fields.tv).toBeUndefined()
    expect(skipped.map((s) => s.param)).toContain('tvoc')
  })

  it('supports the median statistic for spike-resistant fills', () => {
    const r = parseSensorCsv('Timestamp,CO2 (ppm)\n2026-05-01 09:00,500\n2026-05-01 09:05,600\n2026-05-01 09:10,1900')
    expect(sensorAveragesToFields(r, { stat: 'mean' }).fields.co2).toBe('1000')
    expect(sensorAveragesToFields(r, { stat: 'median' }).fields.co2).toBe('600')
  })

  it('returns empty structures when no log is loaded', () => {
    expect(sensorAveragesToFields(null)).toEqual({ fields: {}, details: [], skipped: [] })
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
