/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useBleInstrument — Web Bluetooth pairing + live-readings hook for
 * the AtmosFlow instrument-driver registry (src/utils/bleDrivers.js).
 *
 *   const {
 *     supported,    // boolean — navigator.bluetooth available
 *     state,        // 'idle' | 'pairing' | 'connected' | 'reading' | 'error'
 *     device,       // BluetoothDevice or null
 *     deviceName,   // string or null — for display
 *     reading,      // canonical reading object (latest) or null
 *     error,        // string code or null
 *     pair,         // () => Promise<reading | null>  initiates pairing
 *     refresh,      // () => Promise<reading | null>  re-reads from a paired device
 *     disconnect,   // () => void
 *   } = useBleInstrument(driver)
 *
 * State machine:
 *   idle → pairing → connected → reading → connected → ...
 *                              ↘ error
 *
 * pair() is one-shot user-gesture: opens the browser pairing dialog,
 * connects GATT, reads the driver's current-values characteristic,
 * resolves with the parsed reading. Subsequent refresh() calls reuse
 * the GATT connection without re-prompting.
 *
 * GATT connections drop on tab background / device sleep — the
 * 'gattserverdisconnected' event is wired so the hook returns to
 * the 'idle' state cleanly when the device disappears.
 *
 * Web Bluetooth is unavailable on iOS Safari. Callers should check
 * `supported` and present an iOS-Safari-specific fallback message
 * (e.g. "Pair via Chrome on Android or the Bluefy browser on iPhone").
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isBleSupported } from '../utils/bleDrivers'
import {
  setSession as publishSession,
  setReading as publishReading,
  clearSession as clearPublishedSession,
} from '../utils/bleSession'

export function useBleInstrument(driver) {
  const supported = isBleSupported()
  const [state, setState] = useState('idle')
  const [device, setDevice] = useState(null)
  const [reading, setReading] = useState(null)
  const [error, setError] = useState(null)
  const characteristicRef = useRef(null)
  const disconnectHandlerRef = useRef(null)

  // Tear down GATT cleanly on unmount so a navigated-away page
  // doesn't keep the radio active.
  useEffect(() => {
    return () => { cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanup = useCallback(() => {
    try {
      if (device && device.gatt && device.gatt.connected) {
        device.gatt.disconnect()
      }
    } catch { /* swallow — disconnect during teardown is best-effort */ }
    if (device && disconnectHandlerRef.current) {
      try { device.removeEventListener('gattserverdisconnected', disconnectHandlerRef.current) } catch { /* */ }
    }
    characteristicRef.current = null
    disconnectHandlerRef.current = null
  }, [device])

  /**
   * One-shot read of the driver's current-values characteristic
   * via the cached server connection. Returns the parsed reading,
   * or null on failure (with `error` set).
   */
  const readCharacteristic = useCallback(async () => {
    const ch = characteristicRef.current
    if (!ch) {
      setError('not_connected')
      return null
    }
    setState('reading')
    try {
      const dv = await ch.readValue()
      const parsed = driver.parse(dv)
      if (parsed && parsed._parseError) {
        setError(parsed._parseError)
        setState('error')
        return null
      }
      setReading(parsed)
      publishReading(parsed)
      setState('connected')
      setError(null)
      return parsed
    } catch (err) {
      const code = (err && (err.code || err.name)) || 'read_failed'
      setError(typeof code === 'string' ? code : 'read_failed')
      setState('error')
      return null
    }
  }, [driver])

  const pair = useCallback(async () => {
    if (!supported) {
      setError('unsupported')
      setState('error')
      return null
    }
    if (!driver) {
      setError('no_driver')
      setState('error')
      return null
    }
    setError(null)
    setState('pairing')

    let nextDevice
    try {
      nextDevice = await navigator.bluetooth.requestDevice({
        filters: [driver.filter],
        // optionalServices is only needed when accessing services
        // outside the filter set. Listing the driver's service
        // here too is defensive against firmware variants that
        // advertise the service UUID but not the namePrefix.
        optionalServices: [driver.serviceUuid],
      })
    } catch (err) {
      // NotFoundError is the standard code when the user dismisses
      // the chooser without picking a device. Normalize to a calm
      // 'cancelled' so the UI doesn't flash a scary error.
      const name = (err && err.name) || ''
      if (name === 'NotFoundError') {
        setError('cancelled')
        setState('idle')
        return null
      }
      setError(name || 'pair_failed')
      setState('error')
      return null
    }

    // Wire the gattserverdisconnected event before connecting so a
    // disconnect-during-connect race doesn't leak handlers.
    const onDisc = () => {
      characteristicRef.current = null
      setState('idle')
      setReading(null)
      clearPublishedSession()
    }
    disconnectHandlerRef.current = onDisc
    nextDevice.addEventListener('gattserverdisconnected', onDisc)
    setDevice(nextDevice)

    let server, service, characteristic
    try {
      server = await nextDevice.gatt.connect()
      service = await server.getPrimaryService(driver.serviceUuid)
      characteristic = await service.getCharacteristic(driver.characteristicUuid)
    } catch (err) {
      const name = (err && err.name) || 'gatt_failed'
      setError(name)
      setState('error')
      try { nextDevice.gatt.disconnect() } catch { /* ignore */ }
      return null
    }

    characteristicRef.current = characteristic
    publishSession({
      driver,
      device: nextDevice,
      characteristic,
      deviceName: nextDevice.name || driver.name,
    })
    setState('connected')

    // First read — happens implicitly so the user sees data right
    // after pairing without an extra tap.
    return await readCharacteristic()
  }, [supported, driver, readCharacteristic])

  const disconnect = useCallback(() => {
    cleanup()
    setDevice(null)
    setReading(null)
    setState('idle')
    setError(null)
    clearPublishedSession()
  }, [cleanup])

  return {
    supported,
    state,
    device,
    deviceName: device ? (device.name || driver.name) : null,
    reading,
    error,
    pair,
    refresh: readCharacteristic,
    disconnect,
  }
}
