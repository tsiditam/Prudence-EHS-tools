/**
 * AtmosFlow 3.0 — persistence contract for the Investigation Decision Framework
 * (Phase 28).
 *
 * Defines the exact shape stored in the assessments.investigation jsonb column
 * (migration 029) and the pure serialize/deserialize round-trip. Keeping this
 * in one typed place means the DB shape has a single source of truth and a
 * round-trip drift guard (tests/lib/investigation-persistence.test.ts).
 *
 * The serialized form is pure JSON (no functions, no class instances), so it
 * survives a jsonb round-trip losslessly. engineVersion is carried on the
 * record so a reader can route/interpret without a second lookup, and is the
 * value written to the immutable assessments.engine_version column.
 */

import { BuildingInvestigation } from './assess'

/** Bump when the persisted shape changes in a non-backward-compatible way. */
export const INVESTIGATION_RECORD_SCHEMA_VERSION = 1

export interface InvestigationRecord {
  schemaVersion: number
  engineVersion: string
  /** ISO timestamp; injected by the caller (no Date use here for determinism). */
  serializedAt?: string
  building: BuildingInvestigation
}

/** Columns written to public.assessments for a v3 assessment. */
export interface AssessmentInvestigationColumns {
  engine_version: string
  investigation: InvestigationRecord
  standards_manifest?: unknown
}

/** Deep-clone through JSON to guarantee a pure, jsonb-safe payload. */
function pureClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function serializeInvestigation(
  building: BuildingInvestigation,
  opts: { serializedAt?: string } = {},
): InvestigationRecord {
  return {
    schemaVersion: INVESTIGATION_RECORD_SCHEMA_VERSION,
    engineVersion: building.engineVersion,
    serializedAt: opts.serializedAt,
    building: pureClone(building),
  }
}

export function isInvestigationRecord(x: unknown): x is InvestigationRecord {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.schemaVersion === 'number' &&
    typeof r.engineVersion === 'string' &&
    !!r.building &&
    typeof r.building === 'object'
  )
}

export function deserializeInvestigation(record: unknown): BuildingInvestigation {
  if (!isInvestigationRecord(record)) {
    throw new Error('Not a valid InvestigationRecord')
  }
  if (record.schemaVersion > INVESTIGATION_RECORD_SCHEMA_VERSION) {
    throw new Error(
      `InvestigationRecord schemaVersion ${record.schemaVersion} is newer than supported (${INVESTIGATION_RECORD_SCHEMA_VERSION})`,
    )
  }
  return record.building
}

/**
 * Map a framework result to the assessment columns written by the persistence
 * layer. The write-path (supabaseStorage) will call this only for engine >= 3.0
 * assessments; legacy assessments continue writing score/risk/composite as
 * today and leave these columns null.
 */
export function toInvestigationColumns(
  building: BuildingInvestigation,
  opts: { serializedAt?: string; standardsManifest?: unknown } = {},
): AssessmentInvestigationColumns {
  return {
    engine_version: building.engineVersion,
    investigation: serializeInvestigation(building, { serializedAt: opts.serializedAt }),
    standards_manifest: opts.standardsManifest,
  }
}
