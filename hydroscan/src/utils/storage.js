/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Local storage wrapper. Replaces the original `window.storage` bridge shim
 * (which silently no-ops on the web, where window.storage is undefined) with a
 * real localStorage-backed store. Keeps the async get/set/del/hasVisited
 * interface the app already calls so it's a drop-in. All keys are namespaced.
 */

const PREFIX = 'hydroscan:'

function safeGet(key) {
  try { return localStorage.getItem(PREFIX + key) } catch { return null }
}
function safeSet(key, value) {
  try { localStorage.setItem(PREFIX + key, value); return true } catch { return false }
}

export const storage = {
  async get(key) {
    const raw = safeGet(key)
    if (raw == null) return null
    try { return JSON.parse(raw) } catch { return null }
  },
  async set(key, value) {
    return safeSet(key, JSON.stringify(value))
  },
  async del(key) {
    try { localStorage.removeItem(PREFIX + key) } catch { /* ignore */ }
  },
  async hasVisited() {
    const v = await storage.get('hydroscan-visited')
    if (!v) await storage.set('hydroscan-visited', true)
    return !!v
  },
}

export default storage
