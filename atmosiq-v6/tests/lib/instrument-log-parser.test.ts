/**
 * Instrument Log CSV Parser — header detection + value normalization
 * + time-series aggregation.
 *
 * Pins the contract InstrumentLogImport relies on:
 *   • mapInstrumentHeader recognises common vendor column names
 *     across TSI, Aeroqual, Graywolf, Testo, generic CSV exports
 *   • Unit normalization: °C → °F, ppb HCHO → ppm, comma-thousands
 *     stripped from numeric values
 *   • Aggregation: mean / median / p95 / min / max correct over the
 *     parsed series
 *   • Vendor signature detection sets `instrument` field
 *   • Unsupported parameters (PM10) are explicitly dropped, not
 *     silently mis-attributed
 */
import { describe, it, expect } from 'vitest'
import { mapInstrumentHeader, splitCsvLine, parseInstrumentLogCsv as parseInstrumentLogCsvUntyped } from '../../src/utils/instrumentLogParser.js'

type ParsedAggregate = { count: number; mean: number; median: number; p95: number; min: number; max: number }
type ParseResult = {
  instrument: string | null
  parameters: Record<string, ParsedAggregate>
  unmappedColumns: string[]
  warnings: string[]
  sampleCount: number
  recommendedReadings: Record<string, number>
}
const parseInstrumentLogCsv = parseInstrumentLogCsvUntyped as (csv: string) => ParseResult

describe('mapInstrumentHeader', () => {
  it('maps CO2 variants', () => {
    expect(mapInstrumentHeader('CO2')?.canonical).toBe('co2')
    expect(mapInstrumentHeader('CO2 [ppm]')?.canonical).toBe('co2')
    expect(mapInstrumentHeader('Carbon Dioxide')?.canonical).toBe('co2')
    expect(mapInstrumentHeader('CO 2 ppm')?.canonical).toBe('co2')
  })

  it('maps CO without misdetecting CO2', () => {
    expect(mapInstrumentHeader('CO')?.canonical).toBe('co')
    expect(mapInstrumentHeader('CO (ppm)')?.canonical).toBe('co')
    expect(mapInstrumentHeader('Carbon Monoxide')?.canonical).toBe('co')
    // CO2 must NOT match the CO patterns
    expect(mapInstrumentHeader('CO2 [ppm]')?.canonical).toBe('co2')
  })

  it('maps temperature with unit-aware transforms', () => {
    expect(mapInstrumentHeader('Temp [°F]')).toEqual({ canonical: 'tf', transform: 'passthrough' })
    expect(mapInstrumentHeader('Temperature (°C)')).toEqual({ canonical: 'tf', transform: 'celsius_to_fahrenheit' })
    expect(mapInstrumentHeader('Dry-bulb Temp [°C]')).toEqual({ canonical: 'tf', transform: 'celsius_to_fahrenheit' })
    expect(mapInstrumentHeader('Temperature')).toEqual({ canonical: 'tf', transform: 'passthrough' })
  })

  it('maps relative humidity variants', () => {
    expect(mapInstrumentHeader('RH')?.canonical).toBe('rh')
    expect(mapInstrumentHeader('R.H.')?.canonical).toBe('rh')
    expect(mapInstrumentHeader('Humidity')?.canonical).toBe('rh')
    expect(mapInstrumentHeader('Relative Humidity [%]')?.canonical).toBe('rh')
  })

  it('maps PM2.5 but DROPS PM10 (we do not score PM10)', () => {
    expect(mapInstrumentHeader('PM2.5')?.canonical).toBe('pm')
    expect(mapInstrumentHeader('PM 2.5 [µg/m³]')?.canonical).toBe('pm')
    expect(mapInstrumentHeader('Particulate Matter 2.5')?.canonical).toBe('pm')
    expect(mapInstrumentHeader('PM10')).toBeNull()
    expect(mapInstrumentHeader('PM 10')).toBeNull()
  })

  it('maps TVOC variants', () => {
    expect(mapInstrumentHeader('TVOC')?.canonical).toBe('tv')
    expect(mapInstrumentHeader('VOC')?.canonical).toBe('tv')
    expect(mapInstrumentHeader('Volatile Organic Compounds')?.canonical).toBe('tv')
    expect(mapInstrumentHeader('Total VOCs')?.canonical).toBe('tv')
  })

  it('maps formaldehyde with ppb→ppm transform when applicable', () => {
    expect(mapInstrumentHeader('HCHO')).toEqual({ canonical: 'hc', transform: 'passthrough' })
    expect(mapInstrumentHeader('Formaldehyde')).toEqual({ canonical: 'hc', transform: 'passthrough' })
    expect(mapInstrumentHeader('HCHO (ppb)')).toEqual({ canonical: 'hc', transform: 'ppb_to_ppm' })
  })

  it('returns null for unrecognised + invalid input', () => {
    expect(mapInstrumentHeader('Date')).toBeNull()
    expect(mapInstrumentHeader('Time')).toBeNull()
    expect(mapInstrumentHeader('')).toBeNull()
    expect(mapInstrumentHeader(null as unknown as string)).toBeNull()
  })
})

describe('splitCsvLine', () => {
  it('splits comma-separated fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('honors double-quoted fields with embedded commas', () => {
    expect(splitCsvLine('"1,234",foo')).toEqual(['1,234', 'foo'])
  })
})

describe('parseInstrumentLogCsv — happy paths', () => {
  it('parses a TSI Q-Trak style export', () => {
    const csv = [
      'TSI Q-Trak 7575 — Log Export',
      '',
      'Date,Time,CO2 [ppm],Temperature [°F],Relative Humidity [%],CO [ppm]',
      '2026-05-19,10:00:00,800,72.5,45.0,1.0',
      '2026-05-19,10:00:30,820,72.6,45.1,1.0',
      '2026-05-19,10:01:00,840,72.6,45.0,1.1',
      '2026-05-19,10:01:30,860,72.7,45.2,1.0',
      '2026-05-19,10:02:00,880,72.7,45.1,1.0',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    expect(result.instrument).toBe('TSI Q-Trak')
    expect(result.sampleCount).toBe(5)
    expect(result.parameters.co2?.mean).toBe(840)
    expect(result.parameters.co2?.median).toBe(840)
    expect(result.parameters.co2?.min).toBe(800)
    expect(result.parameters.co2?.max).toBe(880)
    expect(result.parameters.tf?.mean).toBeCloseTo(72.62, 1)
    expect(result.parameters.rh?.mean).toBeCloseTo(45.08, 1)
    expect(result.parameters.co?.mean).toBeCloseTo(1.02, 1)
    expect(result.recommendedReadings.co2).toBe(840)
    expect(result.recommendedReadings.co).toBe(1)
  })

  it('converts Celsius temperatures to Fahrenheit', () => {
    const csv = [
      'Date,Time,Temperature (°C),CO2',
      '2026-05-19,10:00:00,20,800',
      '2026-05-19,10:01:00,22,810',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    // (20 + 22) / 2 = 21 °C → (21 × 9/5) + 32 = 69.8 °F
    expect(result.parameters.tf?.mean).toBeCloseTo(69.8, 1)
  })

  it('converts HCHO ppb headers to ppm values', () => {
    const csv = [
      'Date,Time,HCHO (ppb),CO2',
      '2026-05-19,10:00:00,50,800',
      '2026-05-19,10:01:00,70,810',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    expect(result.parameters.hc?.mean).toBeCloseTo(0.06, 2)
  })

  it('strips comma thousands separators from numeric values', () => {
    const csv = [
      'Date,Time,CO2,RH',
      '2026-05-19,10:00:00,"1,234",45',
      '2026-05-19,10:01:00,"1,500",46',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    expect(result.parameters.co2?.mean).toBe(1367)
  })

  it('preserves unmapped columns in unmappedColumns', () => {
    const csv = [
      'Date,Time,CO2,Custom Sensor,RH',
      '2026-05-19,10:00:00,800,xyz,45',
      '2026-05-19,10:01:00,810,xyz,46',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    expect(result.unmappedColumns).toContain('Date')
    expect(result.unmappedColumns).toContain('Time')
    expect(result.unmappedColumns).toContain('Custom Sensor')
    expect(result.parameters.co2?.mean).toBe(805)
  })

  it('detects each supported instrument signature', () => {
    const wrap = (preamble: string) =>
      `${preamble}\n\nCO2,Temperature [°F],RH\n800,72,45\n810,72,46`
    expect(parseInstrumentLogCsv(wrap('TSI Q-Trak 7575')).instrument).toBe('TSI Q-Trak')
    expect(parseInstrumentLogCsv(wrap('IAQ-Calc 7545 Log')).instrument).toBe('TSI IAQ-Calc')
    expect(parseInstrumentLogCsv(wrap('Aeroqual S500 Export')).instrument).toBe('Aeroqual')
    expect(parseInstrumentLogCsv(wrap('Graywolf AdvancedSense Pro')).instrument).toBe('Graywolf')
    expect(parseInstrumentLogCsv(wrap('Testo 400 Sensor Log')).instrument).toBe('Testo')
  })

  it('drops PM10 columns when both PM10 and PM2.5 are present', () => {
    const csv = [
      'Date,Time,PM2.5,PM10,CO2',
      '2026-05-19,10:00:00,8,15,800',
      '2026-05-19,10:01:00,10,18,810',
    ].join('\n')
    const result = parseInstrumentLogCsv(csv)
    expect(result.parameters.pm).toBeDefined()
    expect(result.parameters.pm?.mean).toBe(9)
    expect(result.unmappedColumns).toContain('PM10')
  })
})

describe('parseInstrumentLogCsv — aggregation correctness', () => {
  it('computes mean, median, p95, min, max correctly', () => {
    // CO2 series: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
    const lines = ['Time,CO2']
    for (let i = 1; i <= 10; i++) lines.push(`10:${String(i).padStart(2, '0')}:00,${i * 100}`)
    const result = parseInstrumentLogCsv(lines.join('\n'))
    const a = result.parameters.co2!
    expect(a.count).toBe(10)
    expect(a.mean).toBe(550)
    expect(a.median).toBe(550)
    expect(a.min).toBe(100)
    expect(a.max).toBe(1000)
    // p95 of [100..1000 step 100] — interpolated near the high end
    expect(a.p95).toBeGreaterThan(900)
    expect(a.p95).toBeLessThanOrEqual(1000)
  })

  it('rounds recommended readings to integer for CO2/CO/PM/TVOC', () => {
    const csv = 'Time,CO2,CO,PM2.5,TVOC\n10:00,825.7,1.6,8.4,432.2\n10:01,826.3,1.4,8.6,433.8'
    const r = parseInstrumentLogCsv(csv)
    expect(r.recommendedReadings.co2).toBe(826)
    expect(r.recommendedReadings.co).toBe(2)
    expect(r.recommendedReadings.pm).toBe(9)
    expect(r.recommendedReadings.tv).toBe(433)
  })

  it('rounds temperature recommendations to one decimal', () => {
    const csv = 'Time,Temperature [°F]\n10:00,72.4\n10:01,72.6'
    const r = parseInstrumentLogCsv(csv)
    expect(r.recommendedReadings.tf).toBe(72.5)
  })

  it('rounds HCHO recommendation to three decimals (sub-ppm precision)', () => {
    const csv = 'Time,HCHO\n10:00,0.123\n10:01,0.129'
    const r = parseInstrumentLogCsv(csv)
    expect(r.recommendedReadings.hc).toBe(0.126)
  })
})

describe('parseInstrumentLogCsv — edge cases', () => {
  it('returns a warning when the CSV is empty', () => {
    const r = parseInstrumentLogCsv('')
    expect(r.parameters).toEqual({})
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('returns a warning when no parameter header row is found', () => {
    const r = parseInstrumentLogCsv('a,b\nc,d')
    expect(r.parameters).toEqual({})
    expect(r.warnings[0]).toMatch(/header/i)
  })

  it('returns a warning when the header is found but no values parse', () => {
    const r = parseInstrumentLogCsv('CO2,Temperature\nnot-a-number,also-not')
    // Header is detected but no rows produce numeric values
    expect(r.parameters).toEqual({})
    expect(r.warnings.some((w: string) => /could not be parsed|No supported parameters/i.test(w))).toBe(true)
  })

  it('handles preamble rows + blank rows between header and data', () => {
    const csv = [
      'Customer: Prudence EHS',
      'Project: 12345',
      '',
      'CO2,Temperature [°F],RH',
      '',
      '800,72,45',
      '',
      '810,72,46',
    ].join('\n')
    const r = parseInstrumentLogCsv(csv)
    expect(r.sampleCount).toBe(2)
    expect(r.parameters.co2?.mean).toBe(805)
  })

  it('handles \\r\\n line endings (Windows-exported CSVs)', () => {
    const csv = 'CO2,RH\r\n800,45\r\n810,46\r\n'
    const r = parseInstrumentLogCsv(csv)
    expect(r.sampleCount).toBe(2)
  })

  it('skips data rows with no valid parameter values', () => {
    const csv = [
      'Time,CO2,RH',
      '10:00,800,45',
      '10:01,,',
      '10:02,810,46',
    ].join('\n')
    const r = parseInstrumentLogCsv(csv)
    expect(r.sampleCount).toBe(2)
    expect(r.parameters.co2?.count).toBe(2)
  })
})
