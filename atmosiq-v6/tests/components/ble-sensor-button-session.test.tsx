// @vitest-environment jsdom
/**
 * BleSensorButton — active-session integration.
 *
 * When a Bluetooth session is already active AND the paired driver
 * emits the metric this button is bound to:
 *   • the inline button shows the live-session indicator (green dot,
 *     success-color glyph)
 *   • tapping the button opens the sheet straight to the
 *     active-session view (no driver picker)
 *   • the Insert button delivers the latest reading via onInsert
 *   • Disconnect tears down the session
 *
 * When no session is active, the existing pair flow renders unchanged.
 *
 * isBleSupported is forced to true via a stub so the sheet doesn't
 * fall back to the iOS-Safari unsupported view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../src/utils/bleDrivers', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/bleDrivers')>(
    '../../src/utils/bleDrivers',
  )
  return { ...actual, isBleSupported: () => true }
})

import BleSensorButton from '../../src/components/BleSensorButton'
import {
  setSession,
  setReading,
  clearSession,
  getSnapshot,
} from '../../src/utils/bleSession'

const FAKE_DRIVER = {
  id: 'fake-aranet',
  name: 'Aranet4',
  vendor: 'SAF Tehnika',
  metrics: ['co2_ppm', 'temperature_f', 'humidity_rh'],
  filter: {},
  serviceUuid: 'uuid',
  characteristicUuid: 'uuid',
  parse: () => ({}),
}

function setupActiveSession() {
  setSession({
    driver: FAKE_DRIVER,
    device: { name: 'Aranet4 1234', gatt: { connected: true, disconnect() {} } },
    characteristic: null,
    deviceName: 'Aranet4 1234',
  })
  setReading({ co2_ppm: 847, temperature_f: 72.4, humidity_rh: 46 })
}

beforeEach(() => { clearSession() })
afterEach(() => { cleanup(); clearSession() })

describe('BleSensorButton — active session', () => {
  it('shows the live-session indicator on the inline button when a paired driver emits this metric', () => {
    setupActiveSession()
    render(<BleSensorButton metric="co2_ppm" onInsert={() => {}} />)
    const btn = screen.getByTestId('ble-sensor-button')
    expect(btn.getAttribute('data-session-active')).toBe('true')
    expect(btn.getAttribute('aria-label')).toMatch(/Aranet4 1234/)
  })

  it('does not show the live-session indicator when the active driver does not emit this metric', () => {
    setupActiveSession()
    render(<BleSensorButton metric="pm2_5_ugm3" onInsert={() => {}} />)
    const btn = screen.getByTestId('ble-sensor-button')
    expect(btn.getAttribute('data-session-active')).toBe('false')
  })

  it('shows the active-session view (not the driver picker) when the button is tapped', () => {
    setupActiveSession()
    render(<BleSensorButton metric="co2_ppm" onInsert={() => {}} />)
    fireEvent.click(screen.getByTestId('ble-sensor-button'))
    expect(screen.getByTestId('ble-active-session')).toBeTruthy()
    // Driver picker would render the device chooser button labels;
    // active-session view renders the Insert button with the value.
    expect(screen.getByTestId('ble-session-insert').textContent).toMatch(/847/)
  })

  it('Insert delivers the latest reading via onInsert', () => {
    setupActiveSession()
    const onInsert = vi.fn()
    render(<BleSensorButton metric="co2_ppm" onInsert={onInsert} />)
    fireEvent.click(screen.getByTestId('ble-sensor-button'))
    fireEvent.click(screen.getByTestId('ble-session-insert'))
    expect(onInsert).toHaveBeenCalledTimes(1)
    expect(onInsert.mock.calls[0][0]).toBe(847)
    expect(onInsert.mock.calls[0][1]).toEqual({
      co2_ppm: 847, temperature_f: 72.4, humidity_rh: 46,
    })
  })

  it('Disconnect tears down the session and closes the sheet', () => {
    setupActiveSession()
    render(<BleSensorButton metric="co2_ppm" onInsert={() => {}} />)
    fireEvent.click(screen.getByTestId('ble-sensor-button'))
    fireEvent.click(screen.getByTestId('ble-session-disconnect'))
    expect(getSnapshot().driver).toBeNull()
    // Sheet closes — active-session view should be gone.
    expect(screen.queryByTestId('ble-active-session')).toBeNull()
  })

  it('Temperature field shows the live-session indicator when paired driver emits temperature_f', () => {
    setupActiveSession()
    render(<BleSensorButton metric="temperature_f" onInsert={() => {}} />)
    const btn = screen.getByTestId('ble-sensor-button')
    expect(btn.getAttribute('data-session-active')).toBe('true')
    fireEvent.click(btn)
    expect(screen.getByTestId('ble-session-insert').textContent).toMatch(/72\.4/)
  })

  it('falls through to the existing pair flow when no session is active', () => {
    render(<BleSensorButton metric="co2_ppm" onInsert={() => {}} />)
    const btn = screen.getByTestId('ble-sensor-button')
    expect(btn.getAttribute('data-session-active')).toBe('false')
    fireEvent.click(btn)
    expect(screen.queryByTestId('ble-active-session')).toBeNull()
  })
})
