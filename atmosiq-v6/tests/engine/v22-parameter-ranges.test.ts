/**
 * v2.2 §9 — parameter ranges helper tests.
 *
 * Validates:
 *   1. Three measured CO2 values across zones produce correct
 *      low/high/average and a withinStandards flag against the
 *      700 ppm differential threshold.
 *   2. A parameter with no measured readings produces no entry.
 *   3. Outdoor reference is captured when available.
 *   4. RH range honors the 30-60% comfort window.
 */

import { describe, it, expect } from 'vitest'
import { computeParameterRanges } from '../../src/engine/report/parameter-ranges'

describe('v2.2 §9 — computeParameterRanges', () => {
  it('Three CO2 values across zones with outdoor baseline below differential threshold', () => {
    const zones = [
      { zn: 'Z1', co2: '800', co2o: '420' },
      { zn: 'Z2', co2: '950', co2o: '420' },
      { zn: 'Z3', co2: '1050', co2o: '420' },
    ]
    const ranges = computeParameterRanges(zones)
    expect(ranges.co2).toBeDefined()
    expect(ranges.co2!.low).toBe(800)
    expect(ranges.co2!.high).toBe(1050)
    expect(ranges.co2!.average).toBeCloseTo(933.33, 1)
    expect(ranges.co2!.unit).toBe('ppm')
    expect(ranges.co2!.outdoorReference).toBe(420)
    // Differential threshold is 700 above outdoor → max allowed = 1120.
    // High of 1050 is within standards.
    expect(ranges.co2!.withinStandards).toBe(true)
  })

  it('CO2 above differential threshold flags out-of-standards', () => {
    const zones = [
      { zn: 'Z1', co2: '800', co2o: '420' },
      { zn: 'Z2', co2: '1200', co2o: '420' },
    ]
    const ranges = computeParameterRanges(zones)
    expect(ranges.co2!.withinStandards).toBe(false)
    expect(ranges.co2!.elevatedInZones).toContain('Z2')
    expect(ranges.co2!.elevatedInZones).not.toContain('Z1')
  })

  it('CO2 without outdoor reference falls back to 1000 ppm absolute screening cap', () => {
    const zones = [{ zn: 'Z1', co2: '900' }, { zn: 'Z2', co2: '1100' }]
    const ranges = computeParameterRanges(zones)
    expect(ranges.co2!.withinStandards).toBe(false) // 1100 > 1000
    expect(ranges.co2!.outdoorReference).toBeUndefined()
  })

  it('Parameter not measured in any zone produces no entry', () => {
    const zones = [{ zn: 'Z1', co2: '900' }]
    const ranges = computeParameterRanges(zones)
    expect(ranges.co).toBeUndefined()
    expect(ranges.hcho).toBeUndefined()
    expect(ranges.tvoc).toBeUndefined()
  })

  it('RH within 30-60% comfort window passes withinStandards', () => {
    const zones = [{ zn: 'Z1', rh: '45' }, { zn: 'Z2', rh: '52' }]
    const ranges = computeParameterRanges(zones)
    expect(ranges.rh).toBeDefined()
    expect(ranges.rh!.withinStandards).toBe(true)
  })

  it('RH above 60% fails withinStandards and tags elevated zones', () => {
    const zones = [{ zn: 'Z1', rh: '45' }, { zn: 'Z2', rh: '68' }]
    const ranges = computeParameterRanges(zones)
    expect(ranges.rh!.withinStandards).toBe(false)
    expect(ranges.rh!.elevatedInZones).toContain('Z2')
  })

  it('Temperature outside 68-78°F flags out-of-standards', () => {
    const zones = [{ zn: 'Z1', tf: '79' }, { zn: 'Z2', tf: '80' }]
    const ranges = computeParameterRanges(zones)
    expect(ranges.temperature!.withinStandards).toBe(false)
  })

  it('Average is rounded to 2 decimal places', () => {
    const zones = [{ zn: 'A', co2: '800' }, { zn: 'B', co2: '801' }, { zn: 'C', co2: '802' }]
    const ranges = computeParameterRanges(zones)
    expect(Math.abs(ranges.co2!.average - 801)).toBeLessThan(0.01)
  })
})
