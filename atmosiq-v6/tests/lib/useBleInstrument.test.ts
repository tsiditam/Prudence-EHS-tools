// @vitest-environment jsdom
/**
 * useBleInstrument — Web Bluetooth pairing + read lifecycle.
 *
 * jsdom doesn't ship a Web Bluetooth implementation, so we stub a
 * minimal navigator.bluetooth that returns a chain of fakes
 * (Device → GATTServer → Service → Characteristic) matching the
 * shape the hook reads. The fakes let us pin:
 *
 *   • supported=false when navigator.bluetooth is undefined
 *   • supported=true otherwise
 *   • pair() walks requestDevice → gatt.connect → getPrimaryService
 *     → getCharacteristic → readValue → driver.parse
 *   • Success: state ends at 'connected', reading populated
 *   • NotFoundError (chooser dismissed): error='cancelled', state='idle'
 *   • Read error: state='error', reading null
 *   • refresh() re-reads via the cached characteristic
 *   • disconnect() resets state + clears reading
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { useBleInstrument } from '../../src/hooks/useBleInstrument'
import { ARANET4_DRIVER, parseAranet4 } from '../../src/utils/bleDrivers'

interface FakeCharacteristic {
  readValue: () => Promise<DataView>
  _payload: DataView | Error
}
interface FakeService { getCharacteristic: (uuid: string) => Promise<FakeCharacteristic> }
interface FakeServer { connected: boolean; getPrimaryService: (uuid: string) => Promise<FakeService>; disconnect: () => void }
interface FakeDevice {
  name: string
  gatt: FakeServer
  _listeners: Record<string, Set<() => void>>
  addEventListener: (ev: string, fn: () => void) => void
  removeEventListener: (ev: string, fn: () => void) => void
}

let stub: {
  requestDevice: ReturnType<typeof vi.fn>
} | null = null
let lastDevice: FakeDevice | null = null

function buildPayload(): DataView {
  // 850 ppm, 22.5°C, 1013.2 hPa, 47% RH, 82% battery, green
  return new DataView(new Uint8Array([
    0x52, 0x03,
    0xC2, 0x01,
    0x94, 0x27,
    0x2F,
    0x52,
    0x01,
    0x3C, 0x00,
    0x05, 0x00,
  ]).buffer)
}

function makeFakeDevice(payloadOrError: DataView | Error = buildPayload()): FakeDevice {
  const device: FakeDevice = {
    name: 'Aranet4 12345',
    _listeners: {},
    addEventListener(ev, fn) {
      if (!this._listeners[ev]) this._listeners[ev] = new Set()
      this._listeners[ev].add(fn)
    },
    removeEventListener(ev, fn) {
      this._listeners[ev]?.delete(fn)
    },
    gatt: {
      connected: false,
      async getPrimaryService(_uuid: string) {
        const ch: FakeCharacteristic = {
          _payload: payloadOrError,
          async readValue() {
            if (this._payload instanceof Error) throw this._payload
            return this._payload
          },
        }
        return { async getCharacteristic(_chUuid: string) { return ch } }
      },
      disconnect() { this.connected = false },
    },
  }
  // Mark connected after a microtask to mimic real GATT.
  Object.defineProperty(device.gatt, 'connect', {
    value: async () => {
      device.gatt.connected = true
      return device.gatt
    },
  })
  lastDevice = device
  return device
}

beforeEach(() => {
  lastDevice = null
  stub = { requestDevice: vi.fn() }
  ;(navigator as unknown as { bluetooth: typeof stub }).bluetooth = stub
})

afterEach(() => {
  delete (navigator as unknown as { bluetooth?: unknown }).bluetooth
})

describe('useBleInstrument — supported gate', () => {
  it('returns supported=false when navigator.bluetooth is undefined', () => {
    delete (navigator as unknown as { bluetooth?: unknown }).bluetooth
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))
    expect(result.current.supported).toBe(false)
  })

  it('returns supported=true when navigator.bluetooth is present', () => {
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))
    expect(result.current.supported).toBe(true)
    expect(result.current.state).toBe('idle')
  })
})

describe('useBleInstrument — pair flow', () => {
  it('happy path: chooser pick → GATT connect → first reading parsed', async () => {
    stub!.requestDevice.mockResolvedValueOnce(makeFakeDevice())
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))

    let returned: unknown
    await act(async () => { returned = await result.current.pair() })

    expect(stub!.requestDevice).toHaveBeenCalledOnce()
    await waitFor(() => expect(result.current.state).toBe('connected'))
    expect(result.current.reading?.co2_ppm).toBe(850)
    expect(result.current.reading?.temperature_c).toBe(22.5)
    expect(returned).toMatchObject({ co2_ppm: 850 })
    expect(result.current.deviceName).toBe('Aranet4 12345')
  })

  it('chooser dismissed → state idle, error=cancelled', async () => {
    const notFound = new Error('User cancelled')
    notFound.name = 'NotFoundError'
    stub!.requestDevice.mockRejectedValueOnce(notFound)
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))

    let returned: unknown = 'placeholder'
    await act(async () => { returned = await result.current.pair() })

    expect(returned).toBeNull()
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBe('cancelled')
  })

  it('read error sets state=error and clears reading', async () => {
    const readErr = new Error('read failed')
    readErr.name = 'NetworkError'
    stub!.requestDevice.mockResolvedValueOnce(makeFakeDevice(readErr))
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))

    let returned: unknown = 'placeholder'
    await act(async () => { returned = await result.current.pair() })

    expect(returned).toBeNull()
    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe('NetworkError')
    expect(result.current.reading).toBeNull()
  })

  it('refresh() re-reads via the cached characteristic', async () => {
    stub!.requestDevice.mockResolvedValueOnce(makeFakeDevice())
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))
    await act(async () => { await result.current.pair() })
    await waitFor(() => expect(result.current.state).toBe('connected'))

    // Read again — should not re-prompt requestDevice.
    let r2: unknown
    await act(async () => { r2 = await result.current.refresh() })
    expect(stub!.requestDevice).toHaveBeenCalledOnce()
    expect((r2 as { co2_ppm?: number })?.co2_ppm).toBe(850)
  })

  it('disconnect() resets state and clears reading', async () => {
    stub!.requestDevice.mockResolvedValueOnce(makeFakeDevice())
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))
    await act(async () => { await result.current.pair() })
    await waitFor(() => expect(result.current.state).toBe('connected'))

    await act(async () => { result.current.disconnect() })
    expect(result.current.state).toBe('idle')
    expect(result.current.reading).toBeNull()
    expect(result.current.device).toBeNull()
  })

  it('gattserverdisconnected event resets state to idle', async () => {
    stub!.requestDevice.mockResolvedValueOnce(makeFakeDevice())
    const { result } = renderHook(() => useBleInstrument(ARANET4_DRIVER))
    await act(async () => { await result.current.pair() })
    await waitFor(() => expect(result.current.state).toBe('connected'))

    // Simulate the device dropping out.
    await act(async () => {
      const dev = lastDevice
      dev?._listeners.gattserverdisconnected?.forEach((fn) => fn())
    })
    expect(result.current.state).toBe('idle')
    expect(result.current.reading).toBeNull()
  })
})

describe('integration: driver parse called against the read DataView', () => {
  it('uses the driver-supplied parse function (Aranet4)', () => {
    const dv = buildPayload()
    const parsed = parseAranet4(dv)
    expect(parsed.co2_ppm).toBe(850)
    expect(parsed.temperature_c).toBe(22.5)
    expect(parsed.humidity_rh).toBe(47)
  })
})
