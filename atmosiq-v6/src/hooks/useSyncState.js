/**
 * useSyncState — React hook that exposes the current offline-sync
 * queue state for any UI component to render reactively.
 *
 * Subscribes to the 'atmosflow:sync-state-changed' CustomEvent that
 * supabaseStorage.js dispatches on enqueue + on processSyncQueue
 * start/end. Also polls every 4 seconds as a fallback so a missed
 * event (cross-tab edit, future BroadcastChannel migration, etc.)
 * still produces a fresh state within a reasonable window.
 *
 * Returns null until the first read completes; consumers should
 * handle that case (typically by rendering nothing).
 *
 * Shape (matches Storage.getSyncState()):
 *   {
 *     queueDepth: number,
 *     inFlight: boolean,
 *     lastAttempt: string | null,   // ISO timestamp
 *     lastSuccess: string | null,   // ISO timestamp
 *     lastError: string | null,
 *     online: boolean,
 *   }
 */

import { useEffect, useState } from 'react'
import Storage from '../utils/cloudStorage'

const SYNC_EVENT = 'atmosflow:sync-state-changed'
const POLL_INTERVAL_MS = 4000

export function useSyncState() {
  const [state, setState] = useState(null)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const next = await Storage.getSyncState()
        if (!cancelled) setState(next)
      } catch { /* swallow — UI just stays on the last good state */ }
    }

    refresh()
    const onEvent = () => { refresh() }
    window.addEventListener(SYNC_EVENT, onEvent)
    const id = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener(SYNC_EVENT, onEvent)
      clearInterval(id)
    }
  }, [])

  return state
}
