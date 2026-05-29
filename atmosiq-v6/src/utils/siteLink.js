/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Deep-link parser for the reassessment-reminder email
 * (habit-loop PR 1). The email body links to
 *   https://atmosflow.net/?start=site&id=<site_id>
 * When MobileApp mounts and finds those params, it opens the New
 * Assessment flow with `bldg` + `presurvey` already hydrated from
 * the most recent finalized assessment that referenced this site.
 *
 * Pure functions — no I/O. Network calls are the caller's job
 * (POST /api/sites with the site id, fetch the most recent finalized
 * report from local storage / cloud).
 */

/**
 * Parse the current URL for the site deep-link. Returns the site id
 * when the URL is `?start=site&id=<uuid>`, null otherwise. Idempotent;
 * safe to call on every render.
 */
export function parseSiteLink(searchOrUrl) {
  try {
    let params
    if (typeof searchOrUrl === 'string' && searchOrUrl.startsWith('?')) {
      params = new URLSearchParams(searchOrUrl)
    } else if (typeof searchOrUrl === 'string') {
      // Full URL
      params = new URL(searchOrUrl).searchParams
    } else if (typeof window !== 'undefined' && window.location) {
      params = new URLSearchParams(window.location.search)
    } else {
      return null
    }
    if (params.get('start') !== 'site') return null
    const id = params.get('id')
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

/**
 * Clear the deep-link params from the URL once they've been
 * consumed, so a refresh doesn't re-trigger the hydration. Uses
 * replaceState so no navigation event is emitted.
 */
export function clearSiteLink() {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return
    const url = new URL(window.location.href)
    url.searchParams.delete('start')
    url.searchParams.delete('id')
    window.history.replaceState({}, document.title, url.pathname + (url.search || '') + url.hash)
  } catch {
    // Non-fatal.
  }
}

/**
 * Given a site and a list of historical reports, find the most
 * recent finalized report that referenced this site and return its
 * `bldg` + `presurvey` for hydration into a new draft. Returns null
 * when no matching report is found (the caller falls back to an
 * empty New Assessment with just the site's name pre-filled).
 *
 * Matching is by site_id stored on the report row. Pre-PR-1 reports
 * don't carry site_id; this returns null for them. Forward-only —
 * we don't try to match by facility name + address.
 */
export function findMostRecentReportForSite(site, reports) {
  if (!site || !site.id || !Array.isArray(reports)) return null
  const matches = reports.filter(r => r && r.site_id === site.id)
  if (matches.length === 0) return null
  // reports come in newest-first order from the index, but defend
  // against unordered input.
  matches.sort((a, b) => {
    const at = a.ts ? new Date(a.ts).getTime() : 0
    const bt = b.ts ? new Date(b.ts).getTime() : 0
    return bt - at
  })
  return matches[0]
}
