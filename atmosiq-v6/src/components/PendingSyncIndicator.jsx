/**
 * PendingSyncIndicator — persistent badge surfacing the offline sync
 * queue state. Renders nothing when there is nothing to show
 * (queueDepth === 0 AND not currently syncing AND no recent error),
 * which keeps the chrome empty in the common "caught up" case.
 *
 * Three visible states:
 *
 *   - Syncing  — blue pill with spinner-style dot. Active drain.
 *   - Pending  — amber pill: "N items pending sync". Queue is non-empty;
 *                if online, the next periodic / focus / online-event
 *                trigger will drain it. User can tap "Sync now" to
 *                force a drain immediately.
 *   - Error    — red pill: "Sync had errors". Last drain left items in
 *                the queue and recorded an error. Tap "Sync now" to retry.
 *
 * Placement: top-right corner, just below the safe-area inset, so it
 * sits beside the existing connection toast in MobileApp.jsx without
 * fighting it for the same vertical band.
 */

import { useSyncState } from '../hooks/useSyncState'
import Storage from '../utils/cloudStorage'

function relativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export default function PendingSyncIndicator() {
  const state = useSyncState()

  if (!state) return null

  const hasError = !!state.lastError && state.queueDepth > 0
  const isSyncing = state.inFlight
  const hasPending = state.queueDepth > 0

  // Nothing to surface — stay out of the way.
  if (!hasError && !isSyncing && !hasPending) return null

  let bg, fg, label
  if (isSyncing) {
    bg = '#3B82F6'   // blue-500
    fg = '#FFFFFF'
    label = `Syncing ${state.queueDepth} item${state.queueDepth === 1 ? '' : 's'}…`
  } else if (hasError) {
    bg = '#EF4444'   // red-500
    fg = '#FFFFFF'
    label = `Sync had errors: ${state.queueDepth} pending`
  } else {
    bg = '#F59E0B'   // amber-500
    fg = '#000000'
    label = `${state.queueDepth} item${state.queueDepth === 1 ? '' : 's'} pending sync`
  }

  const onSyncNow = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Fire and forget — the indicator re-renders via the event the
    // queue dispatches on start/end.
    Storage.processSyncQueue()
  }

  const lastSync = relativeTime(state.lastSuccess)

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pending-sync-indicator"
      style={{
        position: 'fixed',
        top: 'calc(56px + env(safe-area-inset-top, 0px))',
        right: 12,
        zIndex: 290,
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: '6px 12px 6px 10px',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: fg,
          opacity: isSyncing ? 0.5 : 1,
          animation: isSyncing ? 'pulse 1.2s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {!isSyncing && state.online && (
        <button
          type="button"
          onClick={onSyncNow}
          aria-label="Sync now"
          style={{
            background: 'transparent',
            border: `1px solid ${fg}`,
            color: fg,
            borderRadius: 6,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Sync now
        </button>
      )}
      {!hasPending && lastSync && (
        <span style={{ fontSize: 10, opacity: 0.85 }}>last {lastSync}</span>
      )}
    </div>
  )
}
