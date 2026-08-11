/**
 * AtmosFlow 3.0 — Engine version routing (Phases 2 & 35).
 *
 * Historical assessments MUST remain reproducible. Routing is decided by the
 * assessment's OWN frozen engineVersion, never by the current app version:
 *
 *   assessment.engineVersion  < 3.0  → legacy scoring engine (src/engines/*)
 *   assessment.engineVersion >= 3.0  → Investigation Decision Framework
 *
 * This module contains only the pure routing predicate. It imports nothing
 * from the legacy engine so that adding the framework never pulls legacy
 * scoring into the v3 type graph. The actual dispatch site (MobileApp /
 * report pipeline) calls isLegacyEngine() and picks the code path; the legacy
 * engine is preserved and moved only into a clearly named module, never
 * deleted while any historical assessment depends on it.
 */

/** The Investigation Decision Framework's own semantic version. */
export const INVESTIGATION_ENGINE_VERSION = '3.0.0-alpha'

/** First engine major version that uses the Investigation Decision Framework. */
export const FRAMEWORK_MAJOR = 3

/** Parse a semver-ish "2.9.0" / "3.0.0-alpha" into a major integer. */
export function parseMajor(version: string | number | null | undefined): number {
  if (version == null) return NaN
  const s = String(version).trim()
  const m = s.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : NaN
}

/**
 * True when an assessment's frozen engineVersion predates the framework and
 * must be routed to the legacy scoring engine. Unknown/unparseable versions
 * are treated as legacy (fail-safe: never silently reinterpret an assessment
 * with the new framework).
 */
export function isLegacyEngine(assessmentEngineVersion: string | number | null | undefined): boolean {
  const major = parseMajor(assessmentEngineVersion)
  if (Number.isNaN(major)) return true
  return major < FRAMEWORK_MAJOR
}

/** True when an assessment should be rendered with the Investigation Decision Framework. */
export function usesInvestigationFramework(
  assessmentEngineVersion: string | number | null | undefined,
): boolean {
  return !isLegacyEngine(assessmentEngineVersion)
}

export type EngineRoute = 'legacy_scoring' | 'investigation_framework'

export function routeForEngineVersion(
  assessmentEngineVersion: string | number | null | undefined,
): EngineRoute {
  return isLegacyEngine(assessmentEngineVersion) ? 'legacy_scoring' : 'investigation_framework'
}
