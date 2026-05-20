/**
 * @vitest-environment jsdom
 *
 * GPS formatting + capture helpers — Move 4b photo geotagging.
 *
 * formatGpsCoord is the human-readable rendering surface; this test
 * pins:
 *   • Decimal-degree precision (4 places, ~11 m resolution at equator)
 *   • Hemisphere letter from sign (N/S/E/W)
 *   • Accuracy "(±N m)" suffix when reasonable, omitted when missing or ≤0
 *   • Out-of-range coordinates rejected → null
 *
 * captureGpsReading is the geolocation wrapper; smoke-test pins:
 *   • Resolves null when navigator.geolocation is missing
 *   • Resolves null on error callback
 *   • Resolves the flattened position shape on success
 *   • Never rejects (caller doesn't need try/catch)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatGpsCoord, captureGpsReading } from '../../src/utils/gpsFormat.js'

describe('formatGpsCoord', () => {
  it('formats decimal degrees with 4-place precision and hemisphere letters', () => {
    expect(formatGpsCoord(38.9847, -77.1572)).toBe('38.9847°N, 77.1572°W')
    expect(formatGpsCoord(-33.8688, 151.2093)).toBe('33.8688°S, 151.2093°E')
    expect(formatGpsCoord(0, 0)).toBe('0.0000°N, 0.0000°E')
  })

  it('appends accuracy in meters when provided and > 0', () => {
    expect(formatGpsCoord(38.9847, -77.1572, 12)).toBe('38.9847°N, 77.1572°W (±12 m)')
    expect(formatGpsCoord(38.9847, -77.1572, 12.7)).toBe('38.9847°N, 77.1572°W (±13 m)')
  })

  it('omits the accuracy suffix when accuracy is missing, zero, or negative', () => {
    expect(formatGpsCoord(38.9847, -77.1572)).toBe('38.9847°N, 77.1572°W')
    expect(formatGpsCoord(38.9847, -77.1572, 0)).toBe('38.9847°N, 77.1572°W')
    expect(formatGpsCoord(38.9847, -77.1572, -1)).toBe('38.9847°N, 77.1572°W')
    expect(formatGpsCoord(38.9847, -77.1572, undefined as unknown as number)).toBe('38.9847°N, 77.1572°W')
    expect(formatGpsCoord(38.9847, -77.1572, NaN)).toBe('38.9847°N, 77.1572°W')
  })

  it('returns null for out-of-range coordinates', () => {
    expect(formatGpsCoord(91, 0)).toBeNull()
    expect(formatGpsCoord(-91, 0)).toBeNull()
    expect(formatGpsCoord(0, 181)).toBeNull()
    expect(formatGpsCoord(0, -181)).toBeNull()
  })

  it('returns null for missing / non-finite coordinates', () => {
    expect(formatGpsCoord(null as unknown as number, 0)).toBeNull()
    expect(formatGpsCoord(0, undefined as unknown as number)).toBeNull()
    expect(formatGpsCoord(NaN, 0)).toBeNull()
    expect(formatGpsCoord(0, Infinity)).toBeNull()
  })

  it('preserves boundary values', () => {
    expect(formatGpsCoord(90, 180)).toBe('90.0000°N, 180.0000°E')
    expect(formatGpsCoord(-90, -180)).toBe('90.0000°S, 180.0000°W')
  })
})

describe('captureGpsReading', () => {
  let originalGeolocation: unknown

  beforeEach(() => {
    originalGeolocation = (navigator as { geolocation?: unknown }).geolocation
  })

  afterEach(() => {
    if (originalGeolocation === undefined) {
      delete (navigator as { geolocation?: unknown }).geolocation
    } else {
      Object.defineProperty(navigator, 'geolocation', {
        value: originalGeolocation,
        configurable: true,
      })
    }
  })

  it('resolves null when navigator.geolocation is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    expect(await captureGpsReading()).toBeNull()
  })

  it('resolves a flat reading on successful geolocation', async () => {
    const fakeGeolocation = {
      getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
        success({
          coords: {
            latitude: 38.9847, longitude: -77.1572, accuracy: 8,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          } as unknown as GeolocationCoordinates,
          timestamp: Date.now(),
        } as unknown as GeolocationPosition)
      }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true })
    const reading = await captureGpsReading()
    expect(reading).not.toBeNull()
    expect(reading!.lat).toBeCloseTo(38.9847)
    expect(reading!.lng).toBeCloseTo(-77.1572)
    expect(reading!.accuracy).toBe(8)
    expect(typeof reading!.capturedAt).toBe('string')
  })

  it('resolves null when geolocation errors (permission denied / timeout)', async () => {
    const fakeGeolocation = {
      getCurrentPosition: vi.fn((_: unknown, error: (err: GeolocationPositionError) => void) => {
        error({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true })
    expect(await captureGpsReading()).toBeNull()
  })

  it('resolves null when getCurrentPosition throws synchronously', async () => {
    const fakeGeolocation = {
      getCurrentPosition: vi.fn(() => { throw new Error('boom') }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true })
    expect(await captureGpsReading()).toBeNull()
  })

  it('resolves null when the success callback delivers non-finite coordinates', async () => {
    const fakeGeolocation = {
      getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
        success({
          coords: { latitude: NaN, longitude: -77.1572, accuracy: 8 } as unknown as GeolocationCoordinates,
          timestamp: Date.now(),
        } as unknown as GeolocationPosition)
      }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true })
    expect(await captureGpsReading()).toBeNull()
  })

  it('handles a null accuracy by storing null (not crashing on Number.isFinite)', async () => {
    const fakeGeolocation = {
      getCurrentPosition: vi.fn((success: (pos: GeolocationPosition) => void) => {
        success({
          coords: { latitude: 38.9, longitude: -77.1, accuracy: null as unknown as number } as unknown as GeolocationCoordinates,
          timestamp: Date.now(),
        } as unknown as GeolocationPosition)
      }),
    }
    Object.defineProperty(navigator, 'geolocation', { value: fakeGeolocation, configurable: true })
    const reading = await captureGpsReading()
    expect(reading).not.toBeNull()
    expect(reading!.accuracy).toBeNull()
  })
})
