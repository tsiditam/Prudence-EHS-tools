/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useNetworkStatus — single source of truth for the browser's
 * online/offline signal. Replaces the duplicated
 *   const [online, setOnline] = useState(navigator.onLine)
 *   useEffect(() => { addEventListener('online', ...) ... })
 * pattern that was sprinkled across FieldAssistant.jsx, MobileApp.jsx,
 * useFieldAssistant.js, useInlineAi.js, etc.
 *
 * Returns:
 *   {
 *     online,           // boolean — current navigator.onLine
 *     since,            // ISO timestamp of the last state change
 *     wasOffline,       // true if the session has experienced an
 *                       // offline period (used to surface "you went
 *                       // offline earlier — anything in the AI
 *                       // queue is being retried" affordances)
 *   }
 *
 * SSR-safe: returns online:true when window is undefined so server-
 * side renders don't paint the offline banner.
 *
 * Internally tracks a single module-level subscriber list so adding
 * many call sites doesn't multiply the addEventListener overhead.
 */

import { useEffect, useState } from 'react'

function readOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

// Module-level state so all hook consumers share one listener pair.
let _online = readOnline()
let _since = new Date().toISOString()
let _wasOffline = !_online
const _listeners = new Set()

function emit() {
  for (const fn of _listeners) {
    try { fn() } catch { /* listener crashed — keep the others alive */ }
  }
}

if (typeof window !== 'undefined') {
  const onOnline = () => {
    if (_online) return
    _online = true
    _since = new Date().toISOString()
    emit()
  }
  const onOffline = () => {
    if (!_online) return
    _online = false
    _since = new Date().toISOString()
    _wasOffline = true
    emit()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
}

export function useNetworkStatus() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  }, [])
  return { online: _online, since: _since, wasOffline: _wasOffline }
}

/**
 * Imperative read for non-React call sites (the sync queue, the AI
 * SSE setup paths). Same source of truth as the hook so all paths
 * agree on offline-ness.
 */
export function isOnline() {
  return _online
}

/**
 * Test hook — flip the network state without firing actual
 * browser events. Exported under __test so production code can't
 * accidentally toggle it.
 */
export const __test = {
  setOnline(v) {
    const next = !!v
    if (next === _online) return
    _online = next
    _since = new Date().toISOString()
    if (!next) _wasOffline = true
    emit()
  },
  reset() {
    _online = readOnline()
    _since = new Date().toISOString()
    _wasOffline = !_online
  },
}
