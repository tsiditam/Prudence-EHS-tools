/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useViewHistory — mirror MobileApp's in-memory `view` into the browser
 * history so the platform back gesture and refresh behave like a web app
 * (audit 2026-09 §6 Navigation and state: "Android back and iOS swipe-back
 * exit the PWA, refresh loses position").
 *
 *   const [view, setView] = useState(() => readInitialNav('projects').view)
 *   useViewHistory({ view, extra: { rptId }, onPop: restoreNav })
 *
 * Contract
 *   • Every view change pushes `{ af: true, view, ...extra }` with the URL
 *     hash `#/<view>` (query string preserved). `extra` carries the ids a
 *     screen needs to be rebuilt (report id, project id, incident id).
 *   • popstate with one of our entries calls `onPop(state)`; the caller
 *     decides how to restore (load the report, fall back home, …). Entries
 *     that are not ours (Supabase's auth replaceState, siteLink's cleanup)
 *     are ignored.
 *   • A view change that lands on the entry already at the top of the
 *     stack (i.e. the one a popstate just restored) is a replaceState,
 *     not a push — that is what keeps back/forward from looping. No flag
 *     needed: `history.state.view === view` is the test.
 *   • `readInitialNav(fallback)` decides the first view on load from
 *     `history.state` (survives reload) or the hash (deep link). Only
 *     routes flagged `restore` in src/constants/routes.js are honoured;
 *     assessment-flow screens depend on in-memory draft state and fall
 *     back to `fallback`. Routes whose `restore` names an id field are
 *     returned as `pending` for the caller to hydrate once storage is up.
 *   • An OAuth callback hash (`#access_token=…`) is never overwritten —
 *     Supabase reads it before the app takes over the URL.
 */

import { useEffect, useRef } from 'react'
import { ROUTES } from '../constants/routes'

export const NAV_KEY = 'af'

export function isOAuthHash(hash) {
  return /(^#|[#&?])(access_token|refresh_token|error|error_description|error_code|provider_token|code)=/.test(hash || '')
}

export function parseViewHash(hash) {
  const m = /^#\/([a-z0-9-]+)\/?$/i.exec(hash || '')
  return m ? m[1] : null
}

export function hashFor(view) {
  return '#/' + view
}

function restoreKind(view) {
  const r = ROUTES[view]
  if (!r || r.restore === false || r.restore === undefined) return false
  return r.restore // true | 'rptId' | 'projectId' | 'incidentId'
}

/**
 * First view on load. Returns `{ view, pending }` — `pending` is the full
 * history entry when the route needs an id hydrated (report, project,
 * incident); the caller shows `fallback` meanwhile and restores once it
 * can load the record.
 */
export function readInitialNav(fallback, win = typeof window !== 'undefined' ? window : null) {
  if (!win) return { view: fallback, pending: null }
  let entry = null
  try {
    const st = win.history && win.history.state
    if (st && st[NAV_KEY] && typeof st.view === 'string') entry = st
  } catch { /* history unavailable */ }
  if (!entry) {
    const v = parseViewHash(win.location && win.location.hash)
    if (v) entry = { [NAV_KEY]: true, view: v }
  }
  if (!entry) return { view: fallback, pending: null }
  const kind = restoreKind(entry.view)
  if (kind === false) return { view: fallback, pending: null }
  if (kind === true) return { view: entry.view, pending: null }
  // Needs an id. Without one there is nothing to restore.
  if (!entry[kind]) return { view: fallback, pending: null }
  return { view: fallback, pending: entry }
}

export function useViewHistory({ view, extra, onPop, enabled = true }) {
  const onPopRef = useRef(onPop)
  onPopRef.current = onPop
  // Stringified so an inline `extra` object does not retrigger the effect
  // on every render.
  const extraKey = JSON.stringify(extra || {})

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.history) return
    const entry = { [NAV_KEY]: true, view, ...(extra || {}) }
    const current = window.history.state
    const url = isOAuthHash(window.location.hash)
      ? undefined
      : window.location.pathname + window.location.search + hashFor(view)
    try {
      if (current && current[NAV_KEY] && current.view === view) {
        // Same screen (a popstate restore, or ids refreshed) — update in place.
        window.history.replaceState(entry, '', url)
      } else if (!current || !current[NAV_KEY]) {
        // First entry we own: claim the current history slot rather than
        // adding one, so back from the landing view still leaves the app
        // the way the platform expects.
        window.history.replaceState(entry, '', url)
      } else {
        window.history.pushState(entry, '', url)
      }
    } catch { /* history API unavailable (sandboxed iframe) */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, extraKey, enabled])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const handler = (e) => {
      const st = e.state
      if (!st || !st[NAV_KEY] || typeof st.view !== 'string') return
      onPopRef.current && onPopRef.current(st)
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [enabled])
}

export default useViewHistory
