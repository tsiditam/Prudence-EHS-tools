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
 *   2. localStorage 'af.kgEvidence' = '1' | '0'
 *   3. default: ON for non-production hosts, OFF for atmosflow.net
 *
 * This means: preview/localhost get it automatically; production hides it by
 * default but the owner can flip it on for a live demo with ?kg=1 (sticky) and
 * off again with ?kg=0 — no redeploy. Every function is pure and injectable so
 * the resolution logic is unit-tested without a browser; all window access is
 * guarded for SSR / privacy-mode where localStorage can throw.
 */

const PROD_HOSTS = new Set(['atmosflow.net', 'www.atmosflow.net'])
export const KG_STORAGE_KEY = 'af.kgEvidence'

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
 * Resolve whether the Knowledge Graph surfaces are enabled.
 *
 * @param {object} [env] Injection seam for tests.
 * @param {string} [env.hostname] defaults to window.location.hostname
 * @param {string} [env.search]   defaults to window.location.search
 * @param {Storage|null} [env.storage] defaults to a guarded window.localStorage
 * @returns {boolean}
 */
export function isKnowledgeGraphEnabled(env = {}) {
  const hostname = env.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const search = env.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()

  // 1. Explicit URL override — persist so it survives navigation within the SPA.
  const fromUrl = readKgParam(search)
  if (fromUrl !== null) {
    try { storage && storage.setItem(KG_STORAGE_KEY, fromUrl ? '1' : '0') } catch { /* ignore */ }
    return fromUrl
  }

  // 2. Persisted override from a prior ?kg= visit.
  try {
    const saved = storage && storage.getItem(KG_STORAGE_KEY)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch {
    /* storage read blocked — fall through to host default */
  }

  // 3. Default: on everywhere except the production host.
  return !isProdHost(hostname)
}
