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
 *
 * Desktop-only surface: the Knowledge Graph is a wide, node-link + evidence-map
 * experience that does not fit a phone viewport, so it ships to DESKTOP only.
 * `isKnowledgeGraphEnabled()` answers the rollout question (host / URL / cohort);
 * the viewport question is a SEPARATE gate, `isDesktopViewport()`, applied at
 * each surface (main.jsx for the /dev preview + KG Preview button; MobileApp's
 * reactive `isDesktop` from useMediaQuery for the in-app Evidence tab). Keeping
 * the two orthogonal means the resolution contract below is unchanged and the
 * desktop breakpoint lives in one shared constant (KG_DESKTOP_MIN_WIDTH).
 *
 * More than one feature is staged the same way (the Knowledge Graph and the
 * mold module), so the resolution ALGORITHM lives once in `resolveStagedFlag()`
 * and each feature is a thin wrapper binding its own URL param + storage keys.
 * There is deliberately no second copy of the host/URL/cohort logic to drift.
 */

const PROD_HOSTS = new Set(['atmosflow.net', 'www.atmosflow.net'])
export const KG_STORAGE_KEY = 'af.kgEvidence'
// Server-driven beta-cohort marker, written by applyKgCohort() at app boot.
// Distinct from KG_STORAGE_KEY so a cohort default never clobbers — nor is
// clobbered by — the user's own explicit ?kg= choice.
export const KG_COHORT_STORAGE_KEY = 'af.kgCohort'

// Mold screening module — staged behind its own keys, resolved by the SAME
// algorithm as the KG flag (resolveStagedFlag). Kept distinct so the two
// features roll out independently.
export const MOLD_STORAGE_KEY = 'af.moldModule'
export const MOLD_COHORT_STORAGE_KEY = 'af.moldCohort'

// AtmosFlow 3.0 Investigation Decision Framework (engine >= 3.0) — staged behind
// its own keys, resolved by the SAME algorithm as the other flags. When ON, NEW
// assessments are stamped with the >= 3.0 engineVersion and dispatch to the
// evidence-based Investigation Decision Framework instead of the 0-100 scoring
// engine (see lib/investigation/engineSelection.ts + dispatch.ts). Historical
// (< 3.0) assessments are unaffected regardless of the flag.
export const INVESTIGATION_STORAGE_KEY = 'af.investigationEngine'
export const INVESTIGATION_COHORT_STORAGE_KEY = 'af.investigationCohort'

/**
 * Minimum viewport width (px) at which the Knowledge Graph surfaces are shown.
 * The KG is a desktop-only experience; below this width the feature stays off
 * regardless of the rollout flag. Matches the `isDesktop` breakpoint used by
 * `useMediaQuery` (src/hooks/useMediaQuery.js) so the module gate and the
 * reactive in-app gate agree.
 */
export const KG_DESKTOP_MIN_WIDTH = 1024

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
 *
 * Current state: LIFTED (`false`) — the staged rollout is active, and every KG
 * surface is additionally gated to DESKTOP viewports (see KG_DESKTOP_MIN_WIDTH
 * and isDesktopViewport). Set back to `true` to take the feature fully dark
 * again on every device.
 */
export const KG_KILL_SWITCH = false

/**
 * Master kill switch for the mold screening module.
 *
 * LIFTED (`false`) — the module has shipped as a labeled **Beta** and is ON
 * everywhere by default, PRODUCTION INCLUDED (resolveMoldFlag passes
 * `defaultOn: true`). Users can still hide it per-browser with `?mold=0`
 * (sticky) / `af.moldModule='0'`. Set this back to `true` to take every mold
 * surface fully dark again on every host.
 */
export const MOLD_KILL_SWITCH = false

/**
 * Master kill switch for the AtmosFlow 3.0 Investigation Decision Framework.
 *
 * Currently `true` — the framework is FOUNDATION + rule engines + routing spine
 * only (lib/investigation/*), with the UI/report renderer for the evidence-based
 * output still to land (migration stages 6–7). While `true`, every host —
 * production AND preview/localhost — keeps stamping NEW assessments with the
 * legacy engine version and running the 0–100 scoring engine, regardless of
 * host, `?ide=`, or localStorage. It overrides all other resolution.
 *
 * Set to `false` only when the v3 result renderer exists, to begin the staged
 * rollout (preview-on, prod-off-by-default with `?ide=1` opt-in). Turning it on
 * NEVER reinterprets historical (< 3.0) assessments — they always route to the
 * legacy engine by their frozen engineVersion.
 */
export const INVESTIGATION_KILL_SWITCH = true

// ── Visible IAQ score / risk band ───────────────────────────────────────────
// Controls whether the composite IAQ score (0–100) and the risk band
// (Low / Moderate / High / Critical) are SHOWN to users, in the app result
// surfaces and in generated reports. The scoring ENGINE is unaffected — it
// still computes internally so findings, severity colouring, sorting, and
// recommendations keep working; this flag governs display only.
export const IAQ_SCORE_STORAGE_KEY = 'af.iaqScore'

/**
 * Default visibility of the IAQ composite score + risk band.
 *
 * `false` — the scoring feature is HIDDEN everywhere by default. Findings,
 * recommendations, evidence and confidence still render; only the 0–100 number
 * and the Low/Moderate/High/Critical grade are suppressed. This is a display
 * decision, fully reversible: flip this constant to `true` to restore the score
 * globally, or use `?score=1` (sticky per-browser) to show it for a demo and
 * `?score=0` to hide it again — no redeploy.
 */
export const IAQ_SCORE_VISIBLE_DEFAULT = false

/**
 * Whether the IAQ composite score + risk band should be displayed. Resolution:
 *   1. URL ?score=1/0 → persisted, then applied
 *   2. localStorage 'af.iaqScore' = '1' | '0'
 *   3. default: IAQ_SCORE_VISIBLE_DEFAULT (hidden)
 * Pure + injectable; every storage access guarded for SSR / privacy-mode.
 * @param {object} [env] { search?, storage? } injection seam for tests.
 * @returns {boolean}
 */
export function isIaqScoreVisible(env = {}) {
  const search = env.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()
  const fromUrl = readFlagParam(search, 'score')
  if (fromUrl !== null) {
    try { storage && storage.setItem(IAQ_SCORE_STORAGE_KEY, fromUrl ? '1' : '0') } catch { /* ignore */ }
    return fromUrl
  }
  try {
    const saved = storage && storage.getItem(IAQ_SCORE_STORAGE_KEY)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch { /* storage blocked — fall through to default */ }
  return IAQ_SCORE_VISIBLE_DEFAULT
}

/** True when the host is the live production domain. */
export function isProdHost(hostname) {
  return PROD_HOSTS.has(String(hostname || '').toLowerCase())
}

/**
 * True when the current viewport is desktop-width (>= KG_DESKTOP_MIN_WIDTH).
 *
 * The Knowledge Graph is a desktop-only surface. This is the VIEWPORT gate, kept
 * separate from the rollout flag (isKnowledgeGraphEnabled) so the two compose:
 * a surface shows only when the feature is rolled out AND the viewport qualifies.
 * Pure and injectable for tests; guarded so a missing `window` (SSR) reads as
 * not-desktop rather than throwing.
 *
 * @param {object} [env] Injection seam for tests.
 * @param {number} [env.width] defaults to window.innerWidth (0 when no window).
 * @returns {boolean}
 */
export function isDesktopViewport(env = {}) {
  const width = env.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0)
  return Number(width) >= KG_DESKTOP_MIN_WIDTH
}

function safeLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null // privacy mode / disabled storage
  }
}

/**
 * Read a boolean flag override from a query string
 * (`?<name>=1|0|on|off|true|false`). Shared by every staged feature so the URL
 * grammar is identical across flags.
 * @returns {boolean|null} null when absent / malformed.
 */
function readFlagParam(search, name) {
  if (!search) return null
  try {
    const v = new URLSearchParams(search).get(name)
    if (v === '1' || v === 'on' || v === 'true') return true
    if (v === '0' || v === 'off' || v === 'false') return false
  } catch {
    /* malformed query string — ignore */
  }
  return null
}

/**
 * The ONE staged-rollout resolution algorithm, shared by every feature flag
 * (Knowledge Graph, mold, …) so there is never a second copy to drift.
 *
 * Order (first decisive rule wins):
 *   1. URL ?<param>=1/0 → persisted to `storageKey`, then applied
 *   2. localStorage[storageKey] = '1' | '0'  (the user's explicit choice)
 *   3. localStorage[cohortKey]  = '1'         (server-driven beta cohort)
 *   4. default: ON for non-production hosts, OFF for atmosflow.net
 *
 * Pure + injectable; every storage access guarded for SSR / privacy-mode.
 *
 * @param {object} env  { hostname?, search?, storage? } injection seam for tests
 * @param {{ param: string, storageKey: string, cohortKey: string }} keys
 * @returns {boolean}
 */
export function resolveStagedFlag(env, keys) {
  const hostname = env.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  const search = env.search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()

  // 1. Explicit URL override — persist so it survives navigation within the SPA.
  const fromUrl = readFlagParam(search, keys.param)
  if (fromUrl !== null) {
    try { storage && storage.setItem(keys.storageKey, fromUrl ? '1' : '0') } catch { /* ignore */ }
    return fromUrl
  }
  // 2. Persisted override from a prior ?<param>= visit — the user's explicit
  //    choice, which beats the server-driven cohort default below.
  try {
    const saved = storage && storage.getItem(keys.storageKey)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch {
    /* storage read blocked — fall through to cohort / host default */
  }
  // 3. Server-driven beta cohort. Enable-only: '1' turns the feature on
  //    (production included); any other value / absence falls through.
  try {
    if (storage && storage.getItem(keys.cohortKey) === '1') return true
  } catch {
    /* storage read blocked — fall through to host default */
  }
  // 4. Default. Most staged features are on everywhere EXCEPT production (so a
  //    merge never exposes them live). A feature that has shipped can opt into
  //    being on everywhere — production included — with `defaultOn: true`; the
  //    explicit URL / storage opt-out in steps 1–2 still turns it off per user.
  if (keys.defaultOn) return true
  return !isProdHost(hostname)
}

/**
 * Mark (or unmark) the current browser as part of a feature's beta cohort by
 * writing its `cohortKey`. Enable-only and never touches the user's explicit
 * `storageKey` choice, so it can neither override nor be overridden by a
 * `?<param>=` opt-out. Guarded no-op when storage is unavailable; returns the
 * boolean it applied (for tests / call-site logging).
 *
 * @param {boolean} enabled
 * @param {string}  cohortKey
 * @param {object}  [env]  injection seam ({ storage? })
 * @returns {boolean}
 */
export function applyCohort(enabled, cohortKey, env = {}) {
  const storage = env.storage !== undefined ? env.storage : safeLocalStorage()
  const on = enabled === true
  try {
    if (!storage) return on
    if (on) storage.setItem(cohortKey, '1')
    else storage.removeItem(cohortKey)
  } catch {
    /* storage blocked — cohort marker simply won't persist this session */
  }
  return on
}

// ── Knowledge Graph flag (thin wrapper over the shared resolver) ────────────

/**
 * Whether the Knowledge Graph surfaces are enabled. The kill switch wins over
 * everything; otherwise this delegates to host/URL/localStorage resolution.
 * Call sites (main.jsx, MobileApp.jsx) use this.
 * @param {object} [env] Injection seam for tests (see resolveStagedFlag).
 * @returns {boolean}
 */
export function isKnowledgeGraphEnabled(env = {}) {
  if (KG_KILL_SWITCH) return false
  return resolveKgFlag(env)
}

/**
 * Pure KG resolution (host default + sticky URL/localStorage overrides),
 * ignoring the kill switch. Exposed for tests and for any surface that wants the
 * "would this be on if not killed?" answer.
 * @param {object} [env] Injection seam for tests.
 * @returns {boolean}
 */
export function resolveKgFlag(env = {}) {
  return resolveStagedFlag(env, { param: 'kg', storageKey: KG_STORAGE_KEY, cohortKey: KG_COHORT_STORAGE_KEY })
}

/**
 * Mark (or unmark) the current browser as part of the KG beta cohort. Called at
 * app boot from the authenticated user's profile (writes `af.kgCohort`).
 * @param {boolean} enabled
 * @param {object}  [env] injection seam for tests
 * @returns {boolean}
 */
export function applyKgCohort(enabled, env = {}) {
  return applyCohort(enabled, KG_COHORT_STORAGE_KEY, env)
}

// ── Mold module flag (staged dark; same resolver, own keys) ─────────────────

/**
 * Whether the mold screening module is enabled. The module is FOUNDATION-only
 * today (engine + intake + standards, no UI wiring), so MOLD_KILL_SWITCH starts
 * `true` and this returns false everywhere. When the mold mode UI + report land,
 * flip the switch to resume the staged rollout.
 * @param {object} [env] Injection seam for tests (see resolveStagedFlag).
 * @returns {boolean}
 */
export function isMoldModuleEnabled(env = {}) {
  if (MOLD_KILL_SWITCH) return false
  return resolveMoldFlag(env)
}

/**
 * Pure mold resolution (ignores the kill switch). Exposed for tests and for the
 * future mode-selection surface.
 * @param {object} [env] Injection seam for tests.
 * @returns {boolean}
 */
export function resolveMoldFlag(env = {}) {
  // Mold has shipped as a labeled Beta, so it is ON everywhere by default —
  // production included (defaultOn) — while `?mold=0` / af.moldModule='0' still
  // lets a user hide it, and MOLD_KILL_SWITCH still turns it fully off.
  return resolveStagedFlag(env, { param: 'mold', storageKey: MOLD_STORAGE_KEY, cohortKey: MOLD_COHORT_STORAGE_KEY, defaultOn: true })
}

/**
 * Mark (or unmark) the current browser as part of the mold beta cohort
 * (writes `af.moldCohort`).
 * @param {boolean} enabled
 * @param {object}  [env] injection seam for tests
 * @returns {boolean}
 */
export function applyMoldCohort(enabled, env = {}) {
  return applyCohort(enabled, MOLD_COHORT_STORAGE_KEY, env)
}

// ── Investigation Decision Framework flag (staged dark; same resolver) ───────

/**
 * Whether the AtmosFlow 3.0 Investigation Decision Framework is enabled for NEW
 * assessments. The kill switch wins over everything; while it is `true` this
 * returns false everywhere and new assessments stay on the legacy engine.
 * @param {object} [env] Injection seam for tests (see resolveStagedFlag).
 * @returns {boolean}
 */
export function isInvestigationFrameworkEnabled(env = {}) {
  if (INVESTIGATION_KILL_SWITCH) return false
  return resolveInvestigationFrameworkFlag(env)
}

/**
 * Pure Investigation-framework resolution (ignores the kill switch). Exposed for
 * tests and for the future rollout. Default is preview-on / production-off (no
 * `defaultOn`), matching the KG staging posture.
 * @param {object} [env] Injection seam for tests.
 * @returns {boolean}
 */
export function resolveInvestigationFrameworkFlag(env = {}) {
  return resolveStagedFlag(env, {
    param: 'ide',
    storageKey: INVESTIGATION_STORAGE_KEY,
    cohortKey: INVESTIGATION_COHORT_STORAGE_KEY,
  })
}

/**
 * Mark (or unmark) the current browser as part of the Investigation-framework
 * beta cohort (writes `af.investigationCohort`).
 * @param {boolean} enabled
 * @param {object}  [env] injection seam for tests
 * @returns {boolean}
 */
export function applyInvestigationCohort(enabled, env = {}) {
  return applyCohort(enabled, INVESTIGATION_COHORT_STORAGE_KEY, env)
}
