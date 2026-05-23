/**
 * BLE session singleton — pub/sub + driver/device/reading lifecycle.
 *
 * Pins the contract that:
 *   • the empty snapshot has no driver / device / reading
 *   • setSession publishes; subscribers see the new snapshot
 *   • setReading updates the snapshot's reading + lastReadAt
 *   • clearSession + disconnectSession both reset to empty
 *   • sessionEmitsMetric reflects the active driver's metrics
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSnapshot,
  setSession,
  setReading,
  clearSession,
  disconnectSession,
  sessionEmitsMetric,
  subscribe,
} from '../../src/utils/bleSession'

const FAKE_DRIVER = {
  id: 'fake',
  name: 'Fake Sensor',
  vendor: 'Test',
  metrics: ['co2_ppm', 'temperature_f', 'humidity_rh'],
  filter: {},
  serviceUuid: 'uuid',
  characteristicUuid: 'uuid',
  parse: () => ({ co2_ppm: 600, temperature_f: 72.4, humidity_rh: 45 }),
}

function fakeDevice() {
  let connected = true
  return {
    name: 'Fake Device 1234',
    gatt: {
      get connected() { return connected },
      disconnect() { connected = false },
    },
  }
}

describe('bleSession', () => {
  beforeEach(() => { clearSession() })

  it('starts with no active session', () => {
    const snap = getSnapshot()
    expect(snap.driver).toBeNull()
    expect(snap.device).toBeNull()
    expect(snap.reading).toBeNull()
    expect(snap.lastReadAt).toBeNull()
  })

  it('setSession publishes the new driver + device + name', () => {
    const dev = fakeDevice()
    let received: ReturnType<typeof getSnapshot> | null = null
    const unsub = subscribe(s => { received = s })
    setSession({ driver: FAKE_DRIVER, device: dev, characteristic: null, deviceName: 'Fake Device 1234' })
    expect(received!.driver).toBe(FAKE_DRIVER)
    expect(received!.device).toBe(dev)
    expect(received!.deviceName).toBe('Fake Device 1234')
    unsub()
  })

  it('falls back to device.name or driver.name when deviceName omitted', () => {
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    expect(getSnapshot().deviceName).toBe('Fake Device 1234')
    setSession({ driver: FAKE_DRIVER, device: { name: null, gatt: {} }, characteristic: null, deviceName: undefined })
    expect(getSnapshot().deviceName).toBe('Fake Sensor')
  })

  it('setReading stamps lastReadAt', () => {
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    const reading = { co2_ppm: 850 }
    setReading(reading)
    const snap = getSnapshot()
    expect(snap.reading).toBe(reading)
    expect(typeof snap.lastReadAt).toBe('string')
    expect(snap.lastReadAt!.length).toBeGreaterThan(0)
  })

  it('setReading is a no-op when no session is active', () => {
    setReading({ co2_ppm: 700 })
    expect(getSnapshot().reading).toBeNull()
  })

  it('clearSession resets all state and notifies subscribers', () => {
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    setReading({ co2_ppm: 900 })
    let cleared = false
    const unsub = subscribe(s => { if (!s.driver) cleared = true })
    clearSession()
    expect(cleared).toBe(true)
    expect(getSnapshot().driver).toBeNull()
    expect(getSnapshot().reading).toBeNull()
    unsub()
  })

  it('disconnectSession drops the GATT connection + clears state', () => {
    const dev = fakeDevice()
    setSession({ driver: FAKE_DRIVER, device: dev, characteristic: null })
    expect(dev.gatt.connected).toBe(true)
    disconnectSession()
    expect(dev.gatt.connected).toBe(false)
    expect(getSnapshot().driver).toBeNull()
  })

  it('sessionEmitsMetric returns true when active driver lists the metric', () => {
    expect(sessionEmitsMetric('co2_ppm')).toBe(false) // no session
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    expect(sessionEmitsMetric('co2_ppm')).toBe(true)
    expect(sessionEmitsMetric('temperature_f')).toBe(true)
    expect(sessionEmitsMetric('pm2_5_ugm3')).toBe(false)
    expect(sessionEmitsMetric('')).toBe(false)
  })

  it('subscribe returns an unsubscribe function', () => {
    let count = 0
    const unsub = subscribe(() => { count += 1 })
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    expect(count).toBe(1)
    unsub()
    setSession({ driver: FAKE_DRIVER, device: fakeDevice(), characteristic: null, deviceName: undefined })
    expect(count).toBe(1)
  })

  it('aranet4 driver registry includes temperature_f for Fahrenheit-field binding', async () => {
    const { ARANET4_DRIVER } = await import('../../src/utils/bleDrivers')
    expect(ARANET4_DRIVER.metrics).toContain('temperature_f')
    expect(ARANET4_DRIVER.metrics).toContain('humidity_rh')
    expect(ARANET4_DRIVER.metrics).toContain('co2_ppm')
  })
})
