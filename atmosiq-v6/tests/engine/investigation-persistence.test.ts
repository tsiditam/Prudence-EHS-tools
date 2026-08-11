/**
 * AtmosFlow 3.0 — persistence round-trip (Phase 28).
 *
 * Serializes a real BuildingInvestigation (the Meridian demo), round-trips it
 * through JSON (simulating the assessments.investigation jsonb column), and
 * asserts the deserialized result is identical — so the DB shape can't silently
 * drop findings/hypotheses/actions/summary.
 */

import { describe, it, expect } from 'vitest'
import { assessBuildingV3 } from '../../lib/investigation/assess'
import {
  serializeInvestigation,
  deserializeInvestigation,
  toInvestigationColumns,
  isInvestigationRecord,
  INVESTIGATION_RECORD_SCHEMA_VERSION,
} from '../../lib/investigation/persistence'
// eslint-disable-next-line import/extensions
import { DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData'

const CTX = {
  engineVersion: '3.0.0-alpha',
  now: '2026-08-11T00:00:00Z',
  calibrationStatus: 'current' as const,
  occupancyDocumented: false,
}
const zones = (DEMO_ZONES as any[]).map((z) => ({ ...(DEMO_BUILDING as any), ...z }))

describe('investigation persistence round-trip', () => {
  const building = assessBuildingV3(zones, CTX)

  it('serializes to a pure-JSON record and round-trips losslessly through jsonb', () => {
    const record = serializeInvestigation(building, { serializedAt: '2026-08-11T00:00:00Z' })
    expect(record.schemaVersion).toBe(INVESTIGATION_RECORD_SCHEMA_VERSION)
    expect(record.engineVersion).toBe('3.0.0-alpha')
    // Simulate the DB jsonb round-trip.
    const throughDb = JSON.parse(JSON.stringify(record))
    expect(isInvestigationRecord(throughDb)).toBe(true)
    const restored = deserializeInvestigation(throughDb)
    // Deep equality with the original building — nothing dropped.
    expect(restored).toEqual(building)
    expect(restored.zones.length).toBe(building.zones.length)
    expect(restored.summary).toEqual(building.summary)
  })

  it('maps to the assessment columns written for a v3 assessment', () => {
    const cols = toInvestigationColumns(building, { standardsManifest: { 'ASHRAE 62.1': '2025' } })
    expect(cols.engine_version).toBe('3.0.0-alpha')
    expect(cols.investigation.building.summary).toEqual(building.summary)
    expect(cols.standards_manifest).toEqual({ 'ASHRAE 62.1': '2025' })
  })

  it('rejects a non-record and a future schema version', () => {
    expect(() => deserializeInvestigation({ nope: true })).toThrow()
    expect(() =>
      deserializeInvestigation({ schemaVersion: 999, engineVersion: '9', building: {} }),
    ).toThrow(/newer than supported/)
  })
})
