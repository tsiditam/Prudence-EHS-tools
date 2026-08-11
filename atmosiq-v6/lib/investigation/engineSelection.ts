/**
 * AtmosFlow 3.0 — engine-version selection for NEW assessments (Phase 3).
 *
 * A new assessment is stamped with an engineVersion at creation time; that
 * version is frozen and drives dispatch forever after. This resolver decides
 * which version a new assessment gets, gated by the (staged-dark) feature flag.
 * Pure and injectable so the decision is unit-tested without app wiring.
 *
 * Default posture: frameworkEnabled=false → the legacy version. Production is
 * unchanged until the flag is deliberately turned on.
 */

import { INVESTIGATION_ENGINE_VERSION } from './version'

export interface EngineSelectionOptions {
  /** From src/utils/featureFlags.js isInvestigationFrameworkEnabled(). */
  frameworkEnabled: boolean
  /** The current legacy engine version (from src/version.js ENGINE_VERSION). */
  legacyVersion: string
  /** Override the framework version stamp; defaults to INVESTIGATION_ENGINE_VERSION. */
  frameworkVersion?: string
}

export function resolveEngineVersionForNewAssessment(opts: EngineSelectionOptions): string {
  if (opts.frameworkEnabled) {
    return opts.frameworkVersion ?? INVESTIGATION_ENGINE_VERSION
  }
  return opts.legacyVersion
}
