/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useBleSession — React adapter over the singleton in
 * src/utils/bleSession.js. Returns the current session snapshot plus
 * the action handles (refresh, disconnect) so a consumer can render
 * the live state and act on it.
 *
 *   const {
 *     active,        // boolean — a device is paired
 *     driver,        // bleDrivers.js entry or null
 *     deviceName,    // string or null
 *     reading,       // canonical reading or null
 *     lastReadAt,    // ISO timestamp or null
 *     refresh,       // async () => reading | null
 *     disconnect,    // () => void
 *     emitsMetric,   // (metric) => boolean
 *   } = useBleSession()
 *
 * Uses useSyncExternalStore so server-rendered call sites (none today
 * but cheap insurance) and concurrent React don't flicker stale
 * snapshots.
 */

import { useSyncExternalStore } from 'react'
import {
  subscribe,
  getSnapshot,
  refreshSession,
  disconnectSession,
  sessionEmitsMetric,
} from '../utils/bleSession'

export function useBleSession() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    active: !!snapshot.driver,
    driver: snapshot.driver,
    deviceName: snapshot.deviceName,
    reading: snapshot.reading,
    lastReadAt: snapshot.lastReadAt,
    refresh: refreshSession,
    disconnect: disconnectSession,
    emitsMetric: sessionEmitsMetric,
  }
}
