/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Feature flags — single source of truth for staged feature gating.
 *
 * Knowledge Graph surfaces (Evidence Map result tab §13, the node-link graph
 * §14, the /dev preview + KG Preview button, and the report traceability
 * matrix §17) are staged behind ONE flag, `isKnowledgeGraphEnabled()`, so the
 * work ships to preview builds and can be demoed on demand while staying OFF
 * on the production host until the PR is reviewed and merged.
 *
 * Resolution order (first decisive rule wins):
 *   1. URL  ?kg=1 / ?kg=0  → persisted to localStorage, then applied
 *   2. localStorage 'af.kgEvidence' = '1' | '0'  (the user's explicit choice)
 *   3. localStorage 'af.kgCohort' = '1'          (server-driven beta cohort)
 *   4. default: ON for non-production hosts, OFF for atmosflow.net
 *
 * This means: preview/localhost get it automatically; production hides it by
 * default but the owner can flip it on for a live demo with ?kg=1 (sticky) and
 * off again with ?kg=0 — no redeploy. Every function is pure and injectable so
 * the resolution logic is unit-tested without a browser; all window access is
 * guarded for SSR / privacy-mode where localStorage can throw.
 *
 * Cohort rollout (Phase 0): `applyKgCohort(enabled)` lets the app boot mark a
 * user as part of the KG beta cohort (from their profile) by writing the
 * `af.kgCohort` key. That key ENABLES the KG on production for that user
 * WITHOUT a redeploy and without them typing ?kg=1 — but it never overrides an
 * explicit user choice (a prior ?kg=0 / persisted 'af.kgEvidence=0' still wins),
 * and it is enable-only (it can turn the feature ON for a cohort member, never
 * force it OFF for a non-member — non-members simply fall through to the host
 * default). The master KG_KILL_SWITCH still overrides everything.
 */

const PROD_HOSTS = new Set(['atmosflow.net', 'www.atmosflow.net'])
export const KG_STORAGE_KEY = 'af.kgEvidence'
// Server-driven beta-cohort marker, written by applyKgCohort() at app boot.
// Distinct from KG_STORAGE_KEY so a cohort default never clobbers — nor is
// clobbered by — the user's own explicit ?kg= choice.
export const KG_COHORT_STORAGE_KEY = 'af.kgCohort'

/**
 * Master kill switch for the Knowledge Graph.
 *
 * While `true`, EVERY KG surface (the Evidence result tab, the node-link
 * graph, the /dev preview, the KG Preview button) is OFF everywhere —
 * production AND preview/localhost — regardless of host, `?kg=`, or
 * localStorage. It overrides all other resolution.
 *
 * Set to `false` to resume the staged rollout (preview-on, prod-off-by-
 * default with `?kg=1` opt-in). This single boolean is the unambiguous
 * "turn it all off" control; nothing else needs to change to disable or
 * re-enable the feature.
 */
export const KG_KILL_SWITCH = true

/** True when the host is the live production domain. */
export function isProdHost(hostname) {
  return PROD_HOSTS.has(String(hostname || '').toLowerCase())
}

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null // privacy mode / disabled storage
  }
}

function readKgParam(search) {
  if (!search) return null
  try {
    const v = new URLSearchParams(search).get('kg')
    if (v === '1' || v === 'on' || v === 'true') return true
    if (v === '0' || v === 'off' || v === 'false') return false
  } catch {
    /* malformed query string — ignore */
  }
  return null
}

/**
 * Whether the Knowledge Graph surfaces are enabled. The kill switch wins over
 * everything; otherwise this delegates to host/URL/localStorage resolution.
 * Call sites (main.jsx, MobileApp.jsx) use this.
 * @param {object} [env] Injection seam for tests (see resolveKgFlag).
 * @returns {boolean}
 */
export function isKnowledgeGraphEnabled(env = {}) {
  if (KG_KILL_SWITCH) return false
  return resolveKgFlag(env)
}

/**
 * Pure resolution (host default + sticky URL/localStorage overrides), ignoring
 * the kill switch. Exposed for tests and for any future surface that wants the
 * "would this be on if not killed?" answer.
 *
 * @param {object} [env] Injection seam for tests.
 * @param {string} [env.hostname] defaults to window.location.hostname
 * @param {string} [env.search]   defaults to window.location.search
 * @param {Storage|null} [env.storage] defaults to a guarded window.localStorage
 * @returns {boolean}
 */
export function resolveKgFlag(env = {}) {
  const hostname = env.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const search = env.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()

  // 1. Explicit URL override — persist so it survives navigation within the SPA.
  const fromUrl = readKgParam(search)
  if (fromUrl !== null) {
    try { storage && storage.setItem(KG_STORAGE_KEY, fromUrl ? '1' : '0') } catch { /* ignore */ }
    return fromUrl
  }

  // 2. Persisted override from a prior ?kg= visit — the user's explicit choice,
  //    which beats the server-driven cohort default below.
  try {
    const saved = storage && storage.getItem(KG_STORAGE_KEY)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch {
    /* storage read blocked — fall through to cohort / host default */
  }

  // 3. Server-driven beta cohort (written by applyKgCohort at boot). Enable-only:
  //    '1' turns the KG on (including on production) for a cohort member; any
  //    other value / absence falls through to the host default.
  try {
    if (storage && storage.getItem(KG_COHORT_STORAGE_KEY) === '1') return true
  } catch {
    /* storage read blocked — fall through to host default */
  }

  // 4. Default: on everywhere except the production host.
  return !isProdHost(hostname)
}

/**
 * Mark (or unmark) the current browser as part of the KG beta cohort.
 *
 * Called at app boot from the authenticated user's profile: when the profile
 * opts the user into the KG beta, pass `true` and the `af.kgCohort` key is
 * written so `resolveKgFlag` enables the KG on the NEXT load (same sticky model
 * as ?kg=1). Pass `false` to clear the marker. It never touches KG_STORAGE_KEY,
 * so it can neither override nor be overridden by the user's own ?kg= choice.
 *
 * Pure and guarded like the rest of this module; a blocked/absent storage is a
 * silent no-op. Returns the boolean it applied (for tests / call-site logging).
 *
 * @param {boolean} enabled  whether the user is in the KG beta cohort
 * @param {object}  [env]    injection seam for tests
 * @param {Storage|null} [env.storage] defaults to a guarded window.localStorage
 * @returns {boolean}
 */
export function applyKgCohort(enabled, env = {}) {
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()
  const on = enabled === true
  try {
    if (!storage) return on
    if (on) storage.setItem(KG_COHORT_STORAGE_KEY, '1')
    else storage.removeItem(KG_COHORT_STORAGE_KEY)
  } catch {
    /* storage blocked — cohort marker simply won't persist this session */
  }
  return on
}
