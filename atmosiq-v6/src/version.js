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

export const APP_VERSION = '6.0.0-beta'
export const ENGINE_VERSION = '2.7.0'
export const STANDARDS_MANIFEST_DATE = '2026-04-25'

// Tagged form retained for backward compat with consumers that store
// the prefixed string in report metadata (src/engine/report/internal.ts,
// src/engine/report/pre-assessment-memo.ts).
export const ENGINE_VERSION_TAG = `atmosflow-engine-${ENGINE_VERSION}`

// Display form rendered by the SPA footer + settings chip + report cover.
// Format preserved from the legacy `VER` constant so UI rendering does
// not shift visually (only the embedded engine version updates).
export const VER = `${APP_VERSION} (Engine v${ENGINE_VERSION})`
