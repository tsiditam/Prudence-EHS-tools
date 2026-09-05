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
 *                'storage_quota' renders as "Device storage full".
 *   - Conflict — red pill: "N conflicts". A push was refused because
 *                another device changed the report first (migration 034)
 *                or the issued report is immutable. Retrying cannot help;
 *                the count stays until the conflict is resolved
 *                (Storage.resolveConflict / reopenAssessment).
 *
 * Placement: top-right corner, just below the safe-area inset, so it
 * sits beside the existing connection toast in MobileApp.jsx without
 * fighting it for the same vertical band.
 */

import { useSyncState } from '../hooks/useSyncState'
import Storage from '../utils/cloudStorage'
import { useState } from 'react'

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
  const [showDetail, setShowDetail] = useState(false)

  if (!state) return null

  const conflictCount = state.conflictCount ?? (Array.isArray(state.conflicts) ? state.conflicts.length : 0)
  const quotaError = state.lastError === 'storage_quota'
  const hasError = !!state.lastError && (state.queueDepth > 0 || quotaError)
  const isSyncing = state.inFlight
  const hasPending = state.queueDepth > 0
  const hasConflict = conflictCount > 0

  // Nothing to surface — stay out of the way.
  if (!hasError && !isSyncing && !hasPending && !hasConflict) return null

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  let bg, fg, label
  if (isSyncing) {
    bg = '#3B82F6'   // blue-500
    fg = '#FFFFFF'
    label = `Syncing ${plural(state.queueDepth, 'item')}…`
  } else if (hasConflict) {
    bg = '#EF4444'   // red-500
    fg = '#FFFFFF'
    label = hasPending
      ? `${plural(conflictCount, 'conflict')}, ${state.queueDepth} pending`
      : plural(conflictCount, 'conflict')
  } else if (hasError) {
    bg = '#EF4444'   // red-500
    fg = '#FFFFFF'
    label = quotaError
      ? `Device storage full${hasPending ? `: ${state.queueDepth} pending` : ''}`
      : `Sync had errors: ${state.queueDepth} pending`
  } else {
    bg = '#F59E0B'   // amber-500
    fg = '#000000'
    label = `${plural(state.queueDepth, 'item')} pending sync`
  }

  const onSyncNow = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Fire and forget — the indicator re-renders via the event the
    // queue dispatches on start/end.
    Storage.processSyncQueue()
  }

  const lastSync = relativeTime(state.lastSuccess)

  // The reason the drain failed, for the title/tooltip and for anyone
  // reading a screenshot. The pill itself stays short; without this the
  // banner said only THAT sync failed, which is not enough to act on
  // (the first real report of it could not be diagnosed from the screen).
  const errorDetail = hasError && !quotaError && typeof state.lastError === 'string'
    ? state.lastError
    : null
  const title = [
    label,
    errorDetail ? `Reason: ${errorDetail}` : null,
    lastSync ? `Last synced ${lastSync}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pending-sync-indicator"
      title={title}
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
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 4,
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      {!isSyncing && state.online && hasPending && (
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
      {errorDetail && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDetail((v) => !v) }}
          aria-expanded={showDetail}
          aria-label={showDetail ? 'Hide sync error detail' : 'Show sync error detail'}
          style={{
            background: 'transparent', border: `1px solid ${fg}`, color: fg,
            borderRadius: 6, padding: '2px 6px', fontSize: 10, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
            minWidth: 22, minHeight: 22,
          }}
        >
          {showDetail ? '\u2715' : '?'}
        </button>
      )}
      </div>
      {errorDetail && showDetail && (
        <div
          data-testid="sync-error-detail"
          style={{
            fontSize: 10, fontWeight: 500, lineHeight: 1.4, opacity: 0.95,
            whiteSpace: 'normal', wordBreak: 'break-word', paddingLeft: 14,
          }}
        >
          {errorDetail}
        </div>
      )}
    </div>
  )
}
