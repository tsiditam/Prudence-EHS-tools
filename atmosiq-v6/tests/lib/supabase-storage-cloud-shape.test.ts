/**
 * supabaseStorage seam: cloud row → app shape normalization.
 *
 * Pins the contract that a report PULLED DOWN from the cloud comes back in
 * the same camelCase shape the in-app report view reads. The `assessments`
 * table stores snake_case columns (zone_scores, composite, recommendations,
 * sampling_plan, causal_chains, osha_evals); without mapping these back,
 * openReport sees `zoneScores === undefined`, renderResults bails on
 * `!zoneScores.length`, and the report view renders nothing (dead tap).
 */
import { describe, it, expect } from 'vitest'
import Storage, {
  fromCloudRow,
  toPayload,
  toAssessmentRow,
  toProfileRow,
  engineMajor,
  isCensus,
  missingColumnName,
  deriveProfileName,
  indexEntryFromRow,
} from '../../src/utils/supabaseStorage.js'

function cloudRow() {
  return {
    id: 'A-1',
    user_id: 'u-1',
    status: 'complete',
    facility_name: 'One Lonely Plaza',
    facility_address: '1 Plaza Way',
    presurvey: { ps_recipient_name: 'Jane' },
    building: { fn: 'One Lonely Plaza' },
    zones: [{ zn: 'Zone A' }],
    photos: { 'z0-dp': [{ src: 'data:image/png;base64,AAAA', ts: '2026-05-27T10:00:00Z' }] },
    zone_scores: [{ zn: 'Zone A', tot: 62 }],
    composite: { tot: 62, risk: 'MODERATE' },
    osha_evals: [{ id: 'co2' }],
    recommendations: [{ id: 'r1' }],
    sampling_plan: { points: 3 },
    causal_chains: [{ id: 'c1' }],
    narrative: { summary: 'x' },
    score: 62,
    risk: 'MODERATE',
    updated_at: '2026-05-27T10:00:00Z',
  }
}

describe('fromCloudRow — cloud snake_case → app camelCase', () => {
  it('remaps the snake_case report columns so the report view can render', () => {
    const out = fromCloudRow(cloudRow())
    // The fields renderResults gates on / openReport reads:
    expect(out.zoneScores).toEqual([{ zn: 'Zone A', tot: 62 }])
    expect(out.zoneScores.length).toBeGreaterThan(0)
    expect(out.comp).toEqual({ tot: 62, risk: 'MODERATE' })
    expect(out.composite).toEqual({ tot: 62, risk: 'MODERATE' })
    expect(out.oshaEvals).toEqual([{ id: 'co2' }])
    expect(out.recs).toEqual([{ id: 'r1' }])
    expect(out.samplingPlan).toEqual({ points: 3 })
    expect(out.causalChains).toEqual([{ id: 'c1' }])
  })

  it('passes through fields that already share the app key', () => {
    const out = fromCloudRow(cloudRow())
    expect(out.id).toBe('A-1')
    expect(out.status).toBe('complete')
    expect(out.presurvey).toEqual({ ps_recipient_name: 'Jane' })
    expect(out.building).toEqual({ fn: 'One Lonely Plaza' })
    expect(out.zones).toEqual([{ zn: 'Zone A' }])
    expect(out.narrative).toEqual({ summary: 'x' })
    expect(out.ts).toBe('2026-05-27T10:00:00Z')
  })

  it('only emits cloud-backed keys, so spreading over a local copy keeps local-only fields', () => {
    const norm = fromCloudRow(cloudRow())
    expect('equipment' in norm).toBe(false)
    expect('floorPlan' in norm).toBe(false)
    const existingLocal = { id: 'A-1', equipment: [{ id: 'ahu-1' }], floorPlan: { url: 'x' } }
    const merged = { ...existingLocal, ...norm }
    expect(merged.equipment).toEqual([{ id: 'ahu-1' }])
    expect(merged.floorPlan).toEqual({ url: 'x' })
    expect(merged.zoneScores.length).toBe(1)
  })

  it('defaults missing collections so consumers never read undefined', () => {
    const out = fromCloudRow({ id: 'B-2', status: 'complete' })
    expect(out.zoneScores).toEqual([])
    expect(out.causalChains).toEqual([])
    expect(out.comp).toBeNull()
    expect(out.recs).toBeNull()
  })

  it('returns the input unchanged when it is not an object', () => {
    expect(fromCloudRow(null)).toBeNull()
    expect(fromCloudRow(undefined)).toBeUndefined()
  })
})

describe('toPayload — app-shape snapshot for the cloud payload column', () => {
  it('keeps every field except photos (which have their own column)', () => {
    const assessment = {
      id: 'A-1', status: 'complete',
      building: { fn: 'X' }, zones: [{ zn: 'Z' }],
      equipment: [{ id: 'ahu-1' }], floorPlan: { url: 'fp' },
      sensorData: { co2: 600 }, labResults: { rows: 2 },
      standardsManifest: { v: '2026-05' }, ver: '6.0.0',
      photos: { 'z0-dp': [{ src: 'data:...', ts: 't' }] },
    }
    const p = toPayload(assessment)
    expect(p.equipment).toEqual([{ id: 'ahu-1' }])
    expect(p.floorPlan).toEqual({ url: 'fp' })
    expect(p.sensorData).toEqual({ co2: 600 })
    expect(p.labResults).toEqual({ rows: 2 })
    expect(p.standardsManifest).toEqual({ v: '2026-05' })
    expect(p.ver).toBe('6.0.0')
    expect('photos' in p).toBe(false)
  })
})

describe('fromCloudRow — payload preference (lossless restore)', () => {
  function payloadRow() {
    return {
      id: 'A-1',
      status: 'complete',
      // Flattened columns are still written, but payload wins:
      zone_scores: [{ zn: 'stale' }],
      photos: { 'z0-dp': [{ src: 'data:img', ts: 't' }] },
      updated_at: '2026-05-27T12:00:00Z',
      payload: {
        id: 'A-1', status: 'complete',
        building: { fn: 'One Lonely Plaza' },
        zones: [{ zn: 'Zone A' }],
        zoneScores: [{ zn: 'Zone A', tot: 62 }],
        comp: { tot: 62, risk: 'MODERATE' },
        recs: [{ id: 'r1' }],
        equipment: [{ id: 'ahu-1' }],
        floorPlan: { url: 'fp' },
        sensorData: { co2: 600 },
        labResults: { rows: 2 },
        standardsManifest: { v: '2026-05' },
        ver: '6.0.0',
      },
    }
  }

  it('restores the full payload, preserving fields the flat columns drop', () => {
    const out = fromCloudRow(payloadRow())
    expect(out.equipment).toEqual([{ id: 'ahu-1' }])
    expect(out.floorPlan).toEqual({ url: 'fp' })
    expect(out.sensorData).toEqual({ co2: 600 })
    expect(out.labResults).toEqual({ rows: 2 })
    expect(out.standardsManifest).toEqual({ v: '2026-05' })
    expect(out.ver).toBe('6.0.0')
    // App-shape fields the report view reads:
    expect(out.zoneScores).toEqual([{ zn: 'Zone A', tot: 62 }])
    expect(out.comp).toEqual({ tot: 62, risk: 'MODERATE' })
  })

  it('overlays the photos column and the row id/status/ts onto the payload', () => {
    const out = fromCloudRow(payloadRow())
    expect(out.photos).toEqual({ 'z0-dp': [{ src: 'data:img', ts: 't' }] })
    expect(out.id).toBe('A-1')
    expect(out.status).toBe('complete')
    expect(out.ts).toBe('2026-05-27T12:00:00Z')
  })

  it('falls back to the snake_case mapping when payload is null (legacy rows)', () => {
    const legacy = { id: 'L-1', status: 'complete', zone_scores: [{ zn: 'Z' }], composite: { tot: 50 }, payload: null }
    const out = fromCloudRow(legacy)
    expect(out.zoneScores).toEqual([{ zn: 'Z' }])
    expect(out.comp).toEqual({ tot: 50 })
  })
})

describe('fromCloudRow — calibration acknowledgement', () => {
  const ACK = {
    version: 1,
    items: ['IAQ meter: calibration date not recorded'],
    justification: 'Rental unit; vendor certificate to follow within five business days.',
    assessorName: 'Tsidi Tamakloe',
    assessorCredentials: 'CSP',
    acknowledgedAt: '2026-08-02T12:00:00.000Z',
  }

  it('normalizes the column onto the app shape', () => {
    const out = fromCloudRow({ ...cloudRow(), calibration_acknowledgement: ACK })
    expect(out.calibrationAcknowledgement).toEqual(ACK)
  })

  it('prefers the column over a stale copy inside the payload', () => {
    // The column is the authoritative record; the payload snapshot can
    // predate an acknowledgement written by a later client.
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: 't',
      calibration_acknowledgement: ACK,
      payload: { id: 'A-1', calibrationAcknowledgement: { ...ACK, justification: 'stale' } },
    })
    expect(out.calibrationAcknowledgement.justification).toBe(ACK.justification)
  })

  it('restores an acknowledgement carried only by the payload (pre-028 rows)', () => {
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: 't',
      payload: { id: 'A-1', calibrationAcknowledgement: ACK },
    })
    expect(out.calibrationAcknowledgement).toEqual(ACK)
  })

  it('does not clobber a local acknowledgement when the cloud row has none', () => {
    // fromCloudRow's output is spread over the local copy. An
    // unconditional null key would destroy the only record of a
    // professional judgement that had not synced up yet.
    const norm = fromCloudRow(cloudRow())
    expect('calibrationAcknowledgement' in norm).toBe(false)
    const merged = { ...{ id: 'A-1', calibrationAcknowledgement: ACK }, ...norm }
    expect(merged.calibrationAcknowledgement).toEqual(ACK)
  })

  it('drops a stored record with no reasoning rather than surfacing a hollow one', () => {
    const out = fromCloudRow({ ...cloudRow(), calibration_acknowledgement: { items: ['x'] } })
    expect('calibrationAcknowledgement' in out).toBe(false)
  })
})

describe('getRemoteAssessment — cloud-bypass fetch', () => {
  it('is exported and resolves null when no cloud is configured (offline-safe)', async () => {
    // jsdom has no VITE_SUPABASE_URL, so supabase is null → isOnline() false.
    // It must resolve null rather than throw, so openReport can fall through.
    expect(typeof Storage.getRemoteAssessment).toBe('function')
    await expect(Storage.getRemoteAssessment('rpt-x')).resolves.toBeNull()
  })
})

// ── Audit 2026-09 (M4 report date, M5 composite shape, H5 token) ────

const CENSUS = { count: 1, findings: { total: 2, attention: 1, bySeverity: { critical: 0, high: 1, medium: 0, low: 1 } }, confidence: 'High', partialData: false }

describe('fromCloudRow — report date (M4)', () => {
  it('prefers finalized_at over the payload ts and over updated_at', () => {
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: '2026-06-30T00:00:00Z', finalized_at: '2026-05-01T00:00:00Z',
      payload: { id: 'A-1', ts: '2026-05-02T00:00:00Z' },
    })
    expect(out.ts).toBe('2026-05-01T00:00:00Z')
  })

  it('falls back to the finalize timestamp the app stamped into the payload before updated_at', () => {
    // updated_at moves on every re-save; the finalize stamp does not.
    const out = fromCloudRow({ id: 'A-1', status: 'complete', updated_at: '2026-06-30T00:00:00Z', payload: { id: 'A-1', ts: '2026-05-02T00:00:00Z' } })
    expect(out.ts).toBe('2026-05-02T00:00:00Z')
  })

  it('legacy rows prefer finalized_at over updated_at', () => {
    const out = fromCloudRow({ ...cloudRow(), finalized_at: '2026-05-01T00:00:00Z' })
    expect(out.ts).toBe('2026-05-01T00:00:00Z')
  })

  it('exposes the cloud updated_at as cloudUpdatedAt (the next push\'s base) on both paths', () => {
    expect(fromCloudRow(cloudRow()).cloudUpdatedAt).toBe('2026-05-27T10:00:00Z')
    expect(fromCloudRow({ id: 'A-1', updated_at: 'T', payload: { id: 'A-1' } }).cloudUpdatedAt).toBe('T')
    expect('cloudUpdatedAt' in fromCloudRow({ id: 'A-1', payload: { id: 'A-1' } })).toBe(false)
  })
})

describe('composite shape (M5)', () => {
  it('engineMajor reads the engine from the payload version strings', () => {
    expect(engineMajor({ payload: { ver: '6.0.0-beta (Engine v3.0.0)' } })).toBe(3)
    expect(engineMajor({ payload: { standardsManifest: { engineVersion: '2.9.1' } } })).toBe(2)
    expect(engineMajor({ payload: {} })).toBeNull()
    expect(engineMajor({ composite: { tot: 50 } })).toBeNull()
  })

  it('isCensus tells the v3 census from the legacy score', () => {
    expect(isCensus(CENSUS)).toBe(true)
    expect(isCensus({ tot: 62, risk: 'MODERATE' })).toBe(false)
    expect(isCensus(null)).toBe(false)
  })

  it('toPayload writes the census to payload.census', () => {
    expect(toPayload({ id: 'A', comp: CENSUS }).census).toEqual(CENSUS)
    expect('census' in toPayload({ id: 'A', comp: { tot: 62 } })).toBe(false)
  })

  it('reads payload.census first and does not consult the composite column for a v3 record', () => {
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: 't',
      composite: { tot: 62, risk: 'MODERATE' },
      payload: { id: 'A-1', ver: '6.0.0-beta (Engine v3.0.0)', census: CENSUS },
    })
    expect(out.comp).toEqual(CENSUS)
    expect(out.composite).toEqual(CENSUS)
    expect('census' in out).toBe(false)
  })

  it('a v3 payload without a census leaves the legacy composite column alone', () => {
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: 't',
      composite: { tot: 62, risk: 'MODERATE' },
      payload: { id: 'A-1', ver: '6.0.0-beta (Engine v3.0.0)' },
    })
    expect(out.comp).toBeUndefined()
  })

  it('reads the composite column for a pre-v3 payload that has no comp of its own', () => {
    const out = fromCloudRow({
      id: 'A-1', status: 'complete', updated_at: 't',
      composite: { tot: 62, risk: 'MODERATE' },
      payload: { id: 'A-1', ver: '6.0.0-beta (Engine v2.9.0)' },
    })
    expect(out.comp).toEqual({ tot: 62, risk: 'MODERATE' })
  })

  it('a legacy row (no payload, unknown engine) still maps the composite column', () => {
    expect(fromCloudRow(cloudRow()).comp).toEqual({ tot: 62, risk: 'MODERATE' })
  })
})

describe('toAssessmentRow — wire shape', () => {
  const report = { id: 'rpt-1', status: 'complete', ts: '2026-05-01T00:00:00Z', building: { fn: 'X' }, zones: [], photos: {}, comp: CENSUS, assessmentUid: 'u', cloudUpdatedAt: 'T1' }

  it('never writes composite; the census rides in payload.census', () => {
    const row = toAssessmentRow(report, 'user-1')
    expect('composite' in row).toBe(false)
    expect(row.payload.census).toEqual(CENSUS)
  })

  it('writes finalized_at and base_updated_at', () => {
    const row = toAssessmentRow(report, 'user-1')
    expect(row.finalized_at).toBe('2026-05-01T00:00:00Z')
    expect(row.base_updated_at).toBe('T1')
    expect(toAssessmentRow({ ...report, status: 'draft', reportStatus: 'draft' }, 'user-1').finalized_at).toBeNull()
    expect(toAssessmentRow({ ...report, cloudUpdatedAt: undefined }, 'user-1').base_updated_at).toBeNull()
  })

  it('strips per-device bookkeeping from the payload', () => {
    const row = toAssessmentRow({ ...report, _photosPending: true }, 'user-1')
    expect('cloudUpdatedAt' in row.payload).toBe(false)
    expect('_photosPending' in row.payload).toBe(false)
    expect('photos' in row).toBe(false)
  })
})

describe('toProfileRow — server-owned columns are never sent', () => {
  it('drops plan and credits_remaining', () => {
    const row = toProfileRow('u-1', { name: 'J', plan: 'pro', credits_remaining: 9, email_preferences: { a: true } })
    expect('plan' in row).toBe(false)
    expect('credits_remaining' in row).toBe(false)
    expect(row.email_preferences).toEqual({ a: true })
    expect(row.id).toBe('u-1')
  })
})

describe('helpers', () => {
  it('missingColumnName parses both Postgres and PostgREST messages', () => {
    expect(missingColumnName({ message: 'column "finalized_at" of relation "assessments" does not exist' })).toBe('finalized_at')
    expect(missingColumnName({ message: 'column assessments.finalized_at does not exist' })).toBe('finalized_at')
    expect(missingColumnName({ message: "Could not find the 'payload' column of 'assessments' in the schema cache" })).toBe('payload')
    expect(missingColumnName({ message: 'permission denied' })).toBeNull()
  })

  it('deriveProfileName prefers metadata, then the email local-part', () => {
    expect(deriveProfileName({ user_metadata: { name: ' Jane ' } }, 'j@x.com')).toBe('Jane')
    expect(deriveProfileName({ user_metadata: {} }, 'jane.doe@x.com')).toBe('jane.doe')
    expect(deriveProfileName({ email: 'bob@x.com' }, '')).toBe('bob')
    expect(deriveProfileName(null, '')).toBe('New user')
  })

  it('indexEntryFromRow maps findings from the payload (no findings/attention columns exist)', () => {
    const e = indexEntryFromRow({ id: 'rpt-1', status: 'complete', facility_name: 'X', updated_at: 'U', finalized_at: 'F', payload: { census: CENSUS } })
    expect(e).toMatchObject({ id: 'rpt-1', ts: 'F', facility: 'X', findings: 2, attention: 1 })
    const zs = [{ cats: [{ l: 'Air', r: [{ sev: 'high' }, { sev: 'pass' }] }] }]
    const e2 = indexEntryFromRow({ id: 'rpt-2', status: 'complete', updated_at: 'U', payload: { zoneScores: zs } })
    expect(e2.findings).toBe(1)
    expect(e2.worstSeverity).toBe('high')
    expect(e2.ts).toBe('U')
  })
})
