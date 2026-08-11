/**
 * AtmosFlow 3.0 — version-routed assessment dispatch (Phase 3).
 *
 * This is the seam that decides, per assessment, whether the legacy scoring
 * engine or the Investigation Decision Framework runs — keyed off the
 * assessment's frozen engineVersion. It is dependency-injected: the caller
 * supplies the legacy path as a thunk, so this module (and all of lib/) never
 * imports src/engines/scoring.js. That keeps the sacred engine untouched and
 * the two engines fully decoupled.
 *
 * Production safety: nothing here changes behaviour on its own. Whether NEW
 * assessments get a >= 3.0 engineVersion is decided by the feature flag in
 * src/utils/featureFlags.js (staged dark) via resolveEngineVersionForNewAssessment
 * in engineSelection.ts. With the flag off, every assessment carries a < 3.0
 * version and dispatches to the legacy thunk — identical to today.
 */

import { BuildingInvestigation, assessBuildingV3 } from './assess'
import { InvestigationContext, ZoneObservation } from './rules/common'
import { isLegacyEngine } from './version'

export interface LegacyDispatchResult<TLegacy> {
  kind: 'legacy'
  engineVersion: string
  result: TLegacy
}

export interface InvestigationDispatchResult {
  kind: 'investigation'
  engineVersion: string
  building: BuildingInvestigation
}

export type AssessmentDispatchResult<TLegacy> =
  | LegacyDispatchResult<TLegacy>
  | InvestigationDispatchResult

/**
 * Pure router. Runs exactly one of the two supplied thunks based on the
 * assessment's engineVersion, and never both. Unknown/unparseable versions
 * fail safe to legacy (see isLegacyEngine).
 */
export function dispatchAssessment<TLegacy>(
  engineVersion: string | number | null | undefined,
  handlers: {
    legacy: () => TLegacy
    investigation: () => BuildingInvestigation
  },
): AssessmentDispatchResult<TLegacy> {
  const version = String(engineVersion ?? '')
  if (isLegacyEngine(engineVersion)) {
    return { kind: 'legacy', engineVersion: version, result: handlers.legacy() }
  }
  return { kind: 'investigation', engineVersion: version, building: handlers.investigation() }
}

/**
 * Convenience wrapper that supplies the framework side (assessBuildingV3) and
 * takes only the legacy thunk from the caller. The caller (e.g. MobileApp)
 * closes over the legacy scoreZone/compositeScore call in its own thunk.
 */
export function assessWithRouting<TLegacy>(
  engineVersion: string | number | null | undefined,
  zones: ZoneObservation[],
  ctx: InvestigationContext,
  legacyThunk: () => TLegacy,
): AssessmentDispatchResult<TLegacy> {
  const version = String(engineVersion ?? '')
  return dispatchAssessment(engineVersion, {
    legacy: legacyThunk,
    investigation: () => assessBuildingV3(zones, { ...ctx, engineVersion: version }),
  })
}
