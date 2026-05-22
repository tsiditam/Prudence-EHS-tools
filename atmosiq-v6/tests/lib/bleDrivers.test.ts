/**
 * BLE driver registry + Aranet4 parser.
 *
 * Pins:
 *   • driversForMetric filters by canonical metric
 *   • isBleSupported reflects navigator.bluetooth presence
 *   • parseAranet4 produces the canonical reading shape from the
 *     documented 13-byte payload
 *   • parseAranet4 drops out-of-range values (bit-flip defense)
 *   • parseAranet4 tolerates short / null buffers
 */
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'

import {
  BLE_DRIVERS,
  ARANET4_DRIVER,
  driversForMetric,
  isBleSupported,
  parseAranet4,
} from '../../src/utils/bleDrivers'

/** Build a DataView for a known Aranet4 payload from byte arrays. */
function dv(bytes: number[]): DataView {
  const buf = new ArrayBuffer(bytes.length)
  const view = new DataView(buf)
  bytes.forEach((b, i) => view.setUint8(i, b))
  return view
}

describe('BLE driver registry', () => {
  it('exposes Aranet4 as the first driver', () => {
    expect(BLE_DRIVERS.length).toBeGreaterThan(0)
    expect(BLE_DRIVERS[0].id).toBe('aranet4')
  })

  it('Aranet4 driver advertises the right metrics', () => {
    expect(ARANET4_DRIVER.metrics).toContain('co2_ppm')
    expect(ARANET4_DRIVER.metrics).toContain('temperature_c')
    expect(ARANET4_DRIVER.metrics).toContain('humidity_rh')
    expect(ARANET4_DRIVER.metrics).toContain('pressure_hpa')
    expect(ARANET4_DRIVER.metrics).toContain('battery_pct')
  })

  it('driversForMetric returns matching drivers', () => {
    expect(driversForMetric('co2_ppm').map((d) => d.id)).toContain('aranet4')
    expect(driversForMetric('humidity_rh').map((d) => d.id)).toContain('aranet4')
  })

  it('driversForMetric returns empty list for unknown metrics', () => {
    expect(driversForMetric('radon_pci_l')).toEqual([])
  })

  it('driversForMetric with no metric returns the full registry', () => {
    expect(driversForMetric('').length).toBe(BLE_DRIVERS.length)
    expect(driversForMetric(undefined as never).length).toBe(BLE_DRIVERS.length)
  })
})

describe('isBleSupported', () => {
  const originalBluetooth = (navigator as unknown as { bluetooth?: unknown }).bluetooth

  afterEach(() => {
    if (originalBluetooth) {
      ;(navigator as unknown as { bluetooth: unknown }).bluetooth = originalBluetooth
    } else {
      delete (navigator as unknown as { bluetooth?: unknown }).bluetooth
    }
  })

  it('returns false when navigator.bluetooth is undefined (iOS Safari)', () => {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth
    expect(isBleSupported()).toBe(false)
  })

  it('returns true when navigator.bluetooth.requestDevice exists', () => {
    ;(navigator as unknown as { bluetooth: { requestDevice: () => void } }).bluetooth = {
      requestDevice: () => undefined,
    }
    expect(isBleSupported()).toBe(true)
  })
})

describe('parseAranet4 — canonical reading', () => {
  it('parses a well-formed 13-byte payload', () => {
    // 850 ppm CO2, 22.5 °C, 1013.2 hPa, 47% RH, 82% battery, status=green (1)
    // CO2:    850 = 0x0352 → LE bytes [0x52, 0x03]
    // Temp:   22.5 * 20 = 450 = 0x01C2 → [0xC2, 0x01]
    // Pres:   10132 = 0x2794 → [0x94, 0x27]
    // RH:     47 → 0x2F
    // Batt:   82 → 0x52
    // Status: 1 → 0x01
    // Interval: 60 = 0x003C → [0x3C, 0x00]
    // Ago:    5 = 0x0005 → [0x05, 0x00]
    const reading = parseAranet4(dv([
      0x52, 0x03,
      0xC2, 0x01,
      0x94, 0x27,
      0x2F,
      0x52,
      0x01,
      0x3C, 0x00,
      0x05, 0x00,
    ]))
    expect(reading.co2_ppm).toBe(850)
    expect(reading.temperature_c).toBe(22.5)
    expect(reading.temperature_f).toBeCloseTo(72.5, 1)
    expect(reading.pressure_hpa).toBeCloseTo(1013.2, 1)
    expect(reading.humidity_rh).toBe(47)
    expect(reading.battery_pct).toBe(82)
    expect(reading.status).toBe('good')
    expect(typeof reading.timestamp_iso).toBe('string')
  })

  it('drops CO2 readings that are zero (no measurement yet)', () => {
    const reading = parseAranet4(dv([0x00, 0x00, 0xC2, 0x01, 0x94, 0x27, 0x2F, 0x52]))
    expect(reading.co2_ppm).toBeUndefined()
    expect(reading.temperature_c).toBe(22.5)
  })

  it('drops out-of-range temperature (bit-flip defense)', () => {
    // 9000/20 = 450°C — obviously garbage
    const reading = parseAranet4(dv([0x52, 0x03, 0x28, 0x23, 0x94, 0x27, 0x2F, 0x52]))
    expect(reading.temperature_c).toBeUndefined()
    expect(reading.co2_ppm).toBe(850)
  })

  it('drops out-of-range humidity / pressure', () => {
    // RH=200 (invalid > 100), pressure=0.5hPa (invalid < 700)
    const reading = parseAranet4(dv([0x52, 0x03, 0xC2, 0x01, 0x05, 0x00, 0xC8, 0x52]))
    expect(reading.humidity_rh).toBeUndefined()
    expect(reading.pressure_hpa).toBeUndefined()
  })

  it('emits status="warning" for yellow (2) and "poor" for red (3)', () => {
    const yellow = parseAranet4(dv([
      0x52, 0x03, 0xC2, 0x01, 0x94, 0x27, 0x2F, 0x52, 0x02,
    ]))
    expect(yellow.status).toBe('warning')
    const red = parseAranet4(dv([
      0x52, 0x03, 0xC2, 0x01, 0x94, 0x27, 0x2F, 0x52, 0x03,
    ]))
    expect(red.status).toBe('poor')
  })

  it('returns a parse error on payloads shorter than 8 bytes', () => {
    const r = parseAranet4(dv([0x01, 0x02, 0x03]))
    expect(r._parseError).toBe('short_payload')
    expect(r.byteLength).toBe(3)
  })

  it('returns a parse error on null / undefined input', () => {
    expect((parseAranet4(null as unknown as DataView)._parseError)).toBe('short_payload')
    expect((parseAranet4(undefined as unknown as DataView)._parseError)).toBe('short_payload')
  })

  it('emits temperature_f computed from temperature_c', () => {
    const r = parseAranet4(dv([
      0x52, 0x03,
      0x20, 0x01, // 288 / 20 = 14.4°C
      0x94, 0x27,
      0x2F,
      0x52,
    ]))
    expect(r.temperature_c).toBe(14.4)
    expect(r.temperature_f).toBeCloseTo(57.92, 1)
  })
})
