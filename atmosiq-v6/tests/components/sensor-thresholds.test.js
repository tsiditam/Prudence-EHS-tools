/**
 * sensorThresholds — screening reference resolution for Logger Studio.
 */
import { describe, it, expect } from 'vitest'
import { categoryOf, CATEGORY, paramReference, exceedance } from '../../src/utils/sensorThresholds'

const winter = Date.UTC(2026, 0, 15) // January → winter band
const summer = Date.UTC(2026, 6, 15) // July → summer band

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
    expect(paramReference('temp', { unit: '°F', ts: summer }).band.max).toBe(82)
  })

  it('TVOC → 500 µg/m³ as ~218 ppb when logged in ppb, with Mølhave disclaimer', () => {
    const r = paramReference('tvoc', { unit: 'ppb' })
    expect(r.limit).toBeGreaterThan(210)
    expect(r.limit).toBeLessThan(225)
    expect(r.note).toMatch(/Mølhave 1991/)
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
