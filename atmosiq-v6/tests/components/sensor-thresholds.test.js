/**
 * sensorThresholds — screening reference resolution for Logger Studio.
 */
import { describe, it, expect } from 'vitest'
import { categoryOf, CATEGORY, paramReference, exceedance, belowScreeningFloor, SCREENING_DETECTION_FLOORS } from '../../src/utils/sensorThresholds'

const winter = Date.UTC(2026, 0, 15) // January → winter band
const summer = Date.UTC(2026, 6, 15) // July → summer band

describe('belowScreeningFloor — sub-detection screening floor', () => {
  it('has a conservative formaldehyde floor and no false-positive-prone analytes', () => {
    expect(SCREENING_DETECTION_FLOORS.hcho.ppb).toBe(1)
    // CO / TVOC can legitimately read near zero — they must NOT carry a floor.
    expect(SCREENING_DETECTION_FLOORS.co).toBeUndefined()
    expect(SCREENING_DETECTION_FLOORS.tvoc).toBeUndefined()
  })

  it('flags a whole HCHO series below the floor, across logged units', () => {
    expect(belowScreeningFloor('hcho', 0.05, 'ppb')).toBe(true)      // 0.05 < 1 ppb
    expect(belowScreeningFloor('hcho', 5, 'ppb')).toBe(false)        // 5 ppb is real
    expect(belowScreeningFloor('hcho', 0.0005, 'ppm')).toBe(true)    // <0.001 ppm (1 ppb)
    expect(belowScreeningFloor('hcho', 0.5, 'µg/m³')).toBe(true)     // <~1.23 µg/m³ (1 ppb)
    expect(belowScreeningFloor('hcho', 5, 'µg/m³')).toBe(false)
  })

  it('makes no claim without a floor, a finite max, or a convertible unit', () => {
    expect(belowScreeningFloor('co2', 0, 'ppm')).toBe(false)         // no floor for CO2
    expect(belowScreeningFloor('hcho', null, 'ppb')).toBe(false)
    expect(belowScreeningFloor('hcho', NaN, 'ppb')).toBe(false)
    expect(belowScreeningFloor('hcho', 0.05, 'weird')).toBe(false)   // unconvertible unit
  })
})

describe('categoryOf / CATEGORY', () => {
  it('buckets parameters into the three sections', () => {
    expect(categoryOf('temp')).toBe('thermal')
    expect(categoryOf('rh')).toBe('thermal')
    expect(categoryOf('co2')).toBe('air')
    expect(categoryOf('pm25')).toBe('air')
    expect(categoryOf('tvoc')).toBe('chemical')
    expect(categoryOf('hcho')).toBe('chemical')
    expect(CATEGORY.map((c) => c.id)).toEqual(['thermal', 'air', 'chemical'])
  })
})

describe('paramReference', () => {
  it('CO₂ → NIOSH 1000 primary, ASHRAE 62.1 ventilation surrogate secondary', () => {
    const r = paramReference('co2', { unit: 'ppm' })
    expect(r.limit).toBe(1000)
    expect(r.limitLabel).toBe('NIOSH')
    expect(r.refs.join(' ')).toMatch(/NIOSH: <1000 ppm/)
    expect(r.refs.join(' ')).toMatch(/ASHRAE 62\.1.*ventilation surrogate.*above outdoor/)
    expect(r.refs.join(' ')).not.toMatch(/WELL/)
    expect(r.note).toMatch(/ventilation/i)
  })

  it('PM2.5 → 24-hour references (not annual)', () => {
    const r = paramReference('pm25', { unit: 'µg/m³' })
    expect(r.limit).toBe(35)
    expect(r.refs.join(' ')).toMatch(/EPA 24-h: 35/)
    expect(r.refs.join(' ')).toMatch(/WHO 24-h: 15/)
  })

  it('CO → OSHA PEL + EPA NAAQS 8-h (9 ppm)', () => {
    const r = paramReference('co', { unit: 'ppm' })
    expect(r.limit).toBe(9)
    expect(r.refs.join(' ')).toMatch(/OSHA PEL: 50/)
    expect(r.refs.join(' ')).toMatch(/EPA NAAQS 8-h: 9/)
  })

  it('RH → ASHRAE 30–60% comfort band', () => {
    const r = paramReference('rh', { unit: '%' })
    expect(r.band).toEqual({ min: 30, max: 60 })
  })

  it('Temperature → seasonal comfort band, converted to the displayed unit', () => {
    const f = paramReference('temp', { unit: '°F', ts: winter })
    expect(f.band.min).toBeGreaterThanOrEqual(68)
    expect(f.band.max).toBe(76)
    const c = paramReference('temp', { unit: '°C', ts: winter })
    expect(c.band.min).toBeCloseTo(20, 0)
    expect(c.band.max).toBeCloseTo(24, 0)
    // Summer band differs from winter.
    expect(paramReference('temp', { unit: '°F', ts: summer }).band.max).toBe(79)
  })

  it('TVOC → no reference line in any unit, and the card says why', () => {
    // Three tests lived here: the tier restated in ppb against isobutylene
    // with the assumption disclosed, the mass-unit precision case (0.5 mg/m³,
    // not 1 — whole-number rounding once doubled it), and the no-basis case
    // where a bare index unit got no line but still explained itself.
    //
    // All three were careful about HOW to state a comparison, and the
    // comparison itself went in 2026-08: TVOC is a non-specific sum with no
    // consensus health-based limit, so there is no tier to restate, round or
    // withhold. What survives is the third test's principle — the line does
    // not silently vanish, the card says there is nothing to draw.
    for (const unit of ['ppb', 'ppm', 'µg/m³', 'mg/m³', 'index', '']) {
      const r = paramReference('tvoc', { unit })
      expect(r.limit, unit).toBeNull()
      expect(r.band, unit).toBeNull()
      expect(r.refs, unit).toEqual([])
      expect(r.note, unit).toMatch(/no consensus health-based limit/i)
      expect(r.note, unit).toMatch(/TO-17/)
    }
  })

  it('TVOC → the recorded calibration gas cannot conjure a reference', () => {
    // `calibrationGas` decided which molecular weight the tier was restated
    // through. With no tier, it has nothing to weigh — and must not become a
    // back door that produces one.
    for (const gas of ['Isobutylene 100 ppm', 'Toluene 100 ppm', 'Freon 12', '']) {
      expect(paramReference('tvoc', { unit: 'ppb', calibrationGas: gas }).limit, gas).toBeNull()
    }
  })

  it('HCHO → NIOSH REL projected into the logged unit', () => {
    expect(paramReference('hcho', { unit: 'ppb' }).limit).toBeCloseTo(16, 0)
    // 16 ppb ≈ 0.020 mg/m³ (matches the report mockup)
    expect(paramReference('hcho', { unit: 'mg/m³' }).limit).toBeCloseTo(0.02, 2)
  })
})

describe('exceedance', () => {
  it('peak-only excursion over a limit reads as warn', () => {
    const ref = paramReference('co2', { unit: 'ppm' })
    // Bumped max from 909 → 1100 after the CO₂ primary limit moved
    // from WELL 800 → NIOSH 1000; 909 no longer exceeds.
    const r = exceedance('co2', { mean: 667, max: 1100 }, ref)
    expect(r.level).toBe('warn')
    expect(r.message).toMatch(/Peak 1100 ppm exceeded NIOSH/)
  })

  it('sustained mean over a limit reads as danger', () => {
    const ref = paramReference('hcho', { unit: 'ppb' })
    const r = exceedance('hcho', { mean: 23, max: 46 }, ref)
    expect(r.level).toBe('danger')
    expect(r.message).toMatch(/Mean exceeds NIOSH REL/)
  })

  it('values under the limit do not flag', () => {
    const ref = paramReference('pm25', { unit: 'µg/m³' })
    expect(exceedance('pm25', { mean: 6.5, max: 8.3 }, ref).level).toBeNull()
  })

  it('comfort band: mean inside is clean, outside warns', () => {
    const ref = paramReference('rh', { unit: '%' })
    expect(exceedance('rh', { mean: 42, max: 44 }, ref).level).toBeNull()
    expect(exceedance('rh', { mean: 22, max: 25 }, ref).level).toBe('warn')
  })
})
