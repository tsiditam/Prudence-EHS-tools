import { describe, it, expect } from 'vitest'
import { isWithinNoiseFloor, lookupAccuracy, evaluateInstrumentAccuracy } from '../../src/engine/instruments/accuracy'

describe('Instrument Accuracy', () => {
  it('Q-Trak CO2 at 720 vs 700 threshold (±50 ppm) → within noise floor', () => {
    const band = lookupAccuracy('TSI Q-Trak 7575', 'co2')!
    expect(band).toBeDefined()
    expect(isWithinNoiseFloor(720, 700, band)).toBe(true)
  })

  it('Q-Trak CO2 at 850 vs 700 threshold → NOT within noise floor', () => {
    const band = lookupAccuracy('TSI Q-Trak 7575', 'co2')!
    expect(isWithinNoiseFloor(850, 700, band)).toBe(false)
  })

  it('unknown instrument → spec lookup returns null', () => {
    const band = lookupAccuracy('Unknown Brand XYZ', 'co2')
    expect(band).toBeNull()
  })

  it('evaluateInstrumentAccuracy for unknown instrument → checked=false', () => {
    const result = evaluateInstrumentAccuracy(720, 700, 'Unknown Brand', 'co2')
    expect(result.checked).toBe(false)
    expect(result.note).toContain('not in accuracy database')
  })

  it('evaluateInstrumentAccuracy for Q-Trak within noise → withinNoiseFloor=true', () => {
    const result = evaluateInstrumentAccuracy(720, 700, 'TSI Q-Trak 7575', 'co2')
    expect(result.checked).toBe(true)
    expect(result.withinNoiseFloor).toBe(true)
    expect(result.note).toContain('within instrument accuracy')
  })

  it('evaluateInstrumentAccuracy for Q-Trak exceeding → withinNoiseFloor=false', () => {
    const result = evaluateInstrumentAccuracy(850, 700, 'TSI Q-Trak 7575', 'co2')
    expect(result.checked).toBe(true)
    expect(result.withinNoiseFloor).toBe(false)
    expect(result.note).toContain('exceeds')
  })

  it('percentage-based accuracy for CO (±3% or ±3 ppm)', () => {
    const band = lookupAccuracy('TSI Q-Trak 7575', 'co')!
    expect(band).toBeDefined()
    // CO at 52 vs 50 ppm threshold. 3% of 52 = 1.56, absolute = 3. Max = 3. |52-50| = 2 ≤ 3 → within
    expect(isWithinNoiseFloor(52, 50, band)).toBe(true)
    // CO at 55 vs 50. |55-50| = 5 > 3 → not within
    expect(isWithinNoiseFloor(55, 50, band)).toBe(false)
  })

  it('GrayWolf HCHO accuracy', () => {
    const band = lookupAccuracy('GrayWolf AdvancedSense Pro', 'hcho')
    expect(band).toBeDefined()
    expect(band!.absolute).toBe(0.02)
    expect(band!.percentOfReading).toBe(0.10)
  })
})
