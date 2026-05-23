/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * BLE session — module-scope singleton.
 *
 * Web Bluetooth GATT connections live on the page, not on a component.
 * Without a shared session, every <BleSensorButton> that mounts on a
 * different question re-prompts the user to pair from scratch — fine
 * for one CO₂ reading, terrible for an Aranet4 you're carrying around
 * the building taking five readings per zone.
 *
 * This module holds the active device + driver + most-recent reading
 * outside React, with a pub/sub surface so any component that wants
 * to render the live state (the inline button, the Settings panel,
 * the eventual collaborator presence chip) can subscribe via
 * `useSyncExternalStore`.
 *
 * Intentionally framework-free: no React imports, just a tiny store.
 * The `useBleSession` hook is the React adapter.
 */

const listeners = new Set()

let session = {
  // Set when a device is connected. driver is the bleDrivers.js entry;
  // device is the BluetoothDevice; characteristic is the live GATT
  // characteristic (kept so refresh/disconnect can act on it without
  // re-pairing). deviceName is the display string.
  driver: null,
  device: null,
  characteristic: null,
  deviceName: null,
  // Last successful reading (canonical shape from the driver's parse).
  reading: null,
  // ISO timestamp of the last reading.
  lastReadAt: null,
}

function emit() {
  for (const cb of listeners) {
    try { cb(session) } catch { /* listener errors are not our problem */ }
  }
}

export function subscribe(cb) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function getSnapshot() {
  return session
}

/**
 * Called by useBleInstrument after a successful pair. Replaces any
 * prior session — pairing a second device drops the first.
 *
 * @param {{ driver: any, device: any, characteristic: any, deviceName?: string }} args
 */
export function setSession({ driver, device, characteristic, deviceName }) {
  session = {
    driver,
    device,
    characteristic,
    deviceName: deviceName || device?.name || driver?.name || 'Bluetooth sensor',
    reading: null,
    lastReadAt: null,
  }
  emit()
}

/**
 * Called by useBleInstrument after each successful read. Stamps the
 * timestamp so the Settings panel can show "30 s ago" freshness.
 */
export function setReading(reading) {
  if (!session.driver) return
  session = {
    ...session,
    reading,
    lastReadAt: new Date().toISOString(),
  }
  emit()
}

/**
 * Called by useBleInstrument on disconnect / unmount of the owning
 * pair flow. Safe to call when no session is active.
 */
export function clearSession() {
  if (!session.driver && !session.device) return
  session = {
    driver: null,
    device: null,
    characteristic: null,
    deviceName: null,
    reading: null,
    lastReadAt: null,
  }
  emit()
}

/**
 * Read the live GATT characteristic. Mirrors the per-hook `refresh()`
 * but works on the session-held characteristic so any subscriber can
 * trigger a re-read without owning the connection.
 *
 * Returns the parsed reading or null on failure.
 */
export async function refreshSession() {
  if (!session.driver || !session.characteristic) return null
  try {
    const dv = await session.characteristic.readValue()
    const parsed = session.driver.parse(dv)
    if (parsed && parsed._parseError) return null
    setReading(parsed)
    return parsed
  } catch {
    return null
  }
}

/**
 * Hard disconnect — drops the GATT connection AND clears the session.
 * Called from the Settings panel's "Disconnect" row or from the
 * inline button's disconnect action.
 */
export function disconnectSession() {
  const dev = session.device
  try {
    if (dev && dev.gatt && dev.gatt.connected) dev.gatt.disconnect()
  } catch { /* best-effort */ }
  clearSession()
}

/**
 * True when a metric is being emitted by the currently active device.
 * Used by BleSensorButton to decide whether to render the "Insert from
 * paired session" compact path vs the pair-from-scratch sheet.
 */
export function sessionEmitsMetric(metric) {
  if (!session.driver || !metric) return false
  const metrics = session.driver.metrics || []
  return metrics.includes(metric)
}
