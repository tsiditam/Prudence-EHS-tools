/**
 * AtmosFlow — single source of truth for version metadata.
 *
 * Three concepts kept distinct (per CLAUDE.md "Engine version conventions"):
 *
 *   APP_VERSION             — the user-facing client build label.
 *                             May include pre-release suffix (e.g. "-beta").
 *   ENGINE_VERSION          — scoring + report-rendering methodology engine,
 *                             semantic version. Bump on any change to
 *                             scoring contracts, citation handling, finding
 *                             generation, or report-finalization gating.
 *   STANDARDS_MANIFEST_DATE — bibliography snapshot date. Bump when the
 *                             standards bibliography changes.
 *
 * When bumping ENGINE_VERSION, also:
 *   - update the engine-2.X-acceptance tests if they pin the previous
 *     version
 *   - document the bump in the commit subject ("feat(engine): v2.7.0 …")
 *
 * APP_VERSION intentionally diverges from package.json#version
 * ("6.0.0"). The npm-formal version is for tooling; the user-facing
 * label includes the pre-release suffix. Keep both in step on shipped
 * builds: bump package.json and APP_VERSION together.
 */

/* global __BUILD_SHA__ */
// Short git SHA of the deployed build, injected by Vite at build time
// (see vite.config.js `define`). Lets the running client be matched to
// an exact commit — handy when a PWA is serving a stale bundle. Falls
// back to 'dev' when the define is absent (e.g. unit tests).
export const BUILD_SHA = (typeof __BUILD_SHA__ !== 'undefined' && __BUILD_SHA__) || 'dev'

export const APP_VERSION = '6.0.0-beta'
// 2.9.0 — report-issuance gating changed: a fired data-gap trigger now
// issues the FULL report carrying a prominent limitation-on-reliance
// warning, instead of substituting a Pre-Assessment Memo. Bumped per the
// "report-finalization gating" rule above; scoring, thresholds and
// contracts are unchanged.
export const ENGINE_VERSION = '2.9.0'
export const STANDARDS_MANIFEST_DATE = '2026-04-25'

// Mold screening engine (src/engines/mold/*) — versioned INDEPENDENTLY of the
// IAQ ENGINE_VERSION above. The mold module is a parallel, deterministic
// screening path (IICRC S520 water-damage Category + remediation Condition,
// comparative indoor/outdoor spore screening); it never shares scoring code
// with the IAQ engine, so it carries its own semantic version. Bump on any
// change to mold classification logic, thresholds, or the assessMold() result
// shape. 0.x while the module is staged dark behind MOLD_KILL_SWITCH.
export const MOLD_ENGINE_VERSION = '0.1.0'
export const MOLD_ENGINE_VERSION_TAG = `atmosflow-mold-${MOLD_ENGINE_VERSION}`

// Tagged form retained for backward compat with consumers that store
// the prefixed string in report metadata (src/engine/report/internal.ts,
// src/engine/report/pre-assessment-memo.ts).
export const ENGINE_VERSION_TAG = `atmosflow-engine-${ENGINE_VERSION}`

// Display form rendered by the SPA footer + settings chip + report cover.
// Format preserved from the legacy `VER` constant so UI rendering does
// not shift visually (only the embedded engine version updates).
export const VER = `${APP_VERSION} (Engine v${ENGINE_VERSION})`
